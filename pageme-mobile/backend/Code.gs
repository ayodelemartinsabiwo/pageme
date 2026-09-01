const COL = Object.freeze({
  UCN: 1, NAME: 2, EMAIL: 3, OCCUPATION: 4, STATUS: 5,
  COUNTRY: 6, CREATED_AT: 7, SETTINGS: 8, TOKEN_HASH: 9, USER_ID: 10,
});
const USER_HEADERS = Object.freeze([
  'UCN', 'Name', 'Email', 'Occupation', 'Status', 'Country', 'Created At',
  'Settings', 'Token Hash', 'User ID',
]);

const MESSAGE_HEADERS = Object.freeze([
  'Message ID', 'Client Message ID', 'From UCN', 'To UCN', 'Message', 'Type',
  'Created At', 'Delivered At', 'Read At', 'Sender Deleted At', 'Recipient Deleted At',
  'Reported At', 'Report Reason', 'Reply To ID', 'Revision',
]);
const MC = Object.freeze({
  ID: 1, CLIENT_ID: 2, FROM: 3, TO: 4, BODY: 5, TYPE: 6,
  CREATED_AT: 7, DELIVERED_AT: 8, READ_AT: 9, FROM_DELETED_AT: 10,
  TO_DELETED_AT: 11, REPORTED_AT: 12, REPORT_REASON: 13, REPLY_TO_ID: 14,
  REVISION: 15,
});
const DEVICE_HEADERS = Object.freeze(['UCN', 'Device ID', 'Push Token', 'Platform', 'Updated At', 'Active']);
const SESSION_HEADERS = Object.freeze([
  'Session ID', 'UCN', 'Token Hash', 'Device ID', 'Created At', 'Last Used At',
  'Expires At', 'Revoked At',
]);
const SC = Object.freeze({
  ID: 1, UCN: 2, TOKEN_HASH: 3, DEVICE_ID: 4, CREATED_AT: 5,
  LAST_USED_AT: 6, EXPIRES_AT: 7, REVOKED_AT: 8,
});
const CHALLENGE_HEADERS = Object.freeze([
  'Challenge ID', 'Mode', 'Email', 'UCN', 'Code Hash', 'Payload',
  'Created At', 'Expires At', 'Attempts',
]);
const CC = Object.freeze({
  ID: 1, MODE: 2, EMAIL: 3, UCN: 4, CODE_HASH: 5, PAYLOAD: 6,
  CREATED_AT: 7, EXPIRES_AT: 8, ATTEMPTS: 9,
});
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const CHALLENGE_MAX_ATTEMPTS = 5;
const BLOCK_HEADERS = Object.freeze(['Blocker UCN', 'Blocked UCN', 'Created At']);
const REPORT_HEADERS = Object.freeze(['Report ID', 'Reporter UCN', 'Message ID', 'Reported UCN', 'Reason', 'Created At']);
const STATUS_LINK_HEADERS = Object.freeze([
  'Token Hash', 'Owner User ID', 'Owner UCN', 'Context', 'Created At',
  'Expires At', 'Focus Ends At', 'Revoked At', 'Open Count', 'Last Opened At',
]);
const SLC = Object.freeze({
  TOKEN_HASH: 1, USER_ID: 2, UCN: 3, CONTEXT: 4, CREATED_AT: 5,
  EXPIRES_AT: 6, FOCUS_ENDS_AT: 7, REVOKED_AT: 8, OPEN_COUNT: 9,
  LAST_OPENED_AT: 10,
});
const PRODUCT_EVENT_HEADERS = Object.freeze([
  'Event ID', 'User ID', 'Event', 'Context', 'Created At', 'Status Link Prefix',
]);
const ALLOWED_PRODUCT_EVENTS = Object.freeze([
  'activation_completed', 'focus_started', 'focus_completed', 'focus_cancelled',
  'status_link_created', 'share_sheet_opened', 'status_link_opened',
  'status_composer_opened', 'status_page_sent',
]);
const STATUS_LINK_DEFAULT_TTL_MS = 4 * 60 * 60 * 1000;
const STATUS_LINK_MAX_TTL_MS = 24 * 60 * 60 * 1000;
const PRODUCT_EVENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const FCM_AUDIENCE = 'https://oauth2.googleapis.com/token';

function doGet() {
  return jsonResponse({ status: 'success', service: 'PageMe', version: 4 });
}

function doPost(e) {
  try {
    const data = JSON.parse(e && e.postData ? e.postData.contents : '{}');
    const action = sanitize(data.action, 40) || 'register';
    if (action === 'requestRegistration') return requestRegistration(data);
    if (action === 'verifyRegistration') return verifyRegistration(data);
    if (action === 'requestRestore') return requestRestore(data);
    if (action === 'verifyRestore') return verifyRestore(data);
    if (action === 'register') return allowLegacyAuth() ? registerUser(data) : requestRegistration(data);
    if (action === 'restore') return allowLegacyAuth() ? restoreUser(data) : requestRestore(data);
    if (action === 'saveSettings') return saveSettings(data);
    if (action === 'page' || action === 'sendMessage') return sendMessage(data);
    if (action === 'syncMessages') return syncMessages(data);
    if (action === 'markRead') return markMessagesRead(data);
    if (action === 'clearMessages') return clearMessages(data);
    if (action === 'registerDevice') return registerDevice(data);
    if (action === 'listBlocks') return listBlocks(data);
    if (action === 'blockUser') return setBlock(data, true);
    if (action === 'unblockUser') return setBlock(data, false);
    if (action === 'reportMessage') return reportMessage(data);
    if (action === 'createStatusLink') return createStatusLink(data);
    if (action === 'resolveStatusLinkPublic') return resolveStatusLinkPublic(data);
    if (action === 'resolveStatusLinkAuthenticated') return resolveStatusLinkAuthenticated(data);
    if (action === 'revokeStatusLink') return revokeStatusLink(data);
    if (action === 'recordProductEvent') return recordProductEvent(data);
    if (action === 'deleteAccount') return deleteAccount(data);
    return errorResponse('Unsupported action.', 'UNSUPPORTED_ACTION');
  } catch (error) {
    const code = error && error.message === 'RATE_LIMIT' ? 'RATE_LIMIT' : 'SERVER_ERROR';
    const message = code === 'RATE_LIMIT'
      ? 'Too many requests. Please wait and try again.'
      : 'The PageMe service could not process this request.';
    console.error('PageMe request failed: ' + sanitize(error && error.name, 60));
    return errorResponse(message, code);
  }
}

function registerUser(data) {
  const name = sanitize(data.name, 100);
  const email = sanitize(data.email, 200).toLowerCase();
  const occupation = sanitize(data.occupation, 100);
  const status = sanitize(data.status, 50);
  const country = sanitize(data.country, 100);
  const prefix = sanitize(data.prefix, 3).toUpperCase();
  if (!name || !email || !occupation || !country || !/^[A-Z]{3}$/.test(prefix)) {
    return errorResponse('Required registration details are missing or invalid.', 'INVALID_REGISTRATION');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errorResponse('Invalid email address.', 'INVALID_EMAIL');
  enforceAttemptLimit('register:' + email, 5, 3600);

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = getUserSheet();
    const rows = sheet.getDataRange().getValues();
    let maxSequence = 0;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][COL.EMAIL - 1]).trim().toLowerCase() === email) {
        return jsonResponse({ status: 'error', code: 'EMAIL_EXISTS', error: 'This email is already registered.' });
      }
      const existing = String(rows[i][COL.UCN - 1]).trim().toUpperCase();
      if (existing.indexOf(prefix + '-') === 0) {
        const sequence = Number(existing.split('-').pop());
        if (Number.isFinite(sequence)) maxSequence = Math.max(maxSequence, sequence);
      }
    }

    const capCode = prefix + '-' + String(maxSequence + 1).padStart(3, '0');
    const sessionToken = createSessionToken();
    sheet.appendRow([capCode, name, email, occupation, status, country, new Date(), '', '', createUserId()]);
    const session = issueSession(capCode, sessionToken);
    sendRegistrationEmail(email, name, capCode);
    return jsonResponse({
      status: 'success', capCode: capCode, sessionToken: sessionToken,
      sessionExpiresAt: session.expiresAt.toISOString(),
    });
  } finally {
    lock.releaseLock();
  }
}

