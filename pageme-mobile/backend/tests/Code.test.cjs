const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeRange {
  constructor(sheet, row, column, rowCount = 1, columnCount = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rowCount = rowCount;
    this.columnCount = columnCount;
  }
  getValue() { return this.getValues()[0][0]; }
  setValue(value) { return this.setValues([[value]]); }
  getValues() {
    return Array.from({ length: this.rowCount }, (_, rowOffset) =>
      Array.from({ length: this.columnCount }, (_, columnOffset) =>
        this.sheet.rows[this.row - 1 + rowOffset]?.[this.column - 1 + columnOffset] ?? ''));
  }
  setValues(values) {
    for (let rowOffset = 0; rowOffset < this.rowCount; rowOffset++) {
      const rowIndex = this.row - 1 + rowOffset;
      while (this.sheet.rows.length <= rowIndex) this.sheet.rows.push([]);
      for (let columnOffset = 0; columnOffset < this.columnCount; columnOffset++) {
        this.sheet.rows[rowIndex][this.column - 1 + columnOffset] = values[rowOffset][columnOffset];
      }
    }
    return this;
  }
}

class FakeSheet {
  constructor(name, rows = []) {
    this.name = name;
    this.rows = rows.map(row => row.slice());
  }
  appendRow(row) { this.rows.push(row.slice()); }
  deleteRow(rowNumber) { this.rows.splice(rowNumber - 1, 1); }
  getLastRow() { return this.rows.length; }
  getDataRange() {
    const width = Math.max(1, ...this.rows.map(row => row.length));
    return new FakeRange(this, 1, 1, Math.max(1, this.rows.length), width);
  }
  getRange(row, column, rowCount = 1, columnCount = 1) {
    return new FakeRange(this, row, column, rowCount, columnCount);
  }
}

class FakeSpreadsheet {
  constructor(userRows) {
    this.sheets = [new FakeSheet('Users', userRows)];
  }
  getSheets() { return this.sheets; }
  getSheetByName(name) { return this.sheets.find(sheet => sheet.name === name) || null; }
  insertSheet(name) {
    const sheet = new FakeSheet(name);
    this.sheets.push(sheet);
    return sheet;
  }
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('base64url');
}

function createHarness() {
  const userRows = [
    ['UCN', 'Name', 'Email', 'Occupation', 'Status', 'Country', 'Created At', 'Settings', 'Token Hash'],
    ['AYO-001', 'Ayodele', 'ayo@example.com', 'Designer', 'Focus', 'Nigeria', new Date(), '', tokenHash('token-a')],
    ['LAG-002', 'Lagos', 'lag@example.com', 'Student', 'Study', 'Nigeria', new Date(), '', tokenHash('token-b')],
  ];
  const spreadsheet = new FakeSpreadsheet(userRows);
  const cache = new Map();
  const properties = new Map();
  const sentEmails = [];
  let uuid = 0;

  const context = vm.createContext({
    console: { error() {}, warn() {}, log() {} },
    Date,
    JSON,
    Math,
    Number,
    Object,
    Set,
    String,
    encodeURIComponent,
    isNaN,
    LockService: {
      getScriptLock: () => ({ waitLock() {}, releaseLock() {} }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: key => cache.get(key) ?? null,
        put: (key, value) => cache.set(key, String(value)),
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: key => properties.get(key) ?? null,
        setProperty: (key, value) => properties.set(key, String(value)),
      }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      openById: id => {
        if (id !== 'pageme-spreadsheet') throw new Error('unknown spreadsheet');
        return spreadsheet;
      },
    },
    ScriptApp: { getOAuthToken: () => 'short-lived-script-oauth-token' },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: text => ({ text, setMimeType() { return this; } }),
    },
    MailApp: { sendEmail: (...args) => sentEmails.push(args) },
    UrlFetchApp: { fetch: () => { throw new Error('network disabled in test'); } },
    Utilities: {
      Charset: { UTF_8: 'utf8' },
      DigestAlgorithm: { SHA_256: 'sha256' },
      getUuid: () => `uuid-${++uuid}`,
      computeDigest: (_algorithm, value) => [...crypto.createHash('sha256').update(String(value)).digest()],
      computeRsaSha256Signature: () => [],
      base64EncodeWebSafe: value => Buffer.from(Array.isArray(value) ? value : String(value)).toString('base64url'),
    },
  });

  const source = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  vm.runInContext(source, context, { filename: 'Code.gs' });
  const request = payload => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(payload) } }).text);
  return { context, properties, request, sentEmails, spreadsheet };
}

