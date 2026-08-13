import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TWEAKS_STORAGE_KEY, normalizePersistedTweaks, readPersistedTweaks, writePersistedTweaks,
} from '../src/tweaks-storage.js';

const defaults = { lcdColor: 'green', housing: 'black', font: 'lcd', backlight: true, battery: 0.78 };

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('appearance settings retain valid saved values and ignore unknown or invalid types', () => {
  assert.deepEqual(normalizePersistedTweaks({
    lcdColor: 'amber', housing: 'red', font: 'pixel', backlight: false,
    battery: Number.NaN, unknown: 'discarded',
  }, defaults), {
    lcdColor: 'amber', housing: 'red', font: 'pixel', backlight: false, battery: 0.78,
  });
});

test('appearance settings persist and restore across app initialization', () => {
  const storage = memoryStorage();
  writePersistedTweaks({ ...defaults, lcdColor: 'grayscale', housing: 'purple' }, defaults, storage);
  assert.deepEqual(readPersistedTweaks(defaults, storage), {
    ...defaults, lcdColor: 'grayscale', housing: 'purple',
  });
  assert.ok(storage.getItem(TWEAKS_STORAGE_KEY));
});