function restoreUser(data) {
  const capCode = normalizeUcn(data.capCode);
  const email = sanitize(data.email, 200).toLowerCase();
  if (!capCode || !email) return errorResponse('UCN and email are required.', 'INVALID_RESTORE');
  enforceAttemptLimit('restore:' + capCode + ':' + email, 8, 600);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getUserSheet();
    const match = findUser(sheet, capCode, email);
    if (!match) return errorResponse('No matching account was found.', 'ACCOUNT_NOT_FOUND');
    if (isDeletedUser(match)) return errorResponse('No matching account was found.', 'ACCOUNT_NOT_FOUND');
    const sessionToken = createSessionToken();
    const session = issueSession(capCode, sessionToken);
    sheet.getRange(match.rowNumber, COL.TOKEN_HASH).setValue('');
    let settings = null;
    try {
      settings = match.values[COL.SETTINGS - 1] ? JSON.parse(String(match.values[COL.SETTINGS - 1])) : null;
    } catch (_) {}
    return jsonResponse({
      status: 'success', capCode: match.values[COL.UCN - 1],
      name: match.values[COL.NAME - 1], email: match.values[COL.EMAIL - 1],
      profile: {
        occupation: match.values[COL.OCCUPATION - 1],
        status: match.values[COL.STATUS - 1], country: match.values[COL.COUNTRY - 1],
      },
      settings: settings, sessionToken: sessionToken,
      sessionExpiresAt: session.expiresAt.toISOString(),
    });
  } finally {
    lock.releaseLock();
  }
}

function requestRegistration(data) {
  const registration = normalizedRegistration(data);
  if (!registration.valid) return errorResponse(registration.error, registration.code);
  enforceAttemptLimit('register-code:' + registration.email, 5, 3600);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const rows = getUserSheet().getDataRange().getValues();
    if (rows.slice(1).some(row => String(row[COL.EMAIL - 1]).trim().toLowerCase() === registration.email)) {
      return errorResponse('This email is already registered.', 'EMAIL_EXISTS');
    }
    const challenge = createChallenge(
      'registration', registration.email, '', JSON.stringify(registration.payload)
    );
    sendVerificationEmail(registration.email, challenge.code, 'complete your PageMe registration');
    return jsonResponse({
      status: 'success', verificationRequired: true,
      challengeId: challenge.id, expiresInSeconds: 600,
    });
  } finally {
    lock.releaseLock();
  }
}

function verifyRegistration(data) {
  const challengeId = sanitize(data.challengeId, 120);
  const code = sanitize(data.code, 6);
  if (!challengeId || !/^\d{6}$/.test(code)) {
    return errorResponse('Enter the six-digit verification code.', 'INVALID_VERIFICATION_CODE');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const challengeSheet = getChallengeSheet();
    const verified = verifyChallenge(challengeSheet, challengeId, 'registration', code);
    if (verified.error) return errorResponse(verified.error, verified.code);
    let payload;
    try { payload = JSON.parse(String(verified.values[CC.PAYLOAD - 1] || '{}')); }
    catch (_) { return errorResponse('Verification request is invalid.', 'INVALID_CHALLENGE'); }
    const registration = normalizedRegistration(payload);
    if (!registration.valid) return errorResponse(registration.error, registration.code);
    if (registration.email !== String(verified.values[CC.EMAIL - 1] || '').trim().toLowerCase()) {
      return errorResponse('Verification request is invalid.', 'INVALID_CHALLENGE');
    }

    const userSheet = getUserSheet();
    const rows = userSheet.getDataRange().getValues();
    let maxSequence = 0;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][COL.EMAIL - 1]).trim().toLowerCase() === registration.email) {
        return errorResponse('This email is already registered.', 'EMAIL_EXISTS');
      }
      const existing = normalizeUcn(rows[i][COL.UCN - 1]);
      if (existing.indexOf(registration.prefix + '-') === 0) {
        const sequence = Number(existing.split('-').pop());
        if (Number.isFinite(sequence)) maxSequence = Math.max(maxSequence, sequence);
      }
    }

    const capCode = registration.prefix + '-' + String(maxSequence + 1).padStart(3, '0');
    const sessionToken = createSessionToken();
    userSheet.appendRow([
      capCode, registration.name, registration.email, registration.occupation,
      registration.status, registration.country, new Date(), '', '', createUserId(),
    ]);
    const session = issueSession(capCode, sessionToken);
    challengeSheet.deleteRow(verified.rowNumber);
    sendRegistrationEmail(registration.email, registration.name, capCode);
    return jsonResponse({
      status: 'success', capCode: capCode, sessionToken: sessionToken,
      sessionExpiresAt: session.expiresAt.toISOString(),
    });
  } finally {
    lock.releaseLock();
  }
}

function requestRestore(data) {
  const capCode = normalizeUcn(data.capCode);
  const email = sanitize(data.email, 200).toLowerCase();
  if (!capCode || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return errorResponse('A valid UCN and registered email are required.', 'INVALID_RESTORE');
  }
  const reviewAccess = getPlayReviewAccess();
  const isPlayReview = reviewAccess
    && reviewAccess.ucn === capCode
    && reviewAccess.email === email;
  if (!isPlayReview) enforceAttemptLimit('restore-code:' + capCode + ':' + email, 5, 3600);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const match = findUser(getUserSheet(), capCode, email);
    if (!match || isDeletedUser(match)) return errorResponse('No matching account was found.', 'ACCOUNT_NOT_FOUND');
    const challenge = createChallenge(
      'restore', email, capCode, '', isPlayReview ? reviewAccess.code : ''
    );
    if (!isPlayReview) {
      sendVerificationEmail(email, challenge.code, 'sign in to your PageMe account');
    }
    return jsonResponse({
      status: 'success', verificationRequired: true,
      challengeId: challenge.id, expiresInSeconds: 600,
    });
  } finally {
    lock.releaseLock();
  }
}

function verifyRestore(data) {
  const challengeId = sanitize(data.challengeId, 120);
  const code = sanitize(data.code, 6);
  if (!challengeId || !/^\d{6}$/.test(code)) {
    return errorResponse('Enter the six-digit verification code.', 'INVALID_VERIFICATION_CODE');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const challengeSheet = getChallengeSheet();
    const verified = verifyChallenge(challengeSheet, challengeId, 'restore', code);
    if (verified.error) return errorResponse(verified.error, verified.code);
    const capCode = normalizeUcn(verified.values[CC.UCN - 1]);
    const email = String(verified.values[CC.EMAIL - 1] || '').trim().toLowerCase();
    const userSheet = getUserSheet();
    const match = findUser(userSheet, capCode, email);
    if (!match || isDeletedUser(match)) return errorResponse('No matching account was found.', 'ACCOUNT_NOT_FOUND');
    const sessionToken = createSessionToken();
    const session = issueSession(capCode, sessionToken);
    userSheet.getRange(match.rowNumber, COL.TOKEN_HASH).setValue('');
    challengeSheet.deleteRow(verified.rowNumber);
    let settings = null;
    try { settings = match.values[COL.SETTINGS - 1] ? JSON.parse(String(match.values[COL.SETTINGS - 1])) : null; }
    catch (_) {}
    return jsonResponse({
      status: 'success', capCode: capCode,
      name: match.values[COL.NAME - 1], email: match.values[COL.EMAIL - 1],
      profile: {
        occupation: match.values[COL.OCCUPATION - 1],
        status: match.values[COL.STATUS - 1], country: match.values[COL.COUNTRY - 1],
      },
      settings: settings, sessionToken: sessionToken,
      sessionExpiresAt: session.expiresAt.toISOString(),
    });
  } finally {
    lock.releaseLock();
  }
}