function sendPayload(overrides = {}) {
  return {
    action: 'sendMessage', fromUcn: 'AYO-001', toUcn: 'LAG-002',
    sessionToken: 'token-a', clientMessageId: 'AYO-001:client-0001',
    message: 'Meet at the library', type: 'text', ...overrides,
  };
}

function latestVerificationCode(harness) {
  const email = harness.sentEmails.at(-1);
  const match = String(email?.[2] || '').match(/\b(\d{6})\b/);
  assert.ok(match, 'verification email should contain a six-digit code');
  return match[1];
}

test('authenticated send stores one message and client retries are idempotent', () => {
  const harness = createHarness();
  const first = harness.request(sendPayload());
  const second = harness.request(sendPayload());

  assert.equal(first.status, 'success');
  assert.equal(first.queued, true);
  assert.equal(first.emailRelayed, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.message.id, first.message.id);
  assert.equal(harness.spreadsheet.getSheetByName('PageMe Messages').rows.length, 2);
  assert.equal(harness.sentEmails.length, 0);
});

test('FCM defaults to short-lived Apps Script OAuth instead of a stored private key', () => {
  const harness = createHarness();
  harness.properties.set('PAGEME_FCM_PROJECT_ID', 'pageme-test-project');
  const credentials = harness.context.getFcmCredentials();
  assert.equal(credentials.projectId, 'pageme-test-project');
  assert.equal(credentials.authMode, 'script');
  assert.equal(harness.context.getFcmAccessToken(credentials), 'short-lived-script-oauth-token');
});

test('registration requires possession of the submitted email before creating an account', () => {
  const harness = createHarness();
  const requested = harness.request({
    action: 'requestRegistration', name: 'New User', email: 'new@example.com',
    occupation: 'Teacher', status: 'Focus', country: 'Nigeria', prefix: 'NEW',
  });
  assert.equal(requested.verificationRequired, true);
  assert.equal(harness.spreadsheet.getSheetByName('Users').rows.length, 3);
  const code = latestVerificationCode(harness);
  const wrongCode = code === '000000' ? '999999' : '000000';

  const wrong = harness.request({
    action: 'verifyRegistration', challengeId: requested.challengeId, code: wrongCode,
  });
  assert.equal(wrong.code, 'INVALID_VERIFICATION_CODE');

  const verified = harness.request({
    action: 'verifyRegistration', challengeId: requested.challengeId, code,
  });
  assert.equal(verified.status, 'success');
  assert.equal(verified.capCode, 'NEW-001');
  assert.ok(verified.sessionToken);
  const sent = harness.request({
    action: 'sendMessage', fromUcn: verified.capCode, toUcn: 'LAG-002',
    sessionToken: verified.sessionToken, clientMessageId: 'NEW-001:verified-0001',
    message: 'Verified sender', type: 'text',
  });
  assert.equal(sent.status, 'success');
});

test('Play review account uses reusable private credentials without sending email', () => {
  const harness = createHarness();
  harness.properties.set('PAGEME_PLAY_REVIEW_EMAIL', 'play-review@example.com');
  harness.properties.set('PAGEME_PLAY_REVIEW_UCN', 'REV-001');
  harness.properties.set('PAGEME_PLAY_REVIEW_CODE', '481729');

  const seeded = harness.context.ensurePlayReviewAccount();
  assert.equal(seeded.status, 'created');
  assert.equal(seeded.ucn, 'REV-001');

  const requested = harness.request({
    action: 'requestRestore', capCode: 'REV-001', email: 'play-review@example.com',
  });
  assert.equal(requested.status, 'success');
  assert.equal(requested.verificationRequired, true);
  assert.equal(harness.sentEmails.length, 0);

  const restored = harness.request({
    action: 'verifyRestore', challengeId: requested.challengeId, code: '481729',
  });
  assert.equal(restored.status, 'success');
  assert.equal(restored.capCode, 'REV-001');
  assert.ok(restored.sessionToken);
});

