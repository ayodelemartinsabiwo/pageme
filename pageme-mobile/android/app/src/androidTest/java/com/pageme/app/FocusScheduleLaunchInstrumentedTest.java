package com.pageme.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;
import android.os.ParcelFileDescriptor;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;

import java.lang.reflect.Method;
import java.io.FileInputStream;

@RunWith(AndroidJUnit4.class)
public class FocusScheduleLaunchInstrumentedTest {
    @Test
    public void exactAlarmPromotesPageMeOverSamsungHome() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        setAppOp("SYSTEM_ALERT_WINDOW", "allow");
        setAppOp("SCHEDULE_EXACT_ALARM", "allow");
        try {
            context.getSharedPreferences(FocusScheduleManager.PREFS, Context.MODE_PRIVATE).edit()
                .putBoolean("pager_mode_active", false)
                .putBoolean("notification_capture_enabled", false)
                .putBoolean("bypass_relaunch", true)
                .putLong("focus_lock_until", 0L)
                .commit();
            LauncherPlugin.enableLauncherAlias(context, false);

            Intent home = new Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_HOME)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(home);
            long homeDeadline = System.currentTimeMillis() + 2_000L;
            while (MainActivity.isResumed && System.currentTimeMillis() < homeDeadline) {
                Thread.sleep(25L);
            }

            Method scheduleAlarm = FocusScheduleManager.class.getDeclaredMethod(
                "scheduleAlarm", Context.class, int.class, long.class,
                String.class, int.class, String.class);
            scheduleAlarm.setAccessible(true);
            long target = System.currentTimeMillis() + 4_000L;
            Object scheduled = scheduleAlarm.invoke(null, context, 7999, target,
                FocusScheduleManager.KIND_LOCAL, 15, "Scheduled focus test");
            assertEquals(Boolean.TRUE, scheduled);

            long deadline = target + 5_000L;
            while (!context.getSharedPreferences(FocusScheduleManager.PREFS, Context.MODE_PRIVATE)
                    .getBoolean("pager_mode_active", false) && System.currentTimeMillis() < deadline) {
                Thread.sleep(50L);
            }
            long lateness = System.currentTimeMillis() - target;
            assertTrue("Exact schedule was " + lateness + "ms late", lateness < 2_000L);

            long launchDeadline = target + 3_000L;
            while (!MainActivity.isResumed && System.currentTimeMillis() < launchDeadline) {
                Thread.sleep(25L);
            }
            long launchLateness = System.currentTimeMillis() - target;
            assertTrue("PageMe foreground takeover was " + launchLateness + "ms late",
                MainActivity.isResumed && launchLateness < 3_000L);
        } finally {
            LauncherPlugin.leavePagerMode(context, null, true);
            setAppOp("SYSTEM_ALERT_WINDOW", "default");
        }
    }

    @Test
    public void calendarReminderDoesNotActivateOrPinPagerMode() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.getSharedPreferences(FocusScheduleManager.PREFS, Context.MODE_PRIVATE).edit()
            .putString(FocusScheduleManager.CONFIG_KEY,
                "{\"calendarEnabled\":true,\"calendarAction\":\"remind\"}")
            .putBoolean("pager_mode_active", false)
            .putBoolean("notification_capture_enabled", false)
            .putLong("focus_lock_until", 0L)
            .commit();

        Intent reminder = new Intent(context, FocusScheduleReceiver.class)
            .putExtra(FocusScheduleManager.EXTRA_KIND, FocusScheduleManager.KIND_CALENDAR)
            .putExtra(FocusScheduleManager.EXTRA_DURATION, 60)
            .putExtra(FocusScheduleManager.EXTRA_LABEL, "Study mathematics");
        FocusScheduleManager.handleTrigger(context, reminder);

        assertTrue(!context.getSharedPreferences(FocusScheduleManager.PREFS, Context.MODE_PRIVATE)
            .getBoolean("pager_mode_active", false));
        assertEquals(0L, context.getSharedPreferences(FocusScheduleManager.PREFS, Context.MODE_PRIVATE)
            .getLong("focus_lock_until", 0L));
    }

    @Test
    public void priorHomeConsentAndScheduleCancellationSurviveTransientAliasChanges() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        try {
            context.getSharedPreferences(FocusScheduleManager.PREFS, Context.MODE_PRIVATE).edit()
                .putBoolean("launcher_user_selected", true)
                .putString(FocusScheduleManager.CONFIG_KEY,
                    "{\"enabled\":true,\"mode\":\"weekly\",\"calendarEnabled\":true,\"calendarAction\":\"remind\"}")
                .commit();
            LauncherPlugin.enableLauncherAlias(context, false);

            assertTrue(LauncherPlugin.hasHomeTakeoverConsent(context));
            JSONObject cancelled = FocusScheduleManager.cancelScheduledActivation(context);
            assertFalse(cancelled.optBoolean("enabled", true));
            assertTrue(cancelled.optBoolean("calendarEnabled", false));
            assertEquals(0L, context.getSharedPreferences(FocusScheduleManager.PREFS, Context.MODE_PRIVATE)
                .getLong("focus_schedule_next_local", 0L));
        } finally {
            LauncherPlugin.clearLauncherSelectionState(context);
        }
    }

    @Test
    public void emergencyExitAlarmRestoresPagerAndPreservesFocusDeadline() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        setAppOp("SYSTEM_ALERT_WINDOW", "allow");
        setAppOp("SCHEDULE_EXACT_ALARM", "allow");
        try {
            long focusDeadline = System.currentTimeMillis() + 60_000L;
            context.getSharedPreferences(FocusScheduleManager.PREFS, Context.MODE_PRIVATE).edit()
                .putBoolean("pager_mode_active", true)
                .putBoolean("notification_capture_enabled", true)
                .putBoolean("bypass_relaunch", true)
                .putLong("focus_lock_until", focusDeadline)
                .commit();
            LauncherPlugin.enableLauncherAlias(context, false);
            LauncherPlugin.launchSystemHome(context);
            long target = System.currentTimeMillis() + 3_000L;
            EmergencyExitManager.schedule(context, target);

            long deadline = target + 4_000L;
            while ((context.getSharedPreferences(FocusScheduleManager.PREFS, Context.MODE_PRIVATE)
                    .getBoolean("bypass_relaunch", true) || !MainActivity.isResumed)
                    && System.currentTimeMillis() < deadline) {
                Thread.sleep(25L);
            }

            assertFalse(context.getSharedPreferences(FocusScheduleManager.PREFS, Context.MODE_PRIVATE)
                .getBoolean("bypass_relaunch", true));
            assertTrue(MainActivity.isResumed);
            assertEquals(focusDeadline, context.getSharedPreferences(FocusScheduleManager.PREFS, Context.MODE_PRIVATE)
                .getLong("focus_lock_until", 0L));
        } finally {
            LauncherPlugin.leavePagerMode(context, null, true);
            setAppOp("SYSTEM_ALERT_WINDOW", "default");
        }
    }

    private void setAppOp(String operation, String mode) throws Exception {
        String command = "appops set com.pageme.app " + operation + " " + mode;
        try (ParcelFileDescriptor descriptor = InstrumentationRegistry.getInstrumentation()
                .getUiAutomation().executeShellCommand(command);
             FileInputStream stream = new FileInputStream(descriptor.getFileDescriptor())) {
            byte[] buffer = new byte[256];
            while (stream.read(buffer) >= 0) { /* wait for shell completion */ }
        }
    }
}
