import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_FOCUS_SCHEDULE, calendarSyncSummary, focusScheduleSummary, localDateInputValue,
  futureOneTimeSelection, normalizeFocusSchedule, oneTimeScheduleError,
  oneTimeScheduleTimestamp, oneTimeScheduleTrigger,
} from '../src/focus-schedule.js';

test('focus schedule normalization rejects unsafe or invalid values', () => {
  const config = normalizeFocusSchedule({
    enabled: true,
    mode: 'invalid',
    time: '29:77',
    weekdays: [-1, 1, 1, 8],
    durationMinutes: 999,
    calendarKeyword: 'x'.repeat(200),
    calendarAction: 'unsafe',
    calendarLeadMinutes: 999,
  });
  assert.equal(config.mode, 'weekly');
  assert.equal(config.time, DEFAULT_FOCUS_SCHEDULE.time);
  assert.deepEqual(config.weekdays, [1]);
  assert.equal(config.durationMinutes, 60);
  assert.equal(config.calendarKeyword.length, 80);
  assert.equal(config.calendarAction, 'remind');
  assert.equal(config.calendarLeadMinutes, 120);
});

test('focus schedule summary distinguishes local and calendar automation', () => {
  assert.equal(focusScheduleSummary({}), 'OFF');
  assert.equal(focusScheduleSummary({ enabled: true, mode: 'weekly', time: '07:30' }), '07:30');
  assert.equal(focusScheduleSummary({ calendarEnabled: true }), 'CAL REMINDER');
  assert.equal(focusScheduleSummary({ calendarEnabled: true, calendarAction: 'activate' }), 'CAL FOCUS');
});

test('calendar sync feedback explains every zero-result state', () => {
  assert.equal(calendarSyncSummary({ count: 2 }), '2 calendar reminders scheduled');
  assert.match(calendarSyncSummary({ scanned: 0 }), /No future calendar events/);
  assert.match(calendarSyncSummary({ scanned: 3, matched: 0, keywords: 'focus,study' }), /focus or study/);
  assert.match(calendarSyncSummary({ scanned: 3, matched: 2 }), /already passed/);
});

test('one-time schedules allow a future time later today in local time', () => {
  const now = new Date(2026, 6, 30, 1, 0, 0, 0);
  const config = { enabled: true, mode: 'once', date: '2026-07-30', time: '03:00' };
  assert.equal(localDateInputValue(now), '2026-07-30');
  assert.equal(oneTimeScheduleError(config, now.getTime()), '');
  assert.equal(oneTimeScheduleTimestamp(config), new Date(2026, 6, 30, 3, 0, 0, 0).getTime());
});

test('one-time schedules reject past local times but allow tomorrow', () => {
  const now = new Date(2026, 6, 30, 4, 0, 0, 0).getTime();
  assert.match(oneTimeScheduleError({
    enabled: true, mode: 'once', date: '2026-07-30', time: '03:00',
  }, now), /passed today/);
  assert.equal(oneTimeScheduleError({
    enabled: true, mode: 'once', date: '2026-07-31', time: '00:01',
  }, now), '');
});

test('one-time schedules accept the currently selected minute without rolling to tomorrow', () => {
  const now = new Date(2026, 7, 2, 17, 55, 40, 0).getTime();
  const config = { enabled: true, mode: 'once', date: '2026-08-02', time: '17:55' };
  assert.equal(oneTimeScheduleError(config, now), '');
  assert.equal(oneTimeScheduleTrigger(config, now), now + 2_000);
});

test('expired one-time selections default to a future local time instead of tomorrow', () => {
  const now = new Date(2026, 7, 2, 17, 50, 30, 0);
  const updated = futureOneTimeSelection({
    enabled: true, mode: 'once', date: '2026-08-02', time: '09:00',
  }, now);
  assert.equal(updated.date, '2026-08-02');
  assert.equal(updated.time, '17:55');
});
