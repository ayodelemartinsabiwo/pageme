export function safeJsonParse(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export function readJsonStorage(key, fallback, storage = globalThis.localStorage) {
  try {
    if (!storage) return fallback;
    return safeJsonParse(storage.getItem(key), fallback);
  } catch {
    return fallback;
  }
}

export function writeJsonStorage(key, value, storage = globalThis.localStorage) {
  try {
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
