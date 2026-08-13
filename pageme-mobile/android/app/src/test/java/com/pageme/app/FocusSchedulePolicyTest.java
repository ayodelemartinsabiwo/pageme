package com.pageme.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.time.Instant;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.HashSet;

import org.junit.Test;

public class FocusSchedulePolicyTest {
    private static final ZoneId UTC = ZoneId.of("UTC");

    @Test
    public void oneTimeScheduleOnlyReturnsFutureDateTime() {
        long now = Instant.parse("2026-07-28T08:00:00Z").toEpochMilli();
        assertEquals(Instant.parse("2026-07-28T09:00:00Z").toEpochMilli(),
            FocusSchedulePolicy.nextOnce("2026-07-28", "09:00", now, UTC));
        assertEquals(0L, FocusSchedulePolicy.nextOnce("2026-07-28", "07:00", now, UTC));
    }

    @Test
    public void oneTimeScheduleAllowsLaterTodayInDeviceTimeZone() {
        ZoneId lagos = ZoneId.of("Africa/Lagos");
        long now = Instant.parse("2026-07-30T00:00:00Z").toEpochMilli();
        long expected = Instant.parse("2026-07-30T02:00:00Z").toEpochMilli();
        assertEquals(expected, FocusSchedulePolicy.nextOnce("2026-07-30", "03:00", now, lagos));
        assertEquals(0L, FocusSchedulePolicy.nextOnce("2026-07-30", "00:30", now, lagos));
    }

    @Test
    public void oneTimeScheduleAcceptsTheCurrentSelectedMinute() {
        ZoneId lagos = ZoneId.of("Africa/Lagos");
        long now = Instant.parse("2026-08-02T16:55:40Z").toEpochMilli();
        assertEquals(now + 2_000L,
            FocusSchedulePolicy.nextOnce("2026-08-02", "17:55", now, lagos));
    }

    @Test
    public void weeklyScheduleRollsForwardAcrossWeekBoundary() {
        long fridayEvening = Instant.parse("2026-07-31T18:00:00Z").toEpochMilli();
        long next = FocusSchedulePolicy.nextWeekly("09:00",
            new HashSet<>(Arrays.asList(1, 2, 3, 4, 5)), fridayEvening, UTC);
        assertEquals(Instant.parse("2026-08-03T09:00:00Z").toEpochMilli(), next);
        assertTrue(next > fridayEvening);
    }
}
