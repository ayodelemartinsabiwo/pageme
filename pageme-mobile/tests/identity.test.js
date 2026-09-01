import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearSessionToken, clearSessionTokenSecure, getSessionToken, hasSessionToken,
  loadSessionToken, sessionTokenFromResponse, storeSessionToken, storeSessionTokenSecure,
} from '../src/identity.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

test('session token lifecycle trims, stores, reads, and clears credentials', () => {
  const storage = memoryStorage();
  assert.equal(storeSessionToken('  secure-token  ', storage), true);
  assert.equal(getSessionToken(storage), 'secure-token');
  assert.equal(clearSessionToken(storage), true);
  assert.equal(getSessionToken(storage), '');
});

test('native session loading migrates a legacy token out of localStorage', async () => {
  const storage = memoryStorage();
  storage.setItem('pageme_session_token', 'legacy-token');
  let protectedToken = '';
  const plugin = {
    getSessionToken: async () => ({ token: '' }),
    setSessionToken: async ({ token }) => { protectedToken = token; },
  };

  assert.equal(await loadSessionToken({ storage, plugin }), 'legacy-token');
  assert.equal(protectedToken, 'legacy-token');
  assert.equal(storage.getItem('pageme_session_token'), null);
  assert.equal(storage.getItem('pageme_session_present'), 'true');
  assert.equal(hasSessionToken(storage), true);
  clearSessionToken(storage);
});

test('secure session writes do not leave the token in WebView storage', async () => {
  const storage = memoryStorage();
  let protectedToken = '';
  const plugin = {
    setSessionToken: async ({ token }) => { protectedToken = token; },
    clearSessionToken: async () => { protectedToken = ''; },
  };

  assert.equal(await storeSessionTokenSecure('native-token', { storage, plugin }), true);
  assert.equal(protectedToken, 'native-token');
  assert.equal(getSessionToken(storage), 'native-token');
  assert.equal(storage.getItem('pageme_session_token'), null);
  assert.equal(await clearSessionTokenSecure({ storage, plugin }), true);
  assert.equal(protectedToken, '');
  assert.equal(hasSessionToken(storage), false);
});

test('native secure-storage failures remove plaintext credentials and fail closed', async () => {
  const storage = memoryStorage();
  storage.setItem('pageme_session_token', 'legacy-token');
  const plugin = {
    getSessionToken: async () => { throw new Error('keystore unavailable'); },
  };
  assert.equal(await loadSessionToken({ storage, plugin }), '');
  assert.equal(storage.getItem('pageme_session_token'), null);
  assert.equal(hasSessionToken(storage), false);
});

test('sessionTokenFromResponse supports the current and migration field names', () => {
  assert.equal(sessionTokenFromResponse({ sessionToken: 'new' }), 'new');
  assert.equal(sessionTokenFromResponse({ authToken: 'legacy' }), 'legacy');
  assert.equal(sessionTokenFromResponse(null), '');
});
