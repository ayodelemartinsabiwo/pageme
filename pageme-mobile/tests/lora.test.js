import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LORA_ENABLED_KEY,
  LORA_CONSENT_KEY,
  readLoraEnabled,
  shouldStartLora,
  writeLoraEnabled,
} from '../src/lora.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('LoRa remains off unless the user explicitly enables it', () => {
  const storage = memoryStorage({ [LORA_ENABLED_KEY]: 'true' });
  assert.equal(readLoraEnabled(storage), false);

  writeLoraEnabled(true, storage);
  assert.equal(storage.getItem(LORA_ENABLED_KEY), 'true');
  assert.equal(storage.getItem(LORA_CONSENT_KEY), 'true');
  assert.equal(readLoraEnabled(storage), true);

  writeLoraEnabled(false, storage);
  assert.equal(readLoraEnabled(storage), false);
});

test('LoRa starts only for an activated app with opt-in and a native plugin', () => {
  const ready = { activated: true, enabled: true, capacitor: {}, plugin: {} };
  assert.equal(shouldStartLora(ready), true);
  assert.equal(shouldStartLora({ ...ready, activated: false }), false);
  assert.equal(shouldStartLora({ ...ready, enabled: false }), false);
  assert.equal(shouldStartLora({ ...ready, capacitor: null }), false);
  assert.equal(shouldStartLora({ ...ready, plugin: null }), false);
});
