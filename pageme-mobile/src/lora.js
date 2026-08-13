export const LORA_ENABLED_KEY = "pageme_lora_enabled";
export const LORA_CONSENT_KEY = "pageme_lora_consent_v1";

export function readLoraEnabled(storage) {
  try {
    const target = storage || globalThis.localStorage;
    return target?.getItem(LORA_ENABLED_KEY) === "true" &&
      target?.getItem(LORA_CONSENT_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeLoraEnabled(enabled, storage) {
  try {
    const target = storage || globalThis.localStorage;
    target?.setItem(LORA_ENABLED_KEY, enabled ? "true" : "false");
    if (enabled) target?.setItem(LORA_CONSENT_KEY, "true");
  } catch {
    // Keep the in-memory setting usable when storage is unavailable.
  }
}

export function shouldStartLora({ activated, enabled, capacitor, plugin }) {
  return Boolean(activated && enabled && capacitor && plugin);
}
