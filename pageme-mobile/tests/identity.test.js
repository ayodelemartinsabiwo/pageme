import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearSessionToken, getSessionToken, sessionTokenFromResponse, storeSessionToken,
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

test('sessionTokenFromResponse supports the current and migration field names', () => {
  assert.equal(sessionTokenFromResponse({ sessionToken: 'new' }), 'new');
  assert.equal(sessionTokenFromResponse({ authToken: 'legacy' }), 'legacy');
  assert.equal(sessionTokenFromResponse(null), '');
});