function normalizedRegistration(data) {
  const payload = {
    name: sanitize(data.name, 100),
    email: sanitize(data.email, 200).toLowerCase(),
    occupation: sanitize(data.occupation, 100),
    status: sanitize(data.status, 50),
    country: sanitize(data.country, 100),
    prefix: sanitize(data.prefix, 3).toUpperCase(),
  };
  if (!payload.name || !payload.email || !payload.occupation || !payload.country || !/^[A-Z]{3}$/.test(payload.prefix)) {
    return { valid: false, error: 'Required registration details are missing or invalid.', code: 'INVALID_REGISTRATION' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return { valid: false, error: 'Invalid email address.', code: 'INVALID_EMAIL' };
  }
  return { valid: true, email: payload.email, prefix: payload.prefix, payload: payload,
    name: payload.name, occupation: payload.occupation, status: payload.status, country: payload.country };
}

function createChallenge(mode, email, capCode, payload, reusableCode) {
  const sheet = getChallengeSheet();
  const rows = sheet.getDataRange().getValues();
  const now = new Date();
  for (let i = rows.length - 1; i >= 1; i--) {
    const expiresAt = asDate(rows[i][CC.EXPIRES_AT - 1]);
    const sameIdentity = String(rows[i][CC.MODE - 1]) === mode
      && String(rows[i][CC.EMAIL - 1]).trim().toLowerCase() === email
      && normalizeUcn(rows[i][CC.UCN - 1]) === normalizeUcn(capCode);
    if (!expiresAt || expiresAt <= now || sameIdentity) sheet.deleteRow(i + 1);
  }
  const id = 'challenge-' + Utilities.getUuid();
  const code = /^\d{6}$/.test(String(reusableCode || ''))
    ? String(reusableCode)
    : createVerificationCode();
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);
  sheet.appendRow([
    id, mode, email, capCode, hashVerificationCode(id, code), payload || '',
    now.toISOString(), expiresAt.toISOString(), 0,
  ]);
  return { id: id, code: code, expiresAt: expiresAt };
}

function getPlayReviewAccess() {
  const properties = PropertiesService.getScriptProperties();
  const email = sanitize(properties.getProperty('PAGEME_PLAY_REVIEW_EMAIL'), 200).toLowerCase();
  const ucn = normalizeUcn(properties.getProperty('PAGEME_PLAY_REVIEW_UCN'));
  const code = sanitize(properties.getProperty('PAGEME_PLAY_REVIEW_CODE'), 6);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !ucn || !/^\d{6}$/.test(code)) {
    return null;
  }
  return { email: email, ucn: ucn, code: code };
}

function ensurePlayReviewAccount() {
  const reviewAccess = getPlayReviewAccess();
  if (!reviewAccess) throw new Error('PAGEME_PLAY_REVIEW_ACCESS_MISSING');
  const sheet = getUserSheet();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const rowUcn = normalizeUcn(rows[i][COL.UCN - 1]);
    const rowEmail = String(rows[i][COL.EMAIL - 1] || '').trim().toLowerCase();
    if (rowUcn === reviewAccess.ucn && rowEmail === reviewAccess.email) {
      return { status: 'exists', ucn: reviewAccess.ucn };
    }
    if (rowUcn === reviewAccess.ucn || rowEmail === reviewAccess.email) {
      throw new Error('PAGEME_PLAY_REVIEW_ACCOUNT_CONFLICT');
    }
  }
  sheet.appendRow([
    reviewAccess.ucn, 'Google Play Reviewer', reviewAccess.email, 'App Reviewer',
    'Testing', 'United States', new Date(), '', '', createUserId(),
  ]);
  return { status: 'created', ucn: reviewAccess.ucn };
}

function verifyChallenge(sheet, challengeId, mode, code) {
  const rows = sheet.getDataRange().getValues();
  const now = new Date();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (String(row[CC.ID - 1]) !== challengeId || String(row[CC.MODE - 1]) !== mode) continue;
    const expiresAt = asDate(row[CC.EXPIRES_AT - 1]);
    if (!expiresAt || expiresAt <= now) {
      sheet.deleteRow(i + 1);
      return { error: 'This verification code has expired. Request a new code.', code: 'CHALLENGE_EXPIRED' };
    }
    const attempts = Math.max(0, Number(row[CC.ATTEMPTS - 1]) || 0);
    if (attempts >= CHALLENGE_MAX_ATTEMPTS) {
      sheet.deleteRow(i + 1);
      return { error: 'Too many incorrect attempts. Request a new code.', code: 'CHALLENGE_LOCKED' };
    }
    if (!constantTimeEqual(String(row[CC.CODE_HASH - 1] || ''), hashVerificationCode(challengeId, code))) {
      if (attempts + 1 >= CHALLENGE_MAX_ATTEMPTS) {
        sheet.deleteRow(i + 1);
        return { error: 'Too many incorrect attempts. Request a new code.', code: 'CHALLENGE_LOCKED' };
      }
      sheet.getRange(i + 1, CC.ATTEMPTS).setValue(attempts + 1);
      return { error: 'That verification code is incorrect.', code: 'INVALID_VERIFICATION_CODE' };
    }
    return { rowNumber: i + 1, values: row };
  }
  return { error: 'This verification request is no longer valid.', code: 'INVALID_CHALLENGE' };
}

function createVerificationCode() {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    Utilities.getUuid() + ':' + new Date().getTime(),
    Utilities.Charset.UTF_8
  );
  let value = 0;
  for (let i = 0; i < 4; i++) value = ((value << 8) | (digest[i] & 255)) >>> 0;
  return String(value % 1000000).padStart(6, '0');
}

function hashVerificationCode(challengeId, code) {
  return hashToken(getChallengePepper() + ':' + challengeId + ':' + code);
}

function getChallengePepper() {
  const properties = PropertiesService.getScriptProperties();
  let pepper = String(properties.getProperty('PAGEME_CHALLENGE_PEPPER') || '');
  if (!pepper) {
    pepper = Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty('PAGEME_CHALLENGE_PEPPER', pepper);
  }
  return pepper;
}

function sendVerificationEmail(email, code, purpose) {
  MailApp.sendEmail(
    email,
    'Your PageMe verification code',
    'Your PageMe verification code is ' + code + '.\n\nUse it within 10 minutes to ' + purpose +
      '. If you did not request this, you can ignore this email.'
  );
}

function allowLegacyAuth() {
  return String(PropertiesService.getScriptProperties().getProperty('PAGEME_ALLOW_LEGACY_AUTH') || '')
    .trim().toLowerCase() === 'true';
}

function saveSettings(data) {
  const capCode = normalizeUcn(data.capCode);
  const sessionToken = sanitize(data.sessionToken, 300);
  if (!data.settings || typeof data.settings !== 'object') return errorResponse('Settings are required.', 'INVALID_SETTINGS');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getUserSheet();
    const user = authenticate(sheet, capCode, sessionToken);
    if (!user) return unauthorizedResponse();
    sheet.getRange(user.rowNumber, COL.SETTINGS).setValue(JSON.stringify(data.settings).slice(0, 40000));
    return jsonResponse({ status: 'success' });
  } finally {
    lock.releaseLock();
  }
}

