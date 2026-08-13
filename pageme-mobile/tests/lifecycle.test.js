import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldSyncPagerMode } from '../src/lifecycle.js';

test('initial setup does not disable permissions needed by Android activation screens', () => {
  assert.equal(shouldSyncPagerMode(false, false), false);
});

test('activation and explicit deactivation are synchronized to Android', () => {
  assert.equal(shouldSyncPagerMode(true, false), true);
  assert.equal(shouldSyncPagerMode(false, true), true);
});
