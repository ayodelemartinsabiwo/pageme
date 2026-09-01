import { normalizeInbox } from './inbox.js';

export const PAGEME_NETWORK_SOURCE = 'pageme-network';
export const MESSAGE_SYNC_INTERVAL_MS = 10_000;

export function normalizeUcn(value) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z]{3}-\d{1,4}$/.test(normalized) ? normalized : '';
}

export function messageCursorStorageKey(ucn) {
  const normalized = normalizeUcn(ucn);
  return normalized ? `pageme_message_cursor_${normalized}` : '';
}

export function isRetryableMessageError(code) {
  return !code || ['SERVER_ERROR', 'RATE_LIMIT'].includes(String(code).toUpperCase());
}

export function pruneExpiredNetworkMessages(inbox, retentionDays, serverTime = Date.now()) {
  const days = Math.max(1, Number(retentionDays) || 0);
  const serverTimestamp = typeof serverTime === 'number' ? serverTime : Date.parse(serverTime || '');
  if (!days || !Number.isFinite(serverTimestamp)) return normalizeInbox(inbox);
  const cutoff = serverTimestamp - days * 86400000;
  return normalizeInbox((Array.isArray(inbox) ? inbox : []).filter(message => {
    if (message?.source !== PAGEME_NETWORK_SOURCE) return true;
    const createdAt = Date.parse(message.createdAt || '');
    return !Number.isFinite(createdAt) || createdAt >= cutoff;
  }));
}

export function createClientMessageId(ucn, cryptoImpl = globalThis.crypto, now = Date.now()) {
  const sender = normalizeUcn(ucn) || 'UNKNOWN';
  if (cryptoImpl && typeof cryptoImpl.randomUUID === 'function') {
    return `${sender}:${cryptoImpl.randomUUID()}`;
  }
  const random = Math.random().toString(36).slice(2, 14);
  return `${sender}:${now.toString(36)}:${random}`;
}

function asIso(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function formatMessageTime(createdAt) {
  const date = createdAt ? new Date(createdAt) : new Date();
  const valid = Number.isNaN(date.getTime()) ? new Date() : date;
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return {
    date: `${months[valid.getMonth()]} ${String(valid.getDate()).padStart(2, '0')}`,
    time: `${String(valid.getHours()).padStart(2, '0')}:${String(valid.getMinutes()).padStart(2, '0')}`,
  };
}

export function networkMessageStatus(message, currentUcn) {
  const sender = normalizeUcn(message?.fromUcn);
  if (!sender || sender !== normalizeUcn(currentUcn)) return '';
  if (message?.readAt) return 'read';
  if (message?.deliveredAt) return 'delivered';
  return 'sent';
}

export function serverMessageToInbox(message, currentUcn) {
  if (!message || typeof message !== 'object') return null;
  const id = typeof message.id === 'string' ? message.id.trim() : '';
  const fromUcn = normalizeUcn(message.fromUcn);
  const toUcn = normalizeUcn(message.toUcn);
  const me = normalizeUcn(currentUcn);
  const text = typeof message.message === 'string' ? message.message.slice(0, 500) : '';
  if (!id || !fromUcn || !toUcn || !me || !text || (fromUcn !== me && toUcn !== me)) return null;

  const outgoing = fromUcn === me;
  const otherUcn = outgoing ? toUcn : fromUcn;
  const createdAt = asIso(message.createdAt) || new Date().toISOString();
  const stamp = formatMessageTime(createdAt);
  return {
    id,
    serverMessageId: id,
    clientMessageId: typeof message.clientMessageId === 'string' ? message.clientMessageId.slice(0, 120) : '',
    from: otherUcn,
    number: otherUcn,
    text,
    type: message.type === 'code' ? 'code' : 'text',
    source: PAGEME_NETWORK_SOURCE,
    time: stamp.time,
    date: stamp.date,
    read: outgoing || !!message.readAt,
    canReply: true,
    replyKey: '',
    senderKey: `pageme:${otherUcn}`,
    direction: outgoing ? 'outgoing' : 'incoming',
    status: networkMessageStatus(message, me),
    createdAt,
    deliveredAt: asIso(message.deliveredAt),
    readAt: asIso(message.readAt),
    replyToId: typeof message.replyToId === 'string' ? message.replyToId.slice(0, 120) : '',
  };
}

export function mergeNetworkMessages(inbox, serverMessages, currentUcn) {
  const payload = Array.isArray(serverMessages) ? serverMessages : [];
  const deletedIds = new Set(payload
    .filter(message => message?.deleted === true && typeof message.id === 'string')
    .map(message => message.id.trim())
    .filter(Boolean));
  const existing = (Array.isArray(inbox) ? inbox : [])
    .filter(message => !deletedIds.has(message?.id));
  const mapped = payload
    .filter(message => message?.deleted !== true)
    .map(message => serverMessageToInbox(message, currentUcn))
    .filter(Boolean);
  if (!mapped.length) return normalizeInbox(existing);

  const updates = new Map(mapped.map(message => [message.id, message]));
  const merged = existing.map(message => updates.has(message.id)
    ? { ...message, ...updates.get(message.id) }
    : message);
  const known = new Set(existing.map(message => message?.id));
  for (const message of mapped) {
    if (!known.has(message.id)) merged.push(message);
  }

  merged.sort((left, right) => {
    const leftTime = Date.parse(left?.createdAt || '') || 0;
    const rightTime = Date.parse(right?.createdAt || '') || 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return String(right?.id || '').localeCompare(String(left?.id || ''));
  });
  return normalizeInbox(merged);
}

export function newIncomingNetworkMessages(inbox, serverMessages, currentUcn) {
  const known = new Set((Array.isArray(inbox) ? inbox : []).map(message => message?.id));
  return (Array.isArray(serverMessages) ? serverMessages : [])
    .filter(message => message?.deleted !== true)
    .map(message => serverMessageToInbox(message, currentUcn))
    .filter(message => message && message.direction === 'incoming' && !known.has(message.id));
}