function sendMessage(data) {
  const toUcn = normalizeUcn(data.toUcn);
  const fromUcn = normalizeUcn(data.fromUcn);
  const message = sanitize(data.message, 500);
  const messageType = data.type === 'code' ? 'code' : 'text';
  const sessionToken = sanitize(data.sessionToken, 300);
  const clientMessageId = sanitize(data.clientMessageId, 120);
  const replyToId = sanitize(data.replyToId, 120);
  if (!toUcn || !fromUcn || !message || !clientMessageId) {
    return errorResponse('Sender, recipient, message, and client message ID are required.', 'INVALID_MESSAGE');
  }
  if (toUcn === fromUcn) return errorResponse('A PageMe account cannot page itself.', 'SELF_MESSAGE');
  if (!/^[A-Z]{3}-\d{1,4}:[A-Za-z0-9:_-]{8,100}$/.test(clientMessageId)) {
    return errorResponse('Invalid client message ID.', 'INVALID_MESSAGE_ID');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let storedMessage;
  let target;
  let duplicate = false;
  try {
    const userSheet = getUserSheet();
    const sender = authenticate(userSheet, fromUcn, sessionToken);
    if (!sender) return unauthorizedResponse();
    target = findUser(userSheet, toUcn, '');
    if (!target || isDeletedUser(target)) return errorResponse('UCN not found.', 'UCN_NOT_FOUND');
    if (isBlocked(toUcn, fromUcn)) return errorResponse('This page cannot be delivered.', 'RECIPIENT_UNAVAILABLE');

    const messageSheet = getMessageSheet();
    const existing = findMessageByClientId(messageSheet, fromUcn, clientMessageId);
    if (existing) {
      duplicate = true;
      storedMessage = serializeMessage(existing.values, fromUcn);
      if (storedMessage.toUcn !== toUcn || storedMessage.message !== message || storedMessage.type !== messageType) {
        return errorResponse('Client message ID was already used for different content.', 'IDEMPOTENCY_CONFLICT');
      }
    } else {
      enforceAttemptLimit('page:' + fromUcn, 30, 600);
      const now = new Date();
      const revision = nextRevision(messageSheet);
      const row = [
        'msg-' + Utilities.getUuid(), clientMessageId, fromUcn, toUcn, message, messageType,
        now, '', '', '', '', '', '', replyToId, revision,
      ];
      messageSheet.appendRow(row);
      storedMessage = serializeMessage(row, fromUcn);
    }
  } finally {
    lock.releaseLock();
  }

  const pushAccepted = sendPushForMessage(storedMessage);
  const emailRelayed = sendMigrationEmailIfEnabled(target, storedMessage, pushAccepted);
  return jsonResponse({
    status: 'success', queued: true, duplicate: duplicate,
    pushAccepted: pushAccepted, emailRelayed: emailRelayed,
    message: storedMessage,
  });
}

function syncMessages(data) {
  const capCode = normalizeUcn(data.capCode);
  const sessionToken = sanitize(data.sessionToken, 300);
  const afterRevision = Math.max(0, Math.floor(Number(data.afterRevision) || 0));
  const limit = Math.min(200, Math.max(1, Math.floor(Number(data.limit) || 100)));
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const user = authenticate(getUserSheet(), capCode, sessionToken);
    if (!user) return unauthorizedResponse();
    enforceAttemptLimit('sync:' + capCode, 180, 600);

    const sheet = getMessageSheet();
    const rows = sheet.getDataRange().getValues();
    const now = new Date();
    const retentionCutoff = new Date(now.getTime() - getRetentionDays() * 86400000);
    const candidates = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const fromUcn = normalizeUcn(row[MC.FROM - 1]);
      const toUcn = normalizeUcn(row[MC.TO - 1]);
      if (fromUcn !== capCode && toUcn !== capCode) continue;
      const createdAt = asDate(row[MC.CREATED_AT - 1]);
      if (createdAt && createdAt < retentionCutoff) continue;

      if (toUcn === capCode && !row[MC.DELIVERED_AT - 1] && !row[MC.TO_DELETED_AT - 1]) {
        row[MC.DELIVERED_AT - 1] = now;
        row[MC.REVISION - 1] = nextRevision(sheet);
        sheet.getRange(i + 1, 1, 1, MESSAGE_HEADERS.length).setValues([row]);
      }
      const revision = Number(row[MC.REVISION - 1]) || 0;
      if (revision <= afterRevision) continue;
      candidates.push(serializeMessage(row, capCode));
    }

    candidates.sort((left, right) => left.revision - right.revision);
    const messages = candidates.slice(0, limit);
    const cursor = messages.length
      ? messages[messages.length - 1].revision
      : currentRevision(sheet);

    return jsonResponse({
      status: 'success', messages: messages, cursor: cursor,
      hasMore: candidates.length > messages.length,
      retentionDays: getRetentionDays(), serverTime: now.toISOString(),
    });
  } finally {
    lock.releaseLock();
  }
}

function markMessagesRead(data) {
  const capCode = normalizeUcn(data.capCode);
  const sessionToken = sanitize(data.sessionToken, 300);
  const ids = normalizeIdList(data.messageIds, 100);
  if (!ids.length) return errorResponse('Message IDs are required.', 'INVALID_MESSAGE_IDS');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (!authenticate(getUserSheet(), capCode, sessionToken)) return unauthorizedResponse();
    const sheet = getMessageSheet();
    const rows = sheet.getDataRange().getValues();
    const wanted = new Set(ids);
    const now = new Date();
    let updated = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!wanted.has(String(row[MC.ID - 1])) || normalizeUcn(row[MC.TO - 1]) !== capCode) continue;
      if (!row[MC.DELIVERED_AT - 1]) row[MC.DELIVERED_AT - 1] = now;
      if (!row[MC.READ_AT - 1]) row[MC.READ_AT - 1] = now;
      row[MC.REVISION - 1] = nextRevision(sheet);
      sheet.getRange(i + 1, 1, 1, MESSAGE_HEADERS.length).setValues([row]);
      updated++;
    }
    return jsonResponse({ status: 'success', updated: updated, cursor: currentRevision(sheet) });
  } finally {
    lock.releaseLock();
  }
}

function clearMessages(data) {
  const capCode = normalizeUcn(data.capCode);
  const sessionToken = sanitize(data.sessionToken, 300);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (!authenticate(getUserSheet(), capCode, sessionToken)) return unauthorizedResponse();
    const sheet = getMessageSheet();
    const rows = sheet.getDataRange().getValues();
    const now = new Date();
    let cleared = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const fromUcn = normalizeUcn(row[MC.FROM - 1]);
      const toUcn = normalizeUcn(row[MC.TO - 1]);
      let changed = false;
      if (fromUcn === capCode && !row[MC.FROM_DELETED_AT - 1]) {
        row[MC.FROM_DELETED_AT - 1] = now;
        changed = true;
      }
      if (toUcn === capCode && !row[MC.TO_DELETED_AT - 1]) {
        row[MC.TO_DELETED_AT - 1] = now;
        changed = true;
      }
      if (!changed) continue;
      row[MC.REVISION - 1] = nextRevision(sheet);
      sheet.getRange(i + 1, 1, 1, MESSAGE_HEADERS.length).setValues([row]);
      cleared++;
    }
    return jsonResponse({ status: 'success', cleared: cleared, cursor: currentRevision(sheet) });
  } finally {
    lock.releaseLock();
  }
}

function registerDevice(data) {
  const capCode = normalizeUcn(data.capCode);
  const sessionToken = sanitize(data.sessionToken, 300);
  const deviceId = sanitize(data.deviceId, 120);
  const pushToken = sanitize(data.pushToken, 1000);
  const platform = sanitize(data.platform, 30).toLowerCase() || 'android';
  if (!deviceId || !pushToken) return errorResponse('Device ID and push token are required.', 'INVALID_DEVICE');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!authenticate(getUserSheet(), capCode, sessionToken)) return unauthorizedResponse();
    updateSessionDevice(capCode, sessionToken, deviceId);
    const sheet = getDeviceSheet();
    const rows = sheet.getDataRange().getValues();
    const now = new Date();
    for (let i = 1; i < rows.length; i++) {
      if (normalizeUcn(rows[i][0]) === capCode && String(rows[i][1]) === deviceId) {
        sheet.getRange(i + 1, 1, 1, DEVICE_HEADERS.length)
          .setValues([[capCode, deviceId, pushToken, platform, now, true]]);
        return jsonResponse({ status: 'success' });
      }
    }
    sheet.appendRow([capCode, deviceId, pushToken, platform, now, true]);
    return jsonResponse({ status: 'success' });
  } finally {
    lock.releaseLock();
  }
}

function setBlock(data, shouldBlock) {
  const capCode = normalizeUcn(data.capCode);
  const blockedUcn = normalizeUcn(data.blockedUcn);
  const sessionToken = sanitize(data.sessionToken, 300);
  if (!blockedUcn || blockedUcn === capCode) return errorResponse('Invalid UCN.', 'INVALID_UCN');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!authenticate(getUserSheet(), capCode, sessionToken)) return unauthorizedResponse();
    const sheet = getBlockSheet();
    const rows = sheet.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (normalizeUcn(rows[i][0]) === capCode && normalizeUcn(rows[i][1]) === blockedUcn) {
        if (!shouldBlock) sheet.deleteRow(i + 1);
        return jsonResponse({ status: 'success', blocked: shouldBlock });
      }
    }
    if (shouldBlock) sheet.appendRow([capCode, blockedUcn, new Date()]);
    return jsonResponse({ status: 'success', blocked: shouldBlock });
  } finally {
    lock.releaseLock();
  }
}

function listBlocks(data) {
  const capCode = normalizeUcn(data.capCode);
  const sessionToken = sanitize(data.sessionToken, 300);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!authenticate(getUserSheet(), capCode, sessionToken)) return unauthorizedResponse();
    const rows = getBlockSheet().getDataRange().getValues();
    const blockedUcns = rows.slice(1)
      .filter(row => normalizeUcn(row[0]) === capCode)
      .map(row => normalizeUcn(row[1]))
      .filter(Boolean)
      .sort();
    return jsonResponse({ status: 'success', blockedUcns: blockedUcns });
  } finally {
    lock.releaseLock();
  }
}

