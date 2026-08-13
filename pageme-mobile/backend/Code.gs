const COL = Object.freeze({
  UCN: 1, NAME: 2, EMAIL: 3, OCCUPATION: 4, STATUS: 5,
  COUNTRY: 6, CREATED_AT: 7, SETTINGS: 8, TOKEN_HASH: 9,
});

function doGet() {
  return jsonResponse({ status: 'success', service: 'PageMe', version: 2 });
}

function doPost(e) {
  try {
    const data = JSON.parse(e && e.postData ? e.postData.contents : '{}');
    const action = sanitize(data.action, 30) || 'register';
    if (action === 'register') return registerUser(data);
    if (action === 'restore') return restoreUser(data);
    if (action === 'saveSettings') return saveSettings(data);
    if (action === 'page') return sendPage(data);
    return errorResponse('Unsupported action.');
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return errorResponse('The PageMe service could not process this request.');
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
    return errorResponse('Required registration details are missing or invalid.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errorResponse('Invalid email address.');

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
    sheet.appendRow([
      capCode, name, email, occupation, status, country, new Date(), '', hashToken(sessionToken),
    ]);
    sendRegistrationEmail(email, name, capCode);
    return jsonResponse({ status: 'success', capCode: capCode, sessionToken: sessionToken });
  } finally {
    lock.releaseLock();
  }
}

function restoreUser(data) {
  const capCode = sanitize(data.capCode, 10).toUpperCase();
  const email = sanitize(data.email, 200).toLowerCase();
  if (!capCode || !email) return errorResponse('UCN and email are required.');
  enforceAttemptLimit('restore:' + capCode + ':' + email, 8, 600);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getUserSheet();
    const match = findUser(sheet, capCode, email);
    if (!match) return errorResponse('No matching account was found.');

    const sessionToken = createSessionToken();
    sheet.getRange(match.rowNumber, COL.TOKEN_HASH).setValue(hashToken(sessionToken));
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
    });
  } finally {
    lock.releaseLock();
  }
}

function saveSettings(data) {
  const capCode = sanitize(data.capCode, 10).toUpperCase();
  const sessionToken = sanitize(data.sessionToken, 300);
  if (!data.settings || typeof data.settings !== 'object') return errorResponse('Settings are required.');
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

function sendPage(data) {
  const toUcn = sanitize(data.toUcn, 10).toUpperCase();
  const fromUcn = sanitize(data.fromUcn, 10).toUpperCase();
  const message = sanitize(data.message, 500);
  const sessionToken = sanitize(data.sessionToken, 300);
  if (!toUcn || !fromUcn || !message) return errorResponse('Sender, recipient, and message are required.');
  const sheet = getUserSheet();
  const sender = authenticate(sheet, fromUcn, sessionToken);
  if (!sender) return unauthorizedResponse();
  enforceAttemptLimit('page:' + fromUcn, 30, 600);
  const target = findUser(sheet, toUcn, '');
  if (!target) return errorResponse('UCN not found.');

  const senderName = String(sender.values[COL.NAME - 1]).trim();
  const targetName = String(target.values[COL.NAME - 1]).trim();
  const targetEmail = String(target.values[COL.EMAIL - 1]).trim();
  MailApp.sendEmail(
    targetEmail,
    'Page from ' + fromUcn + ' [' + senderName + ']',
    'Hi ' + targetName + ',\n\nYou received a PageMe page.\n\n' +
      'FROM: ' + fromUcn + ' (' + senderName + ')\nMESSAGE: ' + message + '\n\nOpen PageMe to reply.'
  );
  return jsonResponse({ status: 'success', delivered: true });
}

function getUserSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = PropertiesService.getScriptProperties().getProperty('PAGEME_SHEET_NAME');
  const sheet = sheetName ? spreadsheet.getSheetByName(sheetName) : spreadsheet.getSheets()[0];
  if (!sheet) throw new Error('Configured PageMe user sheet was not found.');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['UCN', 'Name', 'Email', 'Occupation', 'Status', 'Country', 'Created At', 'Settings', 'Token Hash']);
  } else if (!sheet.getRange(1, COL.TOKEN_HASH).getValue()) {
    sheet.getRange(1, COL.TOKEN_HASH).setValue('Token Hash');
  }
  return sheet;
}

function findUser(sheet, capCode, email) {
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const rowUcn = String(rows[i][COL.UCN - 1]).trim().toUpperCase();
    const rowEmail = String(rows[i][COL.EMAIL - 1]).trim().toLowerCase();
    if (rowUcn === capCode && (!email || rowEmail === email)) {
      return { rowNumber: i + 1, values: rows[i] };
    }
  }
  return null;
}

function authenticate(sheet, capCode, sessionToken) {
  if (!capCode || !sessionToken) return null;
  const user = findUser(sheet, capCode, '');
  if (!user) return null;
  const expected = String(user.values[COL.TOKEN_HASH - 1] || '');
  return expected && constantTimeEqual(expected, hashToken(sessionToken)) ? user : null;
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
  if (attempts > maxAttempts) throw new Error('Too many requests. Please wait and try again.');
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
  } catch (error) {
    console.warn('Registration email failed: ' + error);
  }
}

function unauthorizedResponse() {
  return jsonResponse({ status: 'error', code: 'AUTH_REQUIRED', error: 'Sign in again to continue.' });
}

function errorResponse(message) {
  return jsonResponse({ status: 'error', error: message });
}

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