test('verification challenges expire and cannot be reused', () => {
  const harness = createHarness();
  const requested = harness.request({
    action: 'requestRestore', capCode: 'AYO-001', email: 'ayo@example.com',
  });
  const code = latestVerificationCode(harness);
  const challenges = harness.spreadsheet.getSheetByName('PageMe Challenges');
  challenges.rows[1][7] = new Date(Date.now() - 1000);

  const expired = harness.request({
    action: 'verifyRestore', challengeId: requested.challengeId, code,
  });
  assert.equal(expired.code, 'CHALLENGE_EXPIRED');
  assert.equal(challenges.rows.length, 1);
  const reused = harness.request({
    action: 'verifyRestore', challengeId: requested.challengeId, code,
  });
  assert.equal(reused.code, 'INVALID_CHALLENGE');
});

test('verification timestamps are stored without spreadsheet timezone ambiguity', () => {
  const harness = createHarness();
  const requested = harness.request({
    action: 'requestRestore', capCode: 'AYO-001', email: 'ayo@example.com',
  });
  const challenges = harness.spreadsheet.getSheetByName('PageMe Challenges');
  assert.match(challenges.rows[1][6], /^\d{4}-\d{2}-\d{2}T/);
  assert.match(challenges.rows[1][7], /^\d{4}-\d{2}-\d{2}T/);

  const restored = harness.request({
    action: 'verifyRestore', challengeId: requested.challengeId,
    code: latestVerificationCode(harness),
  });
  assert.equal(restored.status, 'success');
});

test('Google Sheets numeric date serials are interpreted as absolute dates', () => {
  const harness = createHarness();
  const requested = harness.request({
    action: 'requestRestore', capCode: 'AYO-001', email: 'ayo@example.com',
  });
  const challenges = harness.spreadsheet.getSheetByName('PageMe Challenges');
  const expiresAt = new Date(challenges.rows[1][7]);
  challenges.rows[1][7] = expiresAt.getTime() / 86400000 + 25569;

  const restored = harness.request({
    action: 'verifyRestore', challengeId: requested.challengeId,
    code: latestVerificationCode(harness),
  });
  assert.equal(restored.status, 'success');
});

test('an incompatible challenge table is reset before issuing a new code', () => {
  const harness = createHarness();
  const challenges = harness.spreadsheet.insertSheet('PageMe Challenges');
  challenges.appendRow(['Challenge ID', 'Email', 'Expires At']);
  challenges.appendRow(['stale-challenge', 'old@example.com', new Date(Date.now() + 600000)]);

  const requested = harness.request({
    action: 'requestRestore', capCode: 'AYO-001', email: 'ayo@example.com',
  });
  assert.equal(requested.status, 'success');
  assert.deepEqual([...challenges.rows[0]], [
    'Challenge ID', 'Mode', 'Email', 'UCN', 'Code Hash', 'Payload',
    'Created At', 'Expires At', 'Attempts',
  ]);
  assert.equal(challenges.rows.length, 2);
  assert.equal(challenges.rows[1][0], requested.challengeId);
});

test('repeating an expired challenge does not consume a second rate limit', () => {
  const harness = createHarness();
  const requested = harness.request({
    action: 'requestRestore', capCode: 'AYO-001', email: 'ayo@example.com',
  });
  const challenges = harness.spreadsheet.getSheetByName('PageMe Challenges');
  challenges.rows[1][7] = new Date(Date.now() - 1000).toISOString();

  const first = harness.request({
    action: 'verifyRestore', challengeId: requested.challengeId, code: '000000',
  });
  assert.equal(first.code, 'CHALLENGE_EXPIRED');
  for (let attempt = 0; attempt < 15; attempt++) {
    const repeated = harness.request({
      action: 'verifyRestore', challengeId: requested.challengeId, code: '000000',
    });
    assert.equal(repeated.code, 'INVALID_CHALLENGE');
  }
});

