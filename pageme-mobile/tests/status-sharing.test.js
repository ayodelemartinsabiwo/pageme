import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS_SHARE_ONBOARDING_KEY, STATUS_SHARE_SETTING_KEY,
  askToShareStatus, buildStatusShareMessage, buildStatusShareText, normalizeStoredStatus,
  shouldOfferActivationShare, shouldOfferFocusShare, statusTokenFromUrl,
} from '../src/status-sharing.js';

function storage(values = {}) {
  const data = new Map(Object.entries(values));
  return {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  };
}

const token = 'A'.repeat(43);

test('only the anonymous PageMe status path is accepted as an app link', () => {
  assert.equal(statusTokenFromUrl(`https://ayodelemartinsabiwo.github.io/pageme/page.html?s=${token}`), token);
  assert.equal(statusTokenFromUrl(`https://ayodelemartinsabiwo.github.io/pageme/guide.html?s=${token}`), '');
  assert.equal(statusTokenFromUrl(`https://example.com/pageme/page.html?s=${token}`), '');
  assert.equal(statusTokenFromUrl('not a url'), '');
});

test('sharing is offered once during activation and for manual focus unless disabled', () => {
  const defaults = storage();
  assert.equal(askToShareStatus(defaults), true);
  assert.equal(shouldOfferActivationShare(defaults), true);
  assert.equal(shouldOfferFocusShare(defaults), true);

  const seen = storage({ [STATUS_SHARE_ONBOARDING_KEY]: 'true' });
  assert.equal(shouldOfferActivationShare(seen), false);
  assert.equal(shouldOfferFocusShare(seen), true);

  const disabled = storage({ [STATUS_SHARE_SETTING_KEY]: 'false' });
  assert.equal(shouldOfferActivationShare(disabled), false);
  assert.equal(shouldOfferFocusShare(disabled), false);
});

test('shared text describes timed and untimed status without exposing identity', () => {
  const url = `https://ayodelemartinsabiwo.github.io/pageme/page.html?s=${token}`;
  const untimed = buildStatusShareText({ context: 'activation', url });
  assert.equal(untimed, `I'm using PageMe right now. Need me? Send me a page: ${url}`);
  assert.equal(untimed.includes('UCN'), false);
  assert.equal(buildStatusShareMessage({ context: 'activation' }), "I'm using PageMe right now. Need me? Send me a page:");
  const timed = buildStatusShareText({
    context: 'focus', focusEndsAt: Date.now() + 3600000, url, locale: 'en-US',
  });
  assert.match(timed, /^I'm on PageMe until .+ Need me\? Send me a page:/);
});

test('stored links fail closed after expiry or when malformed', () => {
  const active = normalizeStoredStatus({
    token, url: `https://ayodelemartinsabiwo.github.io/pageme/page.html?s=${token}`,
    context: 'manual', expiresAt: new Date(2000).toISOString(),
  }, 1000);
  assert.equal(active.token, token);
  assert.equal(normalizeStoredStatus({ ...active }, 3000), null);
  assert.equal(normalizeStoredStatus({ ...active, token: 'short' }, 1000), null);
});
