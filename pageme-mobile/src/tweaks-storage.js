export const TWEAKS_STORAGE_KEY = 'pageme_appearance_settings';

export function normalizePersistedTweaks(value, defaults) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = { ...defaults };
  for (const [key, fallback] of Object.entries(defaults)) {
    const candidate = source[key];
    if (typeof candidate !== typeof fallback) continue;
    if (typeof candidate === 'number' && !Number.isFinite(candidate)) continue;
    result[key] = candidate;
  }
  return result;
}

export function readPersistedTweaks(defaults, storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(TWEAKS_STORAGE_KEY);
    return normalizePersistedTweaks(raw ? JSON.parse(raw) : {}, defaults);
  } catch (error) {
    return { ...defaults };
  }
}

export function writePersistedTweaks(value, defaults, storage = globalThis.localStorage) {
  const normalized = normalizePersistedTweaks(value, defaults);
  try { storage?.setItem(TWEAKS_STORAGE_KEY, JSON.stringify(normalized)); } catch (error) {}
  return normalized;
}
