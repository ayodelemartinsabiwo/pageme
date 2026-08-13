export const MAX_INBOX_MESSAGES = 200;
export const DUPLICATE_PAGE_WINDOW_MS = 5 * 60 * 1000;

export function inboxStorageKey(capCode) {
  const normalized = typeof capCode === 'string' ? capCode.trim().toUpperCase() : '';
  return normalized ? `pageme_inbox_${normalized}` : '';
}

export function isWeatherPage(item) {
  if (!item || typeof item !== 'object') return false;
  const source = typeof item.source === 'string' ? item.source.toLowerCase() : '';
  const content = `${item.from || ''} ${item.text || ''}`.toLowerCase();
  if (source.includes('weather') || source.includes('forecast')) return true;
  const unmistakableForecast = /forecast|temperature|humidity|uv index|cooling|warming|heat advisory|rain expected|chance of rain|showers|thunderstorm|snow expected|\buv\b.*\b(?:extreme|high|moderate|low)\b/;
  if (unmistakableForecast.test(content)) return true;
  return source === 'google' && content.includes('weather');
}

export function isAlarmPage(item) {
  if (!item || typeof item !== 'object') return false;
  const source = typeof item.source === 'string' ? item.source.trim().toLowerCase() : '';
  return source === 'alarm' || source === 'clock' || source === 'samsung clock';
}

export function normalizePageSource(source) {
  const value = typeof source === 'string' ? source.trim() : '';
  return value.toLowerCase() === 'pageme' ? 'sms' : (value || 'sms');
}

export function pageContentKey(item) {
  if (!item || typeof item !== 'object') return '';
  const senderIdentity = typeof item.senderKey === 'string' && item.senderKey.trim()
    ? item.senderKey
    : item.from;
  return [normalizePageSource(item.source), senderIdentity, item.number, item.text]
    .map(value => typeof value === 'string' ? value.trim().toLowerCase() : '')
    .join('\x00');
}

function pageTimestamp(id) {
  const match = typeof id === 'string' ? /^p(\d{13})$/.exec(id.trim()) : null;
  return match ? Number(match[1]) : 0;
}

export function normalizeInbox(value, limit = MAX_INBOX_MESSAGES) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const recentContent = new Map();
  const messages = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    if (isWeatherPage(item) || isAlarmPage(item)) continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const text = typeof item.text === 'string' ? item.text.slice(0, 500) : '';
    const source = normalizePageSource(item.source);
    if (!id || seen.has(id)) continue;
    const contentKey = pageContentKey({ ...item, source, text });
    const timestamp = pageTimestamp(id);
    const previous = recentContent.get(contentKey);
    const sameDisplayedMinute = previous
      && typeof item.date === 'string' && item.date.length > 0
      && typeof item.time === 'string' && item.time.length > 0
      && previous.date === item.date
      && previous.time === item.time;
    const isRapidDuplicate = previous
      && timestamp > 0
      && previous.timestamp > 0
      && Math.abs(previous.timestamp - timestamp) <= DUPLICATE_PAGE_WINDOW_MS;
    if (contentKey && (sameDisplayedMinute || isRapidDuplicate)) continue;
    seen.add(id);
    if (contentKey) {
      recentContent.set(contentKey, {
        timestamp,
        date: item.date,
        time: item.time,
      });
    }
    messages.push({
      id,
      from: typeof item.from === 'string' && item.from.trim() ? item.from.trim().slice(0, 100) : 'UNKNOWN',
      number: typeof item.number === 'string' ? item.number.slice(0, 40) : '',
      text,
      type: item.type === 'code' ? 'code' : 'text',
      source: source.slice(0, 100),
      time: typeof item.time === 'string' ? item.time.slice(0, 20) : '',
      date: typeof item.date === 'string' ? item.date.slice(0, 30) : '',
      read: item.read === true,
      canReply: item.canReply === true,
      replyKey: typeof item.replyKey === 'string' ? item.replyKey.slice(0, 500) : '',
      senderKey: typeof item.senderKey === 'string' ? item.senderKey.trim().slice(0, 500) : '',
    });
    if (messages.length >= limit) break;
  }

  return messages;
}