function reportMessage(data) {
  const capCode = normalizeUcn(data.capCode);
  const sessionToken = sanitize(data.sessionToken, 300);
  const messageId = sanitize(data.messageId, 120);
  const reason = sanitize(data.reason, 300) || 'Unwanted message';
  const blockSender = data.blockSender === true;
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (!authenticate(getUserSheet(), capCode, sessionToken)) return unauthorizedResponse();
    const sheet = getMessageSheet();
    const match = findMessageById(sheet, messageId);
    if (!match) return errorResponse('Message not found.', 'MESSAGE_NOT_FOUND');
    const fromUcn = normalizeUcn(match.values[MC.FROM - 1]);
    const toUcn = normalizeUcn(match.values[MC.TO - 1]);
    if (fromUcn !== capCode && toUcn !== capCode) return errorResponse('Message not found.', 'MESSAGE_NOT_FOUND');
    const reportedUcn = fromUcn === capCode ? toUcn : fromUcn;
    const now = new Date();
    match.values[MC.REPORTED_AT - 1] = now;
    match.values[MC.REPORT_REASON - 1] = reason;
    match.values[MC.REVISION - 1] = nextRevision(sheet);
    sheet.getRange(match.rowNumber, 1, 1, MESSAGE_HEADERS.length).setValues([match.values]);
    getReportSheet().appendRow(['report-' + Utilities.getUuid(), capCode, messageId, reportedUcn, reason, now]);
    if (blockSender && reportedUcn) addBlockIfMissing(capCode, reportedUcn);
    return jsonResponse({ status: 'success', reported: true, blocked: blockSender });
  } finally {
    lock.releaseLock();
  }
}

function createStatusLink(data) {
  if (!statusSharingEnabled()) return featureUnavailableResponse();
  const capCode = normalizeUcn(data.capCode);
  const sessionToken = sanitize(data.sessionToken, 300);
  const context = normalizeStatusContext(data.context);
  if (!context) return errorResponse('Status link context is invalid.', 'INVALID_STATUS_CONTEXT');
  enforceAttemptLimit('status-link:' + capCode, 12, 3600);

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const userSheet = getUserSheet();
    const user = authenticate(userSheet, capCode, sessionToken);
    if (!user) return unauthorizedResponse();
    const now = new Date();
    const focusEndsAt = asDate(data.focusEndsAt);
    let expiresAt;
    if (context === 'focus') {
      if (!focusEndsAt || focusEndsAt <= now) {
        return errorResponse('Focus end time must be in the future.', 'INVALID_STATUS_EXPIRY');
      }
      expiresAt = focusEndsAt;
    } else {
      expiresAt = new Date(now.getTime() + STATUS_LINK_DEFAULT_TTL_MS);
    }
    if (expiresAt.getTime() - now.getTime() > STATUS_LINK_MAX_TTL_MS) {
      return errorResponse('Status links cannot remain active for more than 24 hours.', 'INVALID_STATUS_EXPIRY');
    }

    const userId = ensureUserId(userSheet, user);
    const sheet = getStatusLinkSheet();
    revokeStatusRows(sheet, row => String(row[SLC.USER_ID - 1] || '') === userId
      && String(row[SLC.CONTEXT - 1] || '') === context);
    const token = createSessionToken();
    const tokenHashValue = hashToken(token);
    sheet.appendRow([
      tokenHashValue, userId, capCode, context, now, expiresAt,
      focusEndsAt || '', '', 0, '',
    ]);
    appendProductEvent(userId, 'status_link_created', context, tokenHashValue);
    return jsonResponse({
      status: 'success', token: token,
      url: getStatusLinkBaseUrl() + encodeURIComponent(token),
      context: context, expiresAt: expiresAt.toISOString(),
      focusEndsAt: focusEndsAt ? focusEndsAt.toISOString() : '',
    });
  } finally {
    lock.releaseLock();
  }
}

function resolveStatusLinkPublic(data) {
  if (!statusSharingEnabled()) return featureUnavailableResponse();
  const token = sanitize(data.token, 200);
  if (!isValidStatusToken(token)) return invalidStatusLinkResponse();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getStatusLinkSheet();
    const match = findStatusLink(sheet, hashToken(token));
    if (!match) return invalidStatusLinkResponse();
    const state = statusLinkState(match.values);
    if (state.active) {
      const opens = Math.max(0, Number(match.values[SLC.OPEN_COUNT - 1]) || 0) + 1;
      sheet.getRange(match.rowNumber, SLC.OPEN_COUNT).setValue(opens);
      sheet.getRange(match.rowNumber, SLC.LAST_OPENED_AT).setValue(new Date());
      appendProductEvent(
        String(match.values[SLC.USER_ID - 1] || ''), 'status_link_opened',
        String(match.values[SLC.CONTEXT - 1] || ''), String(match.values[SLC.TOKEN_HASH - 1] || '')
      );
    }
    return jsonResponse({
      status: 'success', linkState: state.active ? 'active' : 'expired',
      active: state.active, context: String(match.values[SLC.CONTEXT - 1] || ''),
      expiresAt: toIso(match.values[SLC.EXPIRES_AT - 1]),
      focusEndsAt: toIso(match.values[SLC.FOCUS_ENDS_AT - 1]),
    });
  } finally {
    lock.releaseLock();
  }
}

function resolveStatusLinkAuthenticated(data) {
  if (!statusSharingEnabled()) return featureUnavailableResponse();
  const capCode = normalizeUcn(data.capCode);
  const sessionToken = sanitize(data.sessionToken, 300);
  const token = sanitize(data.token, 200);
  if (!isValidStatusToken(token)) return invalidStatusLinkResponse();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const userSheet = getUserSheet();
    const viewer = authenticate(userSheet, capCode, sessionToken);
    if (!viewer) return unauthorizedResponse();
    const match = findStatusLink(getStatusLinkSheet(), hashToken(token));
    if (!match || !statusLinkState(match.values).active) return expiredStatusLinkResponse();
    const ownerUcn = normalizeUcn(match.values[SLC.UCN - 1]);
    if (!ownerUcn || ownerUcn === capCode) {
      return errorResponse('This status link cannot be addressed from this account.', 'STATUS_LINK_UNAVAILABLE');
    }
    appendProductEvent(
      ensureUserId(userSheet, viewer), 'status_composer_opened',
      String(match.values[SLC.CONTEXT - 1] || ''), String(match.values[SLC.TOKEN_HASH - 1] || '')
    );
    return jsonResponse({
      status: 'success', active: true, toUcn: ownerUcn,
      context: String(match.values[SLC.CONTEXT - 1] || ''),
      expiresAt: toIso(match.values[SLC.EXPIRES_AT - 1]),
      focusEndsAt: toIso(match.values[SLC.FOCUS_ENDS_AT - 1]),
    });
  } finally {
    lock.releaseLock();
  }
}

function revokeStatusLink(data) {
  const capCode = normalizeUcn(data.capCode);
  const sessionToken = sanitize(data.sessionToken, 300);
  const token = sanitize(data.token, 200);
  const context = data.context ? normalizeStatusContext(data.context) : '';
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const userSheet = getUserSheet();
    const user = authenticate(userSheet, capCode, sessionToken);
    if (!user) return unauthorizedResponse();
    const userId = ensureUserId(userSheet, user);
    const tokenHashValue = token && isValidStatusToken(token) ? hashToken(token) : '';
    const sheet = getStatusLinkSheet();
    const revoked = revokeStatusRows(sheet, row => {
      if (String(row[SLC.USER_ID - 1] || '') !== userId) return false;
      if (tokenHashValue && !constantTimeEqual(String(row[SLC.TOKEN_HASH - 1] || ''), tokenHashValue)) return false;
      if (context && String(row[SLC.CONTEXT - 1] || '') !== context) return false;
      return true;
    });
    return jsonResponse({ status: 'success', revoked: revoked });
  } finally {
    lock.releaseLock();
  }
}

