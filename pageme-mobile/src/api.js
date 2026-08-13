import { PAGEME_SCRIPT_URL } from './config.js';

const DEFAULT_TIMEOUT_MS = 12000;

export class PageMeApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'PageMeApiError';
    if (options.status) this.status = options.status;
    if (options.cause) this.cause = options.cause;
  }
}

export async function postPageMe(payload, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
  } = options;

  if (typeof fetchImpl !== 'function') {
    throw new PageMeApiError('Network is unavailable on this device.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(PAGEME_SCRIPT_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new PageMeApiError(`PageMe server returned HTTP ${response.status}.`, {
        status: response.status,
      });
    }

    try {
      return await response.json();
    } catch (cause) {
      throw new PageMeApiError('PageMe server returned invalid JSON.', { cause });
    }
  } catch (error) {
    if (error instanceof PageMeApiError) throw error;
    if (error && error.name === 'AbortError') {
      throw new PageMeApiError('PageMe server timed out. Check your connection and try again.', {
        cause: error,
      });
    }
    throw new PageMeApiError('Could not reach PageMe server. Check your connection and try again.', {
      cause: error,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
