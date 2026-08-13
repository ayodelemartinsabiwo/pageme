package com.pageme.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

final class EmergencyExitManager {
    static final String ACTION_RESTORE = "com.pageme.app.EMERGENCY_EXIT_RESTORE";
    static final String PREF_RESTORE_AT = "emergency_restore_at";
    private static final int REQUEST_CODE = 7601;

    private EmergencyExitManager() {}

    static void schedule(Context context, long restoreAt) {
        context.getSharedPreferences(FocusScheduleManager.PREFS, Context.MODE_PRIVATE).edit()
            .putLong(PREF_RESTORE_AT, restoreAt)
            .putBoolean("bypass_relaunch", true)
            .commit();
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;
        PendingIntent pending = restorePendingIntent(context, PendingIntent.FLAG_UPDATE_CURRENT);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    && FocusScheduleManager.canScheduleExactAlarms(context)) {
                manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, restoreAt, pending);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, restoreAt, pending);
            } else {
                manager.setExact(AlarmManager.RTC_WAKEUP, restoreAt, pending);
            }
        } catch (SecurityException ignored) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, restoreAt, pending);
            } else {
                manager.set(AlarmManager.RTC_WAKEUP, restoreAt, pending);
            }
        }
    }

    static boolean consumeRestoreIntent(Context context, Intent intent) {
        if (intent == null || !ACTION_RESTORE.equals(intent.getAction())) return false;
        restorePagerState(context);
        intent.setAction(null);
        return true;
    }

    static void handleRestoreAlarm(Context context) {
        boolean pagerActive = restorePagerState(context);
        if (!pagerActive) return;
        try {
            Intent restore = new Intent(context, MainActivity.class)
                .setAction(ACTION_RESTORE)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NO_ANIMATION);
            context.startActivity(restore);
        } catch (Exception ignored) {}
    }

    static void restoreNow(Context context) {
        cancel(context);
        restorePagerState(context);
    }

    static void cancelAndClear(Context context) {
        cancel(context);
        context.getSharedPreferences(FocusScheduleManager.PREFS, Context.MODE_PRIVATE).edit()
            .remove(PREF_RESTORE_AT)
            .apply();
    }

    static void rescheduleIfPending(Context context) {
        long restoreAt = context.getSharedPreferences(FocusScheduleManager.PREFS, Context.MODE_PRIVATE)
            .getLong(PREF_RESTORE_AT, 0L);
        if (restoreAt > 0L) schedule(context, Math.max(restoreAt, System.currentTimeMillis() + 1_000L));
    }

    private static boolean restorePagerState(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(FocusScheduleManager.PREFS, Context.MODE_PRIVATE);
        boolean pagerActive = prefs.getBoolean("pager_mode_active", false);
        SharedPreferences.Editor editor = prefs.edit().remove(PREF_RESTORE_AT);
        if (pagerActive) editor.putBoolean("bypass_relaunch", false);
        editor.commit();
        if (pagerActive) LauncherPlugin.enableLauncherAlias(context, true);
        return pagerActive;
    }

    private static void cancel(Context context) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pending = restorePendingIntent(context, PendingIntent.FLAG_NO_CREATE);
        if (manager != null && pending != null) manager.cancel(pending);
        if (pending != null) pending.cancel();
        PendingIntent legacyActivity = legacyActivityPendingIntent(context);
        if (manager != null && legacyActivity != null) manager.cancel(legacyActivity);
        if (legacyActivity != null) legacyActivity.cancel();
    }

    private static PendingIntent restorePendingIntent(Context context, int lookupFlag) {
        Intent restore = new Intent(context, FocusScheduleReceiver.class).setAction(ACTION_RESTORE);
        return PendingIntent.getBroadcast(context, REQUEST_CODE, restore,
            lookupFlag | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent legacyActivityPendingIntent(Context context) {
        Intent restore = new Intent(context, MainActivity.class)
            .setAction(ACTION_RESTORE)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NO_ANIMATION);
        return PendingIntent.getActivity(context, REQUEST_CODE, restore,
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
    }
}