function recordProductEvent(data) {
  const capCode = normalizeUcn(data.capCode);
  const sessionToken = sanitize(data.sessionToken, 300);
  const eventName = sanitize(data.event, 40);
  const context = sanitize(data.context, 40).toLowerCase();
  if (ALLOWED_PRODUCT_EVENTS.indexOf(eventName) < 0) {
    return errorResponse('Product event is not supported.', 'INVALID_PRODUCT_EVENT');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const userSheet = getUserSheet();
    const user = authenticate(userSheet, capCode, sessionToken);
    if (!user) return unauthorizedResponse();
    const token = sanitize(data.statusToken, 200);
    const tokenHashValue = isValidStatusToken(token) ? hashToken(token) : '';
    appendProductEvent(ensureUserId(userSheet, user), eventName, context, tokenHashValue);
    return jsonResponse({ status: 'success', recorded: true });
  } finally {
    lock.releaseLock();
  }
}

function deleteAccount(data) {
  const capCode = normalizeUcn(data.capCode);
  const sessionToken = sanitize(data.sessionToken, 300);
  const confirmation = normalizeUcn(data.confirmation);
  if (!capCode || confirmation !== capCode) return errorResponse('UCN confirmation is required.', 'CONFIRMATION_REQUIRED');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const userSheet = getUserSheet();
    const user = authenticate(userSheet, capCode, sessionToken);
    if (!user) return unauthorizedResponse();
    const accountEmail = String(user.values[COL.EMAIL - 1] || '').trim().toLowerCase();
    deleteRowsMatching(getMessageSheet(), row => normalizeUcn(row[MC.FROM - 1]) === capCode || normalizeUcn(row[MC.TO - 1]) === capCode);
    deleteRowsMatching(getDeviceSheet(), row => normalizeUcn(row[0]) === capCode);
    deleteRowsMatching(getSessionSheet(), row => normalizeUcn(row[SC.UCN - 1]) === capCode);
    deleteRowsMatching(getChallengeSheet(), row => normalizeUcn(row[CC.UCN - 1]) === capCode || String(row[CC.EMAIL - 1]).trim().toLowerCase() === accountEmail);
    deleteRowsMatching(getBlockSheet(), row => normalizeUcn(row[0]) === capCode || normalizeUcn(row[1]) === capCode);
    deleteRowsMatching(getReportSheet(), row => normalizeUcn(row[1]) === capCode || normalizeUcn(row[3]) === capCode);
    const userId = String(user.values[COL.USER_ID - 1] || '');
    deleteRowsMatching(getStatusLinkSheet(), row => String(row[SLC.USER_ID - 1] || '') === userId || normalizeUcn(row[SLC.UCN - 1]) === capCode);
    deleteRowsMatching(getProductEventSheet(), row => String(row[1] || '') === userId);
    userSheet.getRange(user.rowNumber, 1, 1, USER_HEADERS.length).setValues([[
      capCode, '', '', '', 'DELETED', '', user.values[COL.CREATED_AT - 1] || new Date(), '', '', '',
    ]]);
    return jsonResponse({ status: 'success', deleted: true });
  } finally {
    lock.releaseLock();
  }
}

function serializeMessage(row, viewerUcn) {
  const fromUcn = normalizeUcn(row[MC.FROM - 1]);
  const toUcn = normalizeUcn(row[MC.TO - 1]);
  const viewer = normalizeUcn(viewerUcn);
  const deleted = (viewer === fromUcn && !!row[MC.FROM_DELETED_AT - 1])
    || (viewer === toUcn && !!row[MC.TO_DELETED_AT - 1]);
  return {
    id: String(row[MC.ID - 1] || ''),
    clientMessageId: String(row[MC.CLIENT_ID - 1] || ''),
    fromUcn: fromUcn,
    toUcn: toUcn,
    message: deleted ? '' : String(row[MC.BODY - 1] || '').slice(0, 500),
    type: row[MC.TYPE - 1] === 'code' ? 'code' : 'text',
    createdAt: toIso(row[MC.CREATED_AT - 1]),
    deliveredAt: toIso(row[MC.DELIVERED_AT - 1]),
    readAt: toIso(row[MC.READ_AT - 1]),
    replyToId: String(row[MC.REPLY_TO_ID - 1] || ''),
    revision: Number(row[MC.REVISION - 1]) || 0,
    deleted: deleted,
  };
}

function findMessageByClientId(sheet, fromUcn, clientMessageId) {
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (normalizeUcn(rows[i][MC.FROM - 1]) === fromUcn
        && String(rows[i][MC.CLIENT_ID - 1]) === clientMessageId) {
      return { rowNumber: i + 1, values: rows[i] };
    }
  }
  return null;
}

function findMessageById(sheet, messageId) {
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][MC.ID - 1]) === messageId) return { rowNumber: i + 1, values: rows[i] };
  }
  return null;
}

function getUserSheet() {
  const spreadsheet = getPageMeSpreadsheet();
  const sheetName = PropertiesService.getScriptProperties().getProperty('PAGEME_SHEET_NAME');
  const sheet = sheetName ? spreadsheet.getSheetByName(sheetName) : spreadsheet.getSheets()[0];
  if (!sheet) throw new Error('USER_SHEET_MISSING');
  ensureHeaders(sheet, USER_HEADERS);
  ensureUserIds(sheet);
  return sheet;
}

function getMessageSheet() {
  return getOrCreateSheet(
    PropertiesService.getScriptProperties().getProperty('PAGEME_MESSAGES_SHEET_NAME') || 'PageMe Messages',
    MESSAGE_HEADERS
  );
}

function getDeviceSheet() { return getOrCreateSheet('PageMe Devices', DEVICE_HEADERS); }
function getSessionSheet() { return getOrCreateSheet('PageMe Sessions', SESSION_HEADERS); }
function getChallengeSheet() {
  const spreadsheet = getPageMeSpreadsheet();
  let sheet = spreadsheet.getSheetByName('PageMe Challenges');
  if (!sheet) sheet = spreadsheet.insertSheet('PageMe Challenges');
  ensureChallengeHeaders(sheet);
  return sheet;
}
function getBlockSheet() { return getOrCreateSheet('PageMe Blocks', BLOCK_HEADERS); }
function getReportSheet() { return getOrCreateSheet('PageMe Reports', REPORT_HEADERS); }
function getStatusLinkSheet() { return getOrCreateSheet('PageMe Status Links', STATUS_LINK_HEADERS); }
function getProductEventSheet() { return getOrCreateSheet('PageMe Product Events', PRODUCT_EVENT_HEADERS); }

function getOrCreateSheet(name, headers) {
  const spreadsheet = getPageMeSpreadsheet();
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  ensureHeaders(sheet, headers);
  return sheet;
}

function getPageMeSpreadsheet() {
  const spreadsheetId = sanitize(
    PropertiesService.getScriptProperties().getProperty('PAGEME_SPREADSHEET_ID'),
    200
  );
  if (spreadsheetId) return SpreadsheetApp.openById(spreadsheetId);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('PAGEME_SPREADSHEET_MISSING');
  return active;
}

function ensureHeaders(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers.slice());
    return;
  }
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  let changed = false;
  for (let i = 0; i < headers.length; i++) {
    if (!current[i]) {
      current[i] = headers[i];
      changed = true;
    }
  }
  if (changed) sheet.getRange(1, 1, 1, headers.length).setValues([current]);
}

function ensureChallengeHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(CHALLENGE_HEADERS.slice());
    return;
  }
  const current = sheet.getRange(1, 1, 1, CHALLENGE_HEADERS.length).getValues()[0];
  const exact = CHALLENGE_HEADERS.every((header, index) => String(current[index] || '').trim() === header);
  if (exact) return;

  // Verification challenges are short-lived. Reset only this transient table when an
  // older deployment left an incompatible schema; user, message, and session data remain untouched.
  for (let row = sheet.getLastRow(); row >= 2; row--) sheet.deleteRow(row);
  sheet.getRange(1, 1, 1, CHALLENGE_HEADERS.length).setValues([CHALLENGE_HEADERS.slice()]);
}

function findUser(sheet, capCode, email) {
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const rowUcn = normalizeUcn(rows[i][COL.UCN - 1]);
    const rowEmail = String(rows[i][COL.EMAIL - 1]).trim().toLowerCase();
    if (rowUcn === capCode && (!email || rowEmail === email)) return { rowNumber: i + 1, values: rows[i] };
  }
  return null;
}

function createUserId() {
  return 'user-' + Utilities.getUuid();
}

