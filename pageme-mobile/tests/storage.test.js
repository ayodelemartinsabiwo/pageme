import test from 'node:test';
import assert from 'node:assert/strict';

import { readJsonStorage, safeJsonParse, writeJsonStorage } from '../src/storage.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

test('safeJsonParse returns parsed JSON when valid', () => {
  assert.deepEqual(safeJsonParse('{"enabled":true}', {}), { enabled: true });
});

test('safeJsonParse falls back for empty or invalid JSON', () => {
  assert.deepEqual(safeJsonParse('', []), []);
  assert.deepEqual(safeJsonParse('{bad', { ok: false }), { ok: false });
});

test('readJsonStorage and writeJsonStorage tolerate storage failures', () => {
  const storage = memoryStorage();
  assert.equal(writeJsonStorage('apps', [{ packageName: 'com.study' }], storage), true);
  assert.deepEqual(readJsonStorage('apps', [], storage), [{ packageName: 'com.study' }]);

  const brokenStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('full'); },
  };
  assert.deepEqual(readJsonStorage('missing', ['fallback'], brokenStorage), ['fallback']);
  assert.equal(writeJsonStorage('missing', [], brokenStorage), false);
});
