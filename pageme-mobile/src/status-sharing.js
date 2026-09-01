const STATUS_PAGE_ORIGIN = 'https://ayodelemartinsabiwo.github.io';
const STATUS_PAGE_PATH = '/pageme/page.html';

export const STATUS_LINK_STORAGE_KEY = 'pageme_active_status_link';
export const STATUS_SHARE_SETTING_KEY = 'pageme_ask_share_status';
export const STATUS_SHARE_ONBOARDING_KEY = 'pageme_status_share_onboarding_seen';

export function normalizeStatusToken(value) {
  const token = String(value || '').trim();
  return /^[A-Za-z0-9_-]{32,100}$/.test(token) ? token : '';
}

export function statusTokenFromUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.origin !== STATUS_PAGE_ORIGIN || url.pathname !== STATUS_PAGE_PATH) return '';
    return normalizeStatusToken(url.searchParams.get('s'));
  } catch (_) {
    return '';
  }
}

export function askToShareStatus(storage = globalThis.localStorage) {
  try { return storage.getItem(STATUS_SHARE_SETTING_KEY) !== 'false'; }
  catch (_) { return true; }
}

export function shouldOfferActivationShare(storage = globalThis.localStorage) {
  try {
    return askToShareStatus(storage) && storage.getItem(STATUS_SHARE_ONBOARDING_KEY) !== 'true';
  } catch (_) {
    return true;
  }
}

export function shouldOfferFocusShare(storage = globalThis.localStorage) {
  return askToShareStatus(storage);
}

export function buildStatusShareMessage({ context, focusEndsAt, locale } = {}) {
  if (context === 'focus' && Number(focusEndsAt) > Date.now()) {
    const time = new Date(Number(focusEndsAt)).toLocaleTimeString(locale, {
      hour: 'numeric', minute: '2-digit',
    });
    return `I'm on PageMe until ${time}. Need me? Send me a page:`;
  }
  return "I'm using PageMe right now. Need me? Send me a page:";
}

export function buildStatusShareText({ url, ...status } = {}) {
  const validUrl = String(url || '').trim();
  return `${buildStatusShareMessage(status)} ${validUrl}`.trim();
}

export function buildStatusSharePayload({ url, ...status } = {}) {
  return {
    title: 'My PageMe status',
    text: buildStatusShareText({ ...status, url }),
    dialogTitle: 'Share PageMe status',
  };
}

export function normalizeStoredStatus(value, now = Date.now()) {
  if (!value || typeof value !== 'object') return null;
  const token = normalizeStatusToken(value.token);
  const url = String(value.url || '');
  const expiresAt = Date.parse(value.expiresAt || '');
  const context = ['activation', 'focus', 'manual'].includes(value.context) ? value.context : '';
  if (!token || !url || !Number.isFinite(expiresAt) || expiresAt <= now || !context) return null;
  return {
    token, url, context, expiresAt: new Date(expiresAt).toISOString(),
    focusEndsAt: value.focusEndsAt ? new Date(value.focusEndsAt).toISOString() : '',
  };
}

export function readStoredStatus(storage = globalThis.localStorage, now = Date.now()) {
  try { return normalizeStoredStatus(JSON.parse(storage.getItem(STATUS_LINK_STORAGE_KEY) || 'null'), now); }
  catch (_) { return null; }
}

export function writeStoredStatus(status, storage = globalThis.localStorage) {
  const normalized = normalizeStoredStatus(status, 0);
  if (!normalized) return false;
  try {
    storage.setItem(STATUS_LINK_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch (_) {
    return false;
  }
}

export function clearStoredStatus(storage = globalThis.localStorage) {
  try { storage.removeItem(STATUS_LINK_STORAGE_KEY); }
  catch (_) {}
}
