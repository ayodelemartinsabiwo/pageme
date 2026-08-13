export const DEFAULT_FOCUS_SCHEDULE = Object.freeze({
  enabled: false,
  mode: 'weekly',
  date: '',
  time: '09:00',
  weekdays: [1, 2, 3, 4, 5],
  durationMinutes: 60,
  calendarEnabled: false,
  calendarAction: 'remind',
  calendarKeyword: 'focus,study',
  calendarLeadMinutes: 10,
});

const VALID_DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

export function localDateInputValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function oneTimeScheduleTimestamp(value = {}) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.date || '');
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.time || '');
  if (!dateMatch || !timeMatch) return Number.NaN;
  const target = new Date(
    Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]),
    Number(timeMatch[1]), Number(timeMatch[2]), 0, 0,
  );
  if (target.getFullYear() !== Number(dateMatch[1])
      || target.getMonth() !== Number(dateMatch[2]) - 1
      || target.getDate() !== Number(dateMatch[3])) return Number.NaN;
  return target.getTime();
}

export function oneTimeScheduleTrigger(value = {}, nowMillis = Date.now()) {
  const target = oneTimeScheduleTimestamp(value);
  if (!Number.isFinite(target)) return Number.NaN;
  if (target > nowMillis) return target;
  // Time inputs have minute precision. Saving during the selected minute should
  // activate immediately instead of failing because seconds have elapsed.
  if (nowMillis - target < 60_000) return nowMillis + 2_000;
  return Number.NaN;
}

export function futureOneTimeSelection(value = {}, nowValue = new Date()) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const current = normalizeFocusSchedule(value);
  if (current.mode !== 'once') return current;
  if (Number.isFinite(oneTimeScheduleTrigger(current, now.getTime()))) return current;
  const next = new Date(now.getTime() + 5 * 60_000);
  next.setSeconds(0, 0);
  return {
    ...current,
    date: localDateInputValue(next),
    time: `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`,
  };
}

export function oneTimeScheduleError(value = {}, nowMillis = Date.now()) {
  const config = normalizeFocusSchedule(value);
  if (!config.enabled || config.mode !== 'once') return '';
  const target = oneTimeScheduleTrigger(config, nowMillis);
  if (!Number.isFinite(target)) {
    return 'That time has already passed today. Choose a later time today or another date';
  }
  return '';
}

export function normalizeFocusSchedule(value = {}) {
  const mode = value.mode === 'once' ? 'once' : 'weekly';
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time || '')
    ? value.time
    : DEFAULT_FOCUS_SCHEDULE.time;
  const weekdays = Array.isArray(value.weekdays)
    ? [...new Set(value.weekdays.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
    : [...DEFAULT_FOCUS_SCHEDULE.weekdays];
  const duration = Number(value.durationMinutes);
  const lead = Number(value.calendarLeadMinutes);
  return {
    enabled: value.enabled === true,
    mode,
    date: /^\d{4}-\d{2}-\d{2}$/.test(value.date || '') ? value.date : '',
    time,
    weekdays: weekdays.length ? weekdays : [...DEFAULT_FOCUS_SCHEDULE.weekdays],
    durationMinutes: VALID_DURATIONS.includes(duration) ? duration : DEFAULT_FOCUS_SCHEDULE.durationMinutes,
    calendarEnabled: value.calendarEnabled === true,
    calendarAction: value.calendarAction === 'activate' ? 'activate' : 'remind',
    calendarKeyword: typeof value.calendarKeyword === 'string'
      ? value.calendarKeyword.trim().slice(0, 80)
      : DEFAULT_FOCUS_SCHEDULE.calendarKeyword,
    calendarLeadMinutes: Number.isFinite(lead) ? Math.max(0, Math.min(120, Math.round(lead))) : DEFAULT_FOCUS_SCHEDULE.calendarLeadMinutes,
  };
}

export function focusScheduleSummary(value, nextTriggerAt = 0) {
  const config = normalizeFocusSchedule(value);
  if (!config.enabled && !config.calendarEnabled) return 'OFF';
  if (nextTriggerAt > Date.now()) {
    const next = new Date(nextTriggerAt);
    return `NEXT ${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`;
  }
  if (config.enabled) return config.mode === 'once' ? `${config.date || 'DATE'} ${config.time}` : config.time;
  return config.calendarAction === 'activate' ? 'CAL FOCUS' : 'CAL REMINDER';
}

export function calendarSyncSummary(result = {}) {
  const scheduled = Number(result.count) || 0;
  const scanned = Number(result.scanned) || 0;
  const matched = Number(result.matched) || 0;
  if (scheduled > 0) return `${scheduled} calendar reminder${scheduled === 1 ? '' : 's'} scheduled`;
  if (scanned === 0) return 'No future calendar events are available on this device yet';
  if (matched === 0) {
    const keywords = String(result.keywords || 'focus,study').split(',').map(value => value.trim()).filter(Boolean).join(' or ');
    return `No event titles matched ${keywords || 'the selected keywords'}`;
  }
  return 'Matching events were found, but their reminder time has already passed';
}
