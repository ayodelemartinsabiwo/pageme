const SESSION_TOKEN_KEY = 'pageme_session_token';
const SESSION_PRESENT_KEY = 'pageme_session_present';
let sessionTokenCache = '';

function nativeSecurePlugin() {
  return globalThis.window?.Capacitor?.Plugins?.SecureIdentity || null;
}

function trimToken(token) {
  return typeof token === 'string' ? token.trim().slice(0, 300) : '';
}

function withTimeout(promise, timeoutMs) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Secure session storage timed out.')), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

export function getSessionToken(storage = globalThis.localStorage) {
  if (sessionTokenCache) return sessionTokenCache;
  try {
    return trimToken(storage?.getItem(SESSION_TOKEN_KEY) || '');
  } catch {
    return '';
  }
}

export function hasSessionToken(storage = globalThis.localStorage) {
  if (getSessionToken(storage)) return true;
  try {
    return storage?.getItem(SESSION_PRESENT_KEY) === 'true';
  } catch {
    return false;
  }
}

export function storeSessionToken(token, storage = globalThis.localStorage) {
  const normalized = trimToken(token);
  if (!normalized) return false;
  sessionTokenCache = normalized;
  try {
    storage?.setItem(SESSION_TOKEN_KEY, normalized);
    storage?.setItem(SESSION_PRESENT_KEY, 'true');
    return true;
  } catch {
    return false;
  }
}

export async function loadSessionToken(options = {}) {
  const storage = options.storage ?? globalThis.localStorage;
  const plugin = options.plugin === undefined ? nativeSecurePlugin() : options.plugin;
  const timeoutMs = options.timeoutMs || 2500;
  const legacyToken = getSessionToken(storage);
  if (!plugin || typeof plugin.getSessionToken !== 'function') return legacyToken;

  try {
    const result = await withTimeout(plugin.getSessionToken(), timeoutMs);
    const secureToken = trimToken(result?.token);
    if (secureToken) {
      sessionTokenCache = secureToken;
      storage?.removeItem(SESSION_TOKEN_KEY);
      storage?.setItem(SESSION_PRESENT_KEY, 'true');
      return secureToken;
    }
    if (legacyToken && typeof plugin.setSessionToken === 'function') {
      await withTimeout(plugin.setSessionToken({ token: legacyToken }), timeoutMs);
      sessionTokenCache = legacyToken;
      storage?.removeItem(SESSION_TOKEN_KEY);
      storage?.setItem(SESSION_PRESENT_KEY, 'true');
      return legacyToken;
    }
    storage?.removeItem(SESSION_PRESENT_KEY);
  } catch {
    sessionTokenCache = '';
    try {
      storage?.removeItem(SESSION_TOKEN_KEY);
      storage?.removeItem(SESSION_PRESENT_KEY);
    } catch {}
  }
  return sessionTokenCache;
}

export async function storeSessionTokenSecure(token, options = {}) {
  const normalized = trimToken(token);
  if (!normalized) return false;
  const storage = options.storage ?? globalThis.localStorage;
  const plugin = options.plugin === undefined ? nativeSecurePlugin() : options.plugin;
  const timeoutMs = options.timeoutMs || 2500;
  sessionTokenCache = normalized;

  if (plugin && typeof plugin.setSessionToken === 'function') {
    try {
      await withTimeout(plugin.setSessionToken({ token: normalized }), timeoutMs);
      storage?.removeItem(SESSION_TOKEN_KEY);
      storage?.setItem(SESSION_PRESENT_KEY, 'true');
      return true;
    } catch {
      sessionTokenCache = '';
      try {
        storage?.removeItem(SESSION_TOKEN_KEY);
        storage?.removeItem(SESSION_PRESENT_KEY);
      } catch {}
      return false;
    }
  }
  return storeSessionToken(normalized, storage);
}

export function clearSessionToken(storage = globalThis.localStorage) {
  sessionTokenCache = '';
  try {
    storage?.removeItem(SESSION_TOKEN_KEY);
    storage?.removeItem(SESSION_PRESENT_KEY);
    return true;
  } catch {
    return false;
  }
}

export async function clearSessionTokenSecure(options = {}) {
  const storage = options.storage ?? globalThis.localStorage;
  const plugin = options.plugin === undefined ? nativeSecurePlugin() : options.plugin;
  clearSessionToken(storage);
  if (plugin && typeof plugin.clearSessionToken === 'function') {
    try {
      await withTimeout(plugin.clearSessionToken(), options.timeoutMs || 2500);
    } catch {
      return false;
    }
  }
  return true;
}

export function sessionTokenFromResponse(response) {
  if (!response || typeof response !== 'object') return '';
  return trimToken(response.sessionToken || response.authToken || '');
}
