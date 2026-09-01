const TERMINAL_VERIFICATION_CODES = new Set([
  'CHALLENGE_EXPIRED',
  'CHALLENGE_LOCKED',
  'INVALID_CHALLENGE',
  'RATE_LIMIT',
]);

export function verificationFailureFromResponse(response) {
  if (!response || response.status === 'success') return null;
  const code = String(response.code || 'REQUEST_ERROR').trim().toUpperCase();
  return {
    code,
    message: response.error || 'The verification code could not be confirmed.',
    requiresNewCode: TERMINAL_VERIFICATION_CODES.has(code),
  };
}