test('verification challenges lock and are removed on the fifth incorrect code', () => {
  const harness = createHarness();
  const requested = harness.request({
    action: 'requestRestore', capCode: 'AYO-001', email: 'ayo@example.com',
  });
  const code = latestVerificationCode(harness);
  const wrongCode = code === '000000' ? '999999' : '000000';
  let response;
  for (let attempt = 1; attempt <= 5; attempt++) {
    response = harness.request({
      action: 'verifyRestore', challengeId: requested.challengeId, code: wrongCode,
    });
    assert.equal(response.code, attempt === 5 ? 'CHALLENGE_LOCKED' : 'INVALID_VERIFICATION_CODE');
  }
  const challenges = harness.spreadsheet.getSheetByName('PageMe Challenges');
  assert.equal(challenges.rows.length, 1);
  const correctAfterLock = harness.request({
    action: 'verifyRestore', challengeId: requested.challengeId, code,
  });
  assert.equal(correctAfterLock.code, 'INVALID_CHALLENGE');
});

test('a standalone deployment can use an explicitly configured private spreadsheet', () => {
  const harness = createHarness();
  harness.properties.set('PAGEME_SPREADSHEET_ID', 'pageme-spreadsheet');
  const response = harness.request(sendPayload());
  assert.equal(response.status, 'success');
  assert.equal(harness.spreadsheet.getSheetByName('PageMe Messages').rows.length, 2);
});

