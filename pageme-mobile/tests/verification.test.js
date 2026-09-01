import test from 'node:test';
import assert from 'node:assert/strict';
import { verificationFailureFromResponse } from '../src/verification.js';

test('successful verification responses do not produce a failure', () => {
  assert.equal(verificationFailureFromResponse({ status: 'success' }), null);
});

test('an incorrect code remains retryable on the active challenge', () => {
  const failure = verificationFailureFromResponse({
    status: 'error', code: 'INVALID_VERIFICATION_CODE', error: 'Incorrect code.',
  });
  assert.equal(failure.requiresNewCode, false);
  assert.equal(failure.message, 'Incorrect code.');
});

test('expired, locked, missing, and rate-limited challenges require a fresh request', () => {
  for (const code of ['CHALLENGE_EXPIRED', 'CHALLENGE_LOCKED', 'INVALID_CHALLENGE', 'RATE_LIMIT']) {
    assert.equal(verificationFailureFromResponse({ status: 'error', code }).requiresNewCode, true);
  }
});
