import test from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldStartLora,
} from '../src/lora.js';

test('LoRa is internal and starts automatically for an activated native app', () => {
  const ready = { activated: true, capacitor: {}, plugin: {} };
  assert.equal(shouldStartLora(ready), true);
  assert.equal(shouldStartLora({ ...ready, activated: false }), false);
  assert.equal(shouldStartLora({ ...ready, capacitor: null }), false);
  assert.equal(shouldStartLora({ ...ready, plugin: null }), false);
});