test('an idempotency key cannot be reused for different message content', () => {
  const harness = createHarness();
  harness.request(sendPayload());
  const conflict = harness.request(sendPayload({ message: 'Different content' }));
  assert.equal(conflict.status, 'error');
  assert.equal(conflict.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(harness.spreadsheet.getSheetByName('PageMe Messages').rows.length, 2);
});

test('sync pagination advances only through returned revisions', () => {
  const harness = createHarness();
  for (let index = 1; index <= 3; index++) {
    harness.request(sendPayload({
      clientMessageId: `AYO-001:client-000${index}`,
      message: `Message ${index}`,
    }));
  }
  const first = harness.request({
    action: 'syncMessages', capCode: 'LAG-002', sessionToken: 'token-b', afterRevision: 0, limit: 2,
  });
  const second = harness.request({
    action: 'syncMessages', capCode: 'LAG-002', sessionToken: 'token-b', afterRevision: first.cursor, limit: 2,
  });
  assert.equal(first.messages.length, 2);
  assert.equal(first.hasMore, true);
  assert.equal(second.messages.length, 1);
  assert.equal(second.hasMore, false);
  assert.deepEqual(
    [...first.messages, ...second.messages].map(message => message.message).sort(),
    ['Message 1', 'Message 2', 'Message 3'],
  );
});

test('offline messages become delivered on recipient sync and read after acknowledgement', () => {
  const harness = createHarness();
  const sent = harness.request(sendPayload());
  const received = harness.request({
    action: 'syncMessages', capCode: 'LAG-002', sessionToken: 'token-b', afterRevision: 0,
  });
  assert.equal(received.messages.length, 1);
  assert.equal(received.messages[0].id, sent.message.id);
  assert.ok(received.messages[0].deliveredAt);
  assert.equal(received.messages[0].readAt, '');

  const marked = harness.request({
    action: 'markRead', capCode: 'LAG-002', sessionToken: 'token-b', messageIds: [sent.message.id],
  });
  assert.equal(marked.updated, 1);
  const senderSync = harness.request({
    action: 'syncMessages', capCode: 'AYO-001', sessionToken: 'token-a', afterRevision: 0,
  });
  assert.ok(senderSync.messages[0].readAt);
});

test('two offline users exchange pages in both directions exactly once despite client retries', () => {
  const harness = createHarness();
  const aToB = sendPayload({
    clientMessageId: 'AYO-001:offline-a-0001', message: 'Page from A',
  });
  const bToA = {
    action: 'sendMessage', fromUcn: 'LAG-002', toUcn: 'AYO-001',
    sessionToken: 'token-b', clientMessageId: 'LAG-002:offline-b-0001',
    message: 'Page from B', type: 'text',
  };
  const firstA = harness.request(aToB);
  const retryA = harness.request(aToB);
  const firstB = harness.request(bToA);
  const retryB = harness.request(bToA);
  assert.equal(retryA.message.id, firstA.message.id);
  assert.equal(retryB.message.id, firstB.message.id);
  assert.equal(harness.spreadsheet.getSheetByName('PageMe Messages').rows.length, 3);

  const syncA = harness.request({
    action: 'syncMessages', capCode: 'AYO-001', sessionToken: 'token-a', afterRevision: 0,
  });
  const syncB = harness.request({
    action: 'syncMessages', capCode: 'LAG-002', sessionToken: 'token-b', afterRevision: 0,
  });
  assert.equal(syncA.messages.filter(message => message.id === firstB.message.id).length, 1);
  assert.equal(syncB.messages.filter(message => message.id === firstA.message.id).length, 1);

  const replayA = harness.request({
    action: 'syncMessages', capCode: 'AYO-001', sessionToken: 'token-a', afterRevision: syncA.cursor,
  });
  const replayB = harness.request({
    action: 'syncMessages', capCode: 'LAG-002', sessionToken: 'token-b', afterRevision: syncB.cursor,
  });
  assert.deepEqual(replayA.messages.map(message => message.id), [firstA.message.id]);
  assert.equal(replayB.messages.length, 0);
  const settledA = harness.request({
    action: 'syncMessages', capCode: 'AYO-001', sessionToken: 'token-a', afterRevision: replayA.cursor,
  });
  assert.equal(settledA.messages.length, 0);
});

test('clearing an inbox produces a recipient-only tombstone', () => {
  const harness = createHarness();
  const sent = harness.request(sendPayload());
  harness.request({ action: 'clearMessages', capCode: 'LAG-002', sessionToken: 'token-b' });

  const receiver = harness.request({ action: 'syncMessages', capCode: 'LAG-002', sessionToken: 'token-b', afterRevision: 0 });
  const sender = harness.request({ action: 'syncMessages', capCode: 'AYO-001', sessionToken: 'token-a', afterRevision: 0 });
  assert.equal(receiver.messages.find(message => message.id === sent.message.id).deleted, true);
  assert.equal(sender.messages.find(message => message.id === sent.message.id).deleted, false);
});

test('blocking prevents new pages without disclosing block state to the sender', () => {
  const harness = createHarness();
  const blocked = harness.request({
    action: 'blockUser', capCode: 'LAG-002', sessionToken: 'token-b', blockedUcn: 'AYO-001',
  });
  const sent = harness.request(sendPayload());
  assert.equal(blocked.blocked, true);
  assert.equal(sent.status, 'error');
  assert.equal(sent.code, 'RECIPIENT_UNAVAILABLE');
});

test('users can list and remove blocks, and reports can atomically block a sender', () => {
  const harness = createHarness();
  const sent = harness.request(sendPayload());
  const reported = harness.request({
    action: 'reportMessage', capCode: 'LAG-002', sessionToken: 'token-b',
    messageId: sent.message.id, reason: 'Unwanted page', blockSender: true,
  });
  assert.equal(reported.reported, true);
  assert.equal(reported.blocked, true);

  const listed = harness.request({
    action: 'listBlocks', capCode: 'LAG-002', sessionToken: 'token-b',
  });
  assert.deepEqual([...listed.blockedUcns], ['AYO-001']);

  const unblocked = harness.request({
    action: 'unblockUser', capCode: 'LAG-002', sessionToken: 'token-b', blockedUcn: 'AYO-001',
  });
  assert.equal(unblocked.blocked, false);
  const empty = harness.request({
    action: 'listBlocks', capCode: 'LAG-002', sessionToken: 'token-b',
  });
  assert.deepEqual([...empty.blockedUcns], []);
});

test('message actions reject missing or invalid sessions', () => {
  const harness = createHarness();
  const response = harness.request(sendPayload({ sessionToken: 'wrong-token' }));
  assert.equal(response.status, 'error');
  assert.equal(response.code, 'AUTH_REQUIRED');
  assert.equal(harness.spreadsheet.getSheetByName('PageMe Messages'), null);
});

test('restoring an account creates a second session without signing out the first device', () => {
  const harness = createHarness();
  const firstDevice = harness.request(sendPayload());
  assert.equal(firstDevice.status, 'success');

  const requested = harness.request({
    action: 'requestRestore', capCode: 'AYO-001', email: 'ayo@example.com',
  });
  assert.equal(requested.verificationRequired, true);
  const restored = harness.request({
    action: 'verifyRestore', challengeId: requested.challengeId,
    code: latestVerificationCode(harness),
  });
  assert.equal(restored.status, 'success');
  assert.ok(restored.sessionToken);
  assert.ok(restored.sessionExpiresAt);

  const oldSessionStillWorks = harness.request(sendPayload({
    clientMessageId: 'AYO-001:device-one-0002', message: 'From device one',
  }));
  const newSessionWorks = harness.request(sendPayload({
    sessionToken: restored.sessionToken,
    clientMessageId: 'AYO-001:device-two-0001', message: 'From device two',
  }));
  assert.equal(oldSessionStillWorks.status, 'success');
  assert.equal(newSessionWorks.status, 'success');

  const sessions = harness.spreadsheet.getSheetByName('PageMe Sessions').rows
    .filter(row => row[1] === 'AYO-001');
  assert.equal(sessions.length, 2);
});

test('expired sessions fail closed and cannot fall back to the legacy token column', () => {
  const harness = createHarness();
  assert.equal(harness.request(sendPayload()).status, 'success');
  const sessions = harness.spreadsheet.getSheetByName('PageMe Sessions');
  const active = sessions.rows.find(row => row[1] === 'AYO-001');
  active[6] = new Date(Date.now() - 1000);

  const expired = harness.request(sendPayload({
    clientMessageId: 'AYO-001:expired-0002', message: 'Must not send',
  }));
  assert.equal(expired.status, 'error');
  assert.equal(expired.code, 'AUTH_REQUIRED');
  const user = harness.spreadsheet.getSheetByName('Users').rows.find(row => row[0] === 'AYO-001');
  assert.equal(user[8], '');
});

test('account deletion requires confirmation and removes server-side account data', () => {
  const harness = createHarness();
  harness.request(sendPayload());
  harness.request({
    action: 'registerDevice', capCode: 'AYO-001', sessionToken: 'token-a',
    deviceId: 'device-a', pushToken: 'push-token-a', platform: 'android',
  });
  const refused = harness.request({
    action: 'deleteAccount', capCode: 'AYO-001', sessionToken: 'token-a', confirmation: 'LAG-002',
  });
  assert.equal(refused.code, 'CONFIRMATION_REQUIRED');

  const deleted = harness.request({
    action: 'deleteAccount', capCode: 'AYO-001', sessionToken: 'token-a', confirmation: 'AYO-001',
  });
  assert.equal(deleted.deleted, true);
  const tombstone = harness.spreadsheet.getSheetByName('Users').rows.find(row => row[0] === 'AYO-001');
  assert.equal(tombstone[1], '');
  assert.equal(tombstone[2], '');
  assert.equal(tombstone[4], 'DELETED');
  assert.equal(tombstone[8], '');
  assert.equal(harness.spreadsheet.getSheetByName('PageMe Messages').rows.length, 1);
  assert.equal(harness.spreadsheet.getSheetByName('PageMe Devices').rows.length, 1);
  assert.equal(harness.spreadsheet.getSheetByName('PageMe Sessions').rows.length, 1);
});

test('status links are anonymous, hashed at rest, and resolve to a UCN only after authentication', () => {
  const harness = createHarness();
  const created = harness.request({
    action: 'createStatusLink', capCode: 'AYO-001', sessionToken: 'token-a',
    context: 'activation',
  });
  assert.equal(created.status, 'success');
  assert.match(created.token, /^[A-Za-z0-9_-]{32,100}$/);
  assert.equal(created.url, `https://ayodelemartinsabiwo.github.io/pageme/page.html?s=${created.token}`);

  const links = harness.spreadsheet.getSheetByName('PageMe Status Links');
  assert.equal(links.rows.length, 2);
  assert.notEqual(links.rows[1][0], created.token);
  assert.equal(links.rows[1].join('|').includes(created.token), false);
  assert.match(links.rows[1][1], /^user-/);

  const publicView = harness.request({ action: 'resolveStatusLinkPublic', token: created.token });
  assert.equal(publicView.active, true);
  assert.equal(publicView.context, 'activation');
  assert.equal('toUcn' in publicView, false);
  assert.equal('name' in publicView, false);
  assert.equal('email' in publicView, false);
  assert.equal(links.rows[1][8], 1);

  const signedInView = harness.request({
    action: 'resolveStatusLinkAuthenticated', token: created.token,
    capCode: 'LAG-002', sessionToken: 'token-b',
  });
  assert.equal(signedInView.status, 'success');
  assert.equal(signedInView.toUcn, 'AYO-001');
});

test('focus links use the focus end, reject unsafe expiry, and stop resolving after revocation', () => {
  const harness = createHarness();
  const focusEndsAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const created = harness.request({
    action: 'createStatusLink', capCode: 'AYO-001', sessionToken: 'token-a',
    context: 'focus', focusEndsAt,
  });
  assert.equal(created.status, 'success');
  assert.equal(created.focusEndsAt, focusEndsAt);
  assert.equal(created.expiresAt, focusEndsAt);

  const tooLong = harness.request({
    action: 'createStatusLink', capCode: 'AYO-001', sessionToken: 'token-a',
    context: 'focus', focusEndsAt: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
  });
  assert.equal(tooLong.code, 'INVALID_STATUS_EXPIRY');

  const revoked = harness.request({
    action: 'revokeStatusLink', capCode: 'AYO-001', sessionToken: 'token-a',
    token: created.token,
  });
  assert.equal(revoked.revoked, 1);
  const expired = harness.request({ action: 'resolveStatusLinkPublic', token: created.token });
  assert.equal(expired.active, false);
  assert.equal(expired.linkState, 'expired');
  const authenticated = harness.request({
    action: 'resolveStatusLinkAuthenticated', token: created.token,
    capCode: 'LAG-002', sessionToken: 'token-b',
  });
  assert.equal(authenticated.code, 'STATUS_LINK_EXPIRED');
});

test('product events accept only the content-free allowlist and account deletion removes status data', () => {
  const harness = createHarness();
  const created = harness.request({
    action: 'createStatusLink', capCode: 'AYO-001', sessionToken: 'token-a', context: 'manual',
  });
  const recorded = harness.request({
    action: 'recordProductEvent', capCode: 'AYO-001', sessionToken: 'token-a',
    event: 'share_sheet_opened', context: 'manual', statusToken: created.token,
    message: 'this must never be stored', email: 'private@example.com',
  });
  assert.equal(recorded.recorded, true);
  const rejected = harness.request({
    action: 'recordProductEvent', capCode: 'AYO-001', sessionToken: 'token-a',
    event: 'message_body', context: 'private text',
  });
  assert.equal(rejected.code, 'INVALID_PRODUCT_EVENT');

  const events = harness.spreadsheet.getSheetByName('PageMe Product Events');
  assert.equal(events.rows.flat().includes('this must never be stored'), false);
  assert.equal(events.rows.flat().includes('private@example.com'), false);
  assert.ok(events.rows.some(row => row[2] === 'share_sheet_opened'));

  const deleted = harness.request({
    action: 'deleteAccount', capCode: 'AYO-001', sessionToken: 'token-a', confirmation: 'AYO-001',
  });
  assert.equal(deleted.deleted, true);
  assert.equal(harness.spreadsheet.getSheetByName('PageMe Status Links').rows.length, 1);
  assert.equal(harness.spreadsheet.getSheetByName('PageMe Product Events').rows.length, 1);
});

test('the backend kill switch disables status links without affecting messaging', () => {
  const harness = createHarness();
  harness.properties.set('PAGEME_STATUS_LINKS_ENABLED', 'false');
  const unavailable = harness.request({
    action: 'createStatusLink', capCode: 'AYO-001', sessionToken: 'token-a', context: 'activation',
  });
  assert.equal(unavailable.code, 'FEATURE_UNAVAILABLE');
  assert.equal(harness.request(sendPayload()).status, 'success');
});
