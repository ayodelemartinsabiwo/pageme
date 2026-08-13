package com.pageme.app;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Set;

final class FocusSchedulePolicy {
    private FocusSchedulePolicy() {}

    static long nextOnce(String dateValue, String timeValue, long nowMillis, ZoneId zone) {
        try {
            ZonedDateTime now = ZonedDateTime.ofInstant(Instant.ofEpochMilli(nowMillis), zone);
            ZonedDateTime target = LocalDateTime.of(LocalDate.parse(dateValue), LocalTime.parse(timeValue)).atZone(zone);
            if (target.isAfter(now)) return target.toInstant().toEpochMilli();
            long elapsedInSelectedMinute = nowMillis - target.toInstant().toEpochMilli();
            return elapsedInSelectedMinute >= 0L && elapsedInSelectedMinute < 60_000L
                ? nowMillis + 2_000L : 0L;
        } catch (Exception ignored) {
            return 0L;
        }
    }

    static long nextWeekly(String timeValue, Set<Integer> weekdays, long nowMillis, ZoneId zone) {
        try {
            LocalTime time = LocalTime.parse(timeValue);
            ZonedDateTime now = ZonedDateTime.ofInstant(Instant.ofEpochMilli(nowMillis), zone);
            for (int offset = 0; offset <= 7; offset++) {
                LocalDate date = now.toLocalDate().plusDays(offset);
                if (!weekdays.contains(dayIndex(date.getDayOfWeek()))) continue;
                ZonedDateTime target = LocalDateTime.of(date, time).atZone(zone);
                if (target.isAfter(now)) return target.toInstant().toEpochMilli();
            }
        } catch (Exception ignored) {}
        return 0L;
    }

    private static int dayIndex(DayOfWeek day) {
        return day == DayOfWeek.SUNDAY ? 0 : day.getValue();
    }
}
