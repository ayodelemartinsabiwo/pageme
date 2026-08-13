const SESSION_TOKEN_KEY = 'pageme_session_token';

export function getSessionToken(storage = globalThis.localStorage) {
  try {
    return (storage?.getItem(SESSION_TOKEN_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function storeSessionToken(token, storage = globalThis.localStorage) {
  const normalized = typeof token === 'string' ? token.trim() : '';
  if (!normalized) return false;
  try {
    storage?.setItem(SESSION_TOKEN_KEY, normalized);
    return true;
  } catch {
    return false;
  }
}

export function clearSessionToken(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(SESSION_TOKEN_KEY);
    return true;
  } catch {
    return false;
  }
}

export function sessionTokenFromResponse(response) {
  if (!response || typeof response !== 'object') return '';
  const token = response.sessionToken || response.authToken || '';
  return typeof token === 'string' ? token.trim() : '';
}