function ensureUserIds(sheet) {
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const capCode = normalizeUcn(rows[i][COL.UCN - 1]);
    const deleted = String(rows[i][COL.STATUS - 1] || '').trim().toUpperCase() === 'DELETED';
    if (capCode && !deleted && !String(rows[i][COL.USER_ID - 1] || '').trim()) {
      sheet.getRange(i + 1, COL.USER_ID).setValue(createUserId());
    }
  }
}

function ensureUserId(sheet, user) {
  let userId = String(user.values[COL.USER_ID - 1] || '').trim();
  if (userId) return userId;
  userId = createUserId();
  sheet.getRange(user.rowNumber, COL.USER_ID).setValue(userId);
  user.values[COL.USER_ID - 1] = userId;
  return userId;
}

function authenticate(sheet, capCode, sessionToken) {
  if (!capCode || !sessionToken) return null;
  const user = findUser(sheet, capCode, '');
  if (!user || isDeletedUser(user)) return null;
  const suppliedHash = hashToken(sessionToken);
  const sessionSheet = getSessionSheet();
  const rows = sessionSheet.getDataRange().getValues();
  const now = new Date();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (normalizeUcn(row[SC.UCN - 1]) !== capCode
        || !constantTimeEqual(String(row[SC.TOKEN_HASH - 1] || ''), suppliedHash)) continue;
    if (row[SC.REVOKED_AT - 1]) return null;
    const expiresAt = asDate(row[SC.EXPIRES_AT - 1]);
    if (!expiresAt || expiresAt <= now) return null;
    const lastUsedAt = asDate(row[SC.LAST_USED_AT - 1]);
    if (!lastUsedAt || now.getTime() - lastUsedAt.getTime() > 21600000) {
      sessionSheet.getRange(i + 1, SC.LAST_USED_AT).setValue(now);
    }
    return user;
  }

  // One-time migration for accounts created by the legacy single-token backend.
  const expected = String(user.values[COL.TOKEN_HASH - 1] || '');
  if (!expected || !constantTimeEqual(expected, suppliedHash)) return null;
  issueSession(capCode, sessionToken);
  sheet.getRange(user.rowNumber, COL.TOKEN_HASH).setValue('');
  return user;
}

function issueSession(capCode, sessionToken) {
  const sheet = getSessionSheet();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + getSessionLifetimeDays() * 86400000);
  const tokenHashValue = hashToken(sessionToken);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (normalizeUcn(rows[i][SC.UCN - 1]) === capCode
        && constantTimeEqual(String(rows[i][SC.TOKEN_HASH - 1] || ''), tokenHashValue)) {
      return { sessionId: String(rows[i][SC.ID - 1]), expiresAt: asDate(rows[i][SC.EXPIRES_AT - 1]) || expiresAt };
    }
  }
  const sessionId = 'session-' + Utilities.getUuid();
  sheet.appendRow([sessionId, capCode, tokenHashValue, '', now, now, expiresAt, '']);
  pruneSessions(capCode);
  return { sessionId: sessionId, expiresAt: expiresAt };
}

function updateSessionDevice(capCode, sessionToken, deviceId) {
  const sheet = getSessionSheet();
  const rows = sheet.getDataRange().getValues();
  const tokenHashValue = hashToken(sessionToken);
  for (let i = 1; i < rows.length; i++) {
    if (normalizeUcn(rows[i][SC.UCN - 1]) === capCode
        && constantTimeEqual(String(rows[i][SC.TOKEN_HASH - 1] || ''), tokenHashValue)) {
      sheet.getRange(i + 1, SC.DEVICE_ID).setValue(deviceId);
      return;
    }
  }
}

function pruneSessions(capCode) {
  const sheet = getSessionSheet();
  const rows = sheet.getDataRange().getValues();
  const now = new Date();
  const active = [];
  const removeRows = [];
  for (let i = 1; i < rows.length; i++) {
    if (normalizeUcn(rows[i][SC.UCN - 1]) !== capCode) continue;
    const expiresAt = asDate(rows[i][SC.EXPIRES_AT - 1]);
    if (rows[i][SC.REVOKED_AT - 1] || !expiresAt || expiresAt <= now) removeRows.push(i + 1);
    else active.push({ rowNumber: i + 1, createdAt: asDate(rows[i][SC.CREATED_AT - 1]) || new Date(0) });
  }
  active.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  active.slice(getMaxSessionsPerAccount()).forEach(session => removeRows.push(session.rowNumber));
  [...new Set(removeRows)].sort((left, right) => right - left).forEach(rowNumber => sheet.deleteRow(rowNumber));
}

function getSessionLifetimeDays() {
  const configured = Number(PropertiesService.getScriptProperties().getProperty('PAGEME_SESSION_LIFETIME_DAYS') || 180);
  return Math.min(365, Math.max(30, Math.floor(configured || 180)));
}

function getMaxSessionsPerAccount() {
  const configured = Number(PropertiesService.getScriptProperties().getProperty('PAGEME_MAX_SESSIONS_PER_ACCOUNT') || 8);
  return Math.min(12, Math.max(2, Math.floor(configured || 8)));
}

function isDeletedUser(user) {
  return !user || String(user.values[COL.STATUS - 1] || '').trim().toUpperCase() === 'DELETED';
}

function isBlocked(blockerUcn, blockedUcn) {
  const rows = getBlockSheet().getDataRange().getValues();
  return rows.slice(1).some(row => normalizeUcn(row[0]) === blockerUcn && normalizeUcn(row[1]) === blockedUcn);
}

function addBlockIfMissing(blockerUcn, blockedUcn) {
  if (!isBlocked(blockerUcn, blockedUcn)) getBlockSheet().appendRow([blockerUcn, blockedUcn, new Date()]);
}

function nextRevision(sheet) {
  const properties = PropertiesService.getScriptProperties();
  const propertyKey = 'PAGEME_MESSAGE_REVISION';
  let revision = Number(properties.getProperty(propertyKey) || 0);
  if (!revision && sheet.getLastRow() > 1) {
    const values = sheet.getRange(2, MC.REVISION, sheet.getLastRow() - 1, 1).getValues();
    revision = values.reduce((max, row) => Math.max(max, Number(row[0]) || 0), 0);
  }
  revision += 1;
  properties.setProperty(propertyKey, String(revision));
  return revision;
}

function currentRevision(sheet) {
  const stored = Number(PropertiesService.getScriptProperties().getProperty('PAGEME_MESSAGE_REVISION') || 0);
  if (stored || sheet.getLastRow() <= 1) return stored;
  const values = sheet.getRange(2, MC.REVISION, sheet.getLastRow() - 1, 1).getValues();
  return values.reduce((max, row) => Math.max(max, Number(row[0]) || 0), 0);
}

function getRetentionDays() {
  const configured = Number(PropertiesService.getScriptProperties().getProperty('PAGEME_MESSAGE_RETENTION_DAYS') || 90);
  return Math.min(365, Math.max(7, Math.floor(configured || 90)));
}

function sendPushForMessage(message) {
  if (!message || !message.toUcn) return false;
  const credentials = getFcmCredentials();
  if (!credentials) return false;
  const rows = getDeviceSheet().getDataRange().getValues();
  const tokens = rows.slice(1)
    .filter(row => normalizeUcn(row[0]) === message.toUcn && row[5] !== false && String(row[2] || '').trim())
    .map(row => String(row[2]).trim());
  if (!tokens.length) return false;
  let accessToken;
  try { accessToken = getFcmAccessToken(credentials); } catch (_) { return false; }
  let accepted = false;
  tokens.forEach(token => {
    try {
      const response = UrlFetchApp.fetch(
        'https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(credentials.projectId) + '/messages:send',
        {
          method: 'post', muteHttpExceptions: true,
          contentType: 'application/json',
          headers: { Authorization: 'Bearer ' + accessToken },
          payload: JSON.stringify({
            message: {
              token: token,
              data: { type: 'pageme_message', messageId: message.id, fromUcn: message.fromUcn },
              android: { priority: 'high', ttl: '86400s' },
            },
          }),
        }
      );
      if (response.getResponseCode() >= 200 && response.getResponseCode() < 300) accepted = true;
    } catch (_) {}
  });
  return accepted;
}

function getFcmCredentials() {
  const properties = PropertiesService.getScriptProperties();
  const projectId = sanitize(properties.getProperty('PAGEME_FCM_PROJECT_ID'), 200);
  if (!projectId) return null;
  const authMode = String(properties.getProperty('PAGEME_FCM_AUTH_MODE') || 'script').trim().toLowerCase();
  if (authMode !== 'service_account') return { projectId: projectId, authMode: 'script' };
  const clientEmail = sanitize(properties.getProperty('PAGEME_FCM_CLIENT_EMAIL'), 300);
  const privateKey = String(properties.getProperty('PAGEME_FCM_PRIVATE_KEY') || '').replace(/\\n/g, '\n').trim();
  return clientEmail && privateKey
    ? { projectId: projectId, authMode: 'service_account', clientEmail: clientEmail, privateKey: privateKey }
    : null;
}

function getFcmAccessToken(credentials) {
  if (credentials.authMode === 'script') {
    if (typeof ScriptApp === 'undefined' || typeof ScriptApp.getOAuthToken !== 'function') {
      throw new Error('FCM_AUTH_FAILED');
    }
    return ScriptApp.getOAuthToken();
  }
  const cache = CacheService.getScriptCache();
  const cached = cache.get('fcm-access-token');
  if (cached) return cached;
  const now = Math.floor(Date.now() / 1000);
  const header = base64Web(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Web(JSON.stringify({
    iss: credentials.clientEmail, scope: FCM_SCOPE, aud: FCM_AUDIENCE,
    iat: now, exp: now + 3600,
  }));
  const unsigned = header + '.' + claim;
  const signature = Utilities.computeRsaSha256Signature(unsigned, credentials.privateKey);
  const assertion = unsigned + '.' + Utilities.base64EncodeWebSafe(signature).replace(/=+$/g, '');
  const response = UrlFetchApp.fetch(FCM_AUDIENCE, {
    method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: assertion },
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error('FCM_AUTH_FAILED');
  const parsed = JSON.parse(response.getContentText());
  if (!parsed.access_token) throw new Error('FCM_AUTH_FAILED');
  cache.put('fcm-access-token', parsed.access_token, Math.max(60, Number(parsed.expires_in || 3600) - 120));
  return parsed.access_token;
}

function sendMigrationEmailIfEnabled(target, message, pushAccepted) {
  const mode = String(PropertiesService.getScriptProperties().getProperty('PAGEME_EMAIL_RELAY_MODE') || 'off').toLowerCase();
  if (mode !== 'always' && !(mode === 'fallback' && !pushAccepted)) return false;
  try {
    const targetName = String(target.values[COL.NAME - 1]).trim();
    const targetEmail = String(target.values[COL.EMAIL - 1]).trim();
    MailApp.sendEmail(
      targetEmail,
      'PageMe migration notice from ' + message.fromUcn,
      'Hi ' + targetName + ',\n\nA PageMe page is waiting inside PageMe from ' + message.fromUcn +
        '.\n\nOpen PageMe to receive and reply. Message content is not included in email.'
    );
    return true;
  } catch (_) { return false; }
}

function deleteRowsMatching(sheet, predicate) {
  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (predicate(rows[i])) sheet.deleteRow(i + 1);
  }
}

function normalizeIdList(value, limit) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  value.forEach(item => {
    const id = sanitize(item, 120);
    if (id && !seen.has(id) && result.length < limit) {
      seen.add(id);
      result.push(id);
    }
  });
  return result;
}

function normalizeUcn(value) {
  const ucn = sanitize(value, 12).toUpperCase();
  return /^[A-Z]{3}-\d{1,4}$/.test(ucn) ? ucn : '';
}

function asDate(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 100000000000
      ? value
      : (value - 25569) * 86400000;
    const numericDate = new Date(milliseconds);
    return isNaN(numericDate.getTime()) ? null : numericDate;
  }
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function toIso(value) {
  const date = asDate(value);
  return date ? date.toISOString() : '';
}

function base64Web(value) {
  return Utilities.base64EncodeWebSafe(value, Utilities.Charset.UTF_8).replace(/=+$/g, '');
}

function createSessionToken() {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      Utilities.getUuid() + ':' + Utilities.getUuid() + ':' + new Date().getTime(),
      Utilities.Charset.UTF_8
    )
  ).replace(/=+$/g, '');
}

function hashToken(token) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token, Utilities.Charset.UTF_8)
  ).replace(/=+$/g, '');
}

function statusSharingEnabled() {
  return String(PropertiesService.getScriptProperties().getProperty('PAGEME_STATUS_LINKS_ENABLED') || 'true')
    .trim().toLowerCase() !== 'false';
}

function getStatusLinkBaseUrl() {
  const configured = sanitize(
    PropertiesService.getScriptProperties().getProperty('PAGEME_STATUS_LINK_BASE_URL'), 300
  );
  return configured || 'https://ayodelemartinsabiwo.github.io/pageme/page.html?s=';
}

function normalizeStatusContext(value) {
  const context = sanitize(value, 20).toLowerCase();
  return ['activation', 'focus', 'manual'].indexOf(context) >= 0 ? context : '';
}

function isValidStatusToken(token) {
  return /^[A-Za-z0-9_-]{32,100}$/.test(String(token || ''));
}

function findStatusLink(sheet, tokenHashValue) {
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (constantTimeEqual(String(rows[i][SLC.TOKEN_HASH - 1] || ''), tokenHashValue)) {
      return { rowNumber: i + 1, values: rows[i] };
    }
  }
  return null;
}

function statusLinkState(row) {
  const expiresAt = asDate(row[SLC.EXPIRES_AT - 1]);
  return { active: !row[SLC.REVOKED_AT - 1] && !!expiresAt && expiresAt > new Date() };
}

function revokeStatusRows(sheet, predicate) {
  const rows = sheet.getDataRange().getValues();
  const now = new Date();
  let revoked = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][SLC.REVOKED_AT - 1] || !predicate(rows[i])) continue;
    sheet.getRange(i + 1, SLC.REVOKED_AT).setValue(now);
    revoked++;
  }
  return revoked;
}

function appendProductEvent(userId, eventName, context, tokenHashValue) {
  if (!userId || ALLOWED_PRODUCT_EVENTS.indexOf(eventName) < 0) return;
  const sheet = getProductEventSheet();
  sheet.appendRow([
    'event-' + Utilities.getUuid(), userId, eventName,
    sanitize(context, 40).toLowerCase(), new Date(), String(tokenHashValue || '').slice(0, 12),
  ]);
  pruneProductEvents(sheet);
}

function pruneProductEvents(sheet) {
  const cutoff = Date.now() - PRODUCT_EVENT_RETENTION_MS;
  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    const createdAt = asDate(rows[i][4]);
    if (createdAt && createdAt.getTime() < cutoff) sheet.deleteRow(i + 1);
  }
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

function enforceAttemptLimit(key, maxAttempts, ttlSeconds) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'limit:' + hashToken(key).slice(0, 80);
  const attempts = Number(cache.get(cacheKey) || 0) + 1;
  cache.put(cacheKey, String(attempts), ttlSeconds);
  if (attempts > maxAttempts) throw new Error('RATE_LIMIT');
}

function sanitize(value, maxLength) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/<[^>]*>/g, '').trim().slice(0, maxLength || 200);
}

function sendRegistrationEmail(email, name, capCode) {
  try {
    MailApp.sendEmail(
      email, 'Your PageMe pager is active [' + capCode + ']',
      'Hi ' + name + ',\n\nYour PageMe Unique Code Number is ' + capCode +
        '.\n\nKeep this email safe; your UCN and email can be used to restore your pager.'
    );
  } catch (_) {}
}

function unauthorizedResponse() {
  return jsonResponse({ status: 'error', code: 'AUTH_REQUIRED', error: 'Sign in again to continue.' });
}

function featureUnavailableResponse() {
  return errorResponse('Status sharing is temporarily unavailable. Pager Mode can still start normally.', 'FEATURE_UNAVAILABLE');
}

function invalidStatusLinkResponse() {
  return errorResponse('This PageMe status link is invalid.', 'INVALID_STATUS_LINK');
}

function expiredStatusLinkResponse() {
  return errorResponse('This PageMe status link has expired.', 'STATUS_LINK_EXPIRED');
}

function errorResponse(message, code) {
  return jsonResponse({ status: 'error', code: code || 'REQUEST_ERROR', error: message });
}

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
