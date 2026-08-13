package com.pageme.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.CalendarContract;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

final class FocusScheduleManager {
    static final String PREFS = "PageMePrefs";
    static final String CONFIG_KEY = "focus_schedule_config";
    static final String ACTION_TRIGGER = "com.pageme.app.FOCUS_SCHEDULE_TRIGGER";
    static final String EXTRA_KIND = "kind";
    static final String EXTRA_DURATION = "duration";
    static final String EXTRA_LABEL = "label";
    static final String KIND_LOCAL = "local";
    static final String KIND_CALENDAR = "calendar";
    static final String CALENDAR_ACTION_REMIND = "remind";
    static final String CALENDAR_ACTION_ACTIVATE = "activate";
    static final int LOCAL_REQUEST_CODE = 7301;
    static final int CALENDAR_REQUEST_BASE = 7400;
    static final int REMINDER_NOTIFICATION_ID = 7302;
    private static final String CALENDAR_CODES_KEY = "focus_calendar_alarm_codes";
    private static final String NEXT_LOCAL_KEY = "focus_schedule_next_local";
    private static final String NEXT_CALENDAR_KEY = "focus_schedule_next_calendar";
    private static final String CHANNEL_ID = "pageme_focus_reminders";
    private static final long CALENDAR_HORIZON_MS = 30L * 24L * 60L * 60L * 1000L;
    private static final int MAX_CALENDAR_ALARMS = 40;

    private FocusScheduleManager() {}

    static final class CalendarSyncResult {
        int scheduled;
        int scanned;
        int matched;
    }

    static JSONObject defaultConfig() {
        JSONObject config = new JSONObject();
        try {
            config.put("enabled", false);
            config.put("mode", "weekly");
            config.put("date", "");
            config.put("time", "09:00");
            config.put("weekdays", new JSONArray("[1,2,3,4,5]"));
            config.put("durationMinutes", 60);
            config.put("calendarEnabled", false);
            config.put("calendarAction", CALENDAR_ACTION_REMIND);
            config.put("calendarKeyword", "focus,study");
            config.put("calendarLeadMinutes", 10);
        } catch (Exception ignored) {}
        return config;
    }

    static JSONObject getConfig(Context context) {
        String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(CONFIG_KEY, "");
        try {
            return sanitizeConfig(raw.isEmpty() ? defaultConfig() : new JSONObject(raw));
        } catch (Exception ignored) {
            return defaultConfig();
        }
    }

    static JSONObject saveConfig(Context context, JSONObject input) {
        JSONObject config = sanitizeConfig(input);
        boolean localEnabled = config.optBoolean("enabled", false);
        boolean calendarEnabled = config.optBoolean("calendarEnabled", false);
        boolean calendarTakeover = calendarEnabled && CALENDAR_ACTION_ACTIVATE.equals(
            config.optString("calendarAction", CALENDAR_ACTION_REMIND));
        boolean takeoverEnabled = localEnabled || calendarTakeover;
        if ((localEnabled || calendarEnabled) && !canScheduleExactAlarms(context)) {
            throw new IllegalArgumentException("Allow precise alarms before saving an active automation");
        }
        if (calendarEnabled && !hasCalendarPermission(context)) {
            throw new IllegalArgumentException("Allow calendar access before saving calendar reminders");
        }
        if (calendarEnabled && !calendarTakeover && !canPostReminders(context)) {
            throw new IllegalArgumentException("Allow reminder notifications before saving calendar reminders");
        }
        if (takeoverEnabled && !LauncherPlugin.hasHomeTakeoverConsent(context)) {
            throw new IllegalArgumentException("Allow PageMe as Home before saving automatic activation");
        }
        if (takeoverEnabled && !canAutoLaunch(context)) {
            throw new IllegalArgumentException("Allow automatic launch before saving an active automation");
        }
        if (localEnabled
                && "once".equals(config.optString("mode", "weekly"))
                && nextLocalTrigger(config, System.currentTimeMillis()) <= 0L) {
            throw new IllegalArgumentException("That time has already passed today. Choose a later time today or another date");
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(CONFIG_KEY, config.toString()).commit();
        scheduleAll(context);
        return config;
    }

    static JSONObject cancelScheduledActivation(Context context) {
        JSONObject config = getConfig(context);
        try { config.put("enabled", false); } catch (Exception ignored) {}
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(CONFIG_KEY, config.toString())
            .putLong(NEXT_LOCAL_KEY, 0L)
            .commit();
        cancelAlarm(context, LOCAL_REQUEST_CODE);
        return config;
    }

    static boolean hasEnabledAutomation(Context context) {
        JSONObject config = getConfig(context);
        return config.optBoolean("enabled", false) || config.optBoolean("calendarEnabled", false);
    }

    static void scheduleAll(Context context) {
        scheduleLocal(context);
        syncCalendar(context);
    }

    static long nextTriggerAt(Context context) {
        if (!canScheduleExactAlarms(context)) return 0L;
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long local = prefs.getLong(NEXT_LOCAL_KEY, 0L);
        long calendar = prefs.getLong(NEXT_CALENDAR_KEY, 0L);
        if (local <= 0L) return calendar;
        if (calendar <= 0L) return local;
        return Math.min(local, calendar);
    }

    static boolean canScheduleExactAlarms(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        return manager != null && manager.canScheduleExactAlarms();
    }

    static boolean canPostReminders(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel channel = manager == null ? null : manager.getNotificationChannel(CHANNEL_ID);
            if (channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE) return false;
        }
        return true;
    }

    static boolean canAutoLaunch(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context);
    }

    static boolean hasCalendarPermission(Context context) {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALENDAR)
            == PackageManager.PERMISSION_GRANTED;
    }

    static int syncCalendar(Context context) {
        return syncCalendarDetailed(context).scheduled;
    }

    static CalendarSyncResult syncCalendarDetailed(Context context) {
        CalendarSyncResult result = new CalendarSyncResult();
        cancelCalendarAlarms(context);
        JSONObject config = getConfig(context);
        if (!config.optBoolean("calendarEnabled", false) || !hasCalendarPermission(context)) return result;
        boolean calendarTakeover = CALENDAR_ACTION_ACTIVATE.equals(
            config.optString("calendarAction", CALENDAR_ACTION_REMIND));
        if (!canScheduleExactAlarms(context)) return result;
        if (calendarTakeover && !canAutoLaunch(context)) {
            return result;
        }
        if (!calendarTakeover && !canPostReminders(context)) return result;

        long now = System.currentTimeMillis();
        long end = now + CALENDAR_HORIZON_MS;
        Set<String> keywords = parseKeywords(config.optString("calendarKeyword", "focus,study"));
        int leadMinutes = clamp(config.optInt("calendarLeadMinutes", 10), 0, 120);
        int focusDuration = sanitizeDuration(config.optInt("durationMinutes", 60));
        JSONArray requestCodes = new JSONArray();
        long next = 0L;

        String[] projection = {
            CalendarContract.Instances.EVENT_ID,
            CalendarContract.Instances.BEGIN,
            CalendarContract.Instances.END,
            CalendarContract.Instances.TITLE
        };
        Cursor cursor = null;
        try {
            cursor = CalendarContract.Instances.query(context.getContentResolver(), projection, now, end);
            while (cursor != null && cursor.moveToNext() && result.scheduled < MAX_CALENDAR_ALARMS) {
                result.scanned++;
                long begin = cursor.getLong(1);
                String title = cursor.getString(3);
                if (!matchesKeyword(title, keywords)) continue;
                result.matched++;
                long triggerAt = begin - leadMinutes * 60_000L;
                if (triggerAt <= now) continue;
                int requestCode = CALENDAR_REQUEST_BASE + result.scheduled;
                boolean scheduled = scheduleAlarm(context, requestCode, triggerAt, KIND_CALENDAR, focusDuration,
                    title == null || title.trim().isEmpty() ? "Calendar reminder" : title.trim());
                if (!scheduled) continue;
                requestCodes.put(requestCode);
                if (next == 0L || triggerAt < next) next = triggerAt;
                result.scheduled++;
            }
        } catch (SecurityException ignored) {
            result.scheduled = 0;
            result.scanned = 0;
            result.matched = 0;
            requestCodes = new JSONArray();
            next = 0L;
        } finally {
            if (cursor != null) cursor.close();
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(CALENDAR_CODES_KEY, requestCodes.toString())
            .putLong(NEXT_CALENDAR_KEY, next)
            .apply();
        return result;
    }

    static void handleTrigger(Context context, Intent intent) {
        String kind = intent.getStringExtra(EXTRA_KIND);
        if (KIND_CALENDAR.equals(kind)) {
            JSONObject config = getConfig(context);
            String action = config.optString("calendarAction", CALENDAR_ACTION_REMIND);
            if (!CALENDAR_ACTION_ACTIVATE.equals(action)) {
                postCalendarReminder(context, intent.getStringExtra(EXTRA_LABEL));
                syncCalendar(context);
                return;
            }
        }
        activateScheduledFocus(context, intent);
        String label = intent.getStringExtra(EXTRA_LABEL);
        int duration = sanitizeDuration(intent.getIntExtra(EXTRA_DURATION, 60));
        postReminder(context, label, duration);
        launchPageMeWhenAllowed(context);
    }

    private static void activateScheduledFocus(Context context, Intent intent) {
        String kind = intent.getStringExtra(EXTRA_KIND);
        int duration = sanitizeDuration(intent.getIntExtra(EXTRA_DURATION, 60));
        long now = System.currentTimeMillis();
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("pager_mode_active", true)
            .putBoolean("notification_capture_enabled", true)
            .putBoolean("bypass_relaunch", false)
            .putLong("focus_lock_until", now + duration * 60_000L)
            .apply();
        LauncherPlugin.enableLauncherAlias(context, true);

        if (KIND_LOCAL.equals(kind)) {
            JSONObject config = getConfig(context);
            if ("once".equals(config.optString("mode"))) {
                try { config.put("enabled", false); } catch (Exception ignored) {}
                context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                    .putString(CONFIG_KEY, config.toString()).putLong(NEXT_LOCAL_KEY, 0L).apply();
            } else {
                scheduleLocal(context);
            }
        } else if (KIND_CALENDAR.equals(kind)) {
            syncCalendar(context);
        }
    }

    static void cancelReminder(Context context) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(REMINDER_NOTIFICATION_ID);
    }

    private static void scheduleLocal(Context context) {
        cancelAlarm(context, LOCAL_REQUEST_CODE);
        JSONObject config = getConfig(context);
        long next = config.optBoolean("enabled", false) ? nextLocalTrigger(config, System.currentTimeMillis()) : 0L;
        if (next > 0L && !canAutoLaunch(context)) {
            next = 0L;
        }
        if (next > 0L) {
            boolean scheduled = scheduleAlarm(context, LOCAL_REQUEST_CODE, next, KIND_LOCAL,
                sanitizeDuration(config.optInt("durationMinutes", 60)), "Scheduled focus");
            if (!scheduled) next = 0L;
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong(NEXT_LOCAL_KEY, next).apply();
    }

    static long nextLocalTrigger(JSONObject config, long nowMillis) {
        try {
            ZoneId zone = ZoneId.systemDefault();
            String time = config.optString("time", "09:00");
            if ("once".equals(config.optString("mode", "weekly"))) {
                String dateValue = config.optString("date", "");
                if (dateValue.isEmpty()) return 0L;
                return FocusSchedulePolicy.nextOnce(dateValue, time, nowMillis, zone);
            }
            return FocusSchedulePolicy.nextWeekly(time, jsonWeekdays(config.optJSONArray("weekdays")), nowMillis, zone);
        } catch (Exception ignored) {}
        return 0L;
    }

    private static JSONObject sanitizeConfig(JSONObject input) {
        JSONObject source = input == null ? defaultConfig() : input;
        JSONObject result = defaultConfig();
        try {
            result.put("enabled", source.optBoolean("enabled", false));
            String mode = "once".equals(source.optString("mode")) ? "once" : "weekly";
            result.put("mode", mode);
            String date = source.optString("date", "");
            try { if (!date.isEmpty()) LocalDate.parse(date); } catch (Exception e) { date = ""; }
            result.put("date", date);
            String time = source.optString("time", "09:00");
            try { LocalTime.parse(time); } catch (Exception e) { time = "09:00"; }
            result.put("time", time);
            JSONArray days = new JSONArray();
            for (Integer day : jsonWeekdays(source.optJSONArray("weekdays"))) days.put(day);
            if (days.length() == 0) days = new JSONArray("[1,2,3,4,5]");
            result.put("weekdays", days);
            result.put("durationMinutes", sanitizeDuration(source.optInt("durationMinutes", 60)));
            result.put("calendarEnabled", source.optBoolean("calendarEnabled", false));
            result.put("calendarAction", CALENDAR_ACTION_ACTIVATE.equals(
                source.optString("calendarAction", CALENDAR_ACTION_REMIND))
                ? CALENDAR_ACTION_ACTIVATE : CALENDAR_ACTION_REMIND);
            result.put("calendarKeyword", source.optString("calendarKeyword", "focus,study").trim().substring(
                0, Math.min(80, source.optString("calendarKeyword", "focus,study").trim().length())));
            result.put("calendarLeadMinutes", clamp(source.optInt("calendarLeadMinutes", 10), 0, 120));
        } catch (Exception ignored) {}
        return result;
    }

    private static int sanitizeDuration(int value) {
        int[] allowed = {15, 30, 45, 60, 90, 120, 180, 240};
        for (int duration : allowed) if (value == duration) return duration;
        return 60;
    }

    private static Set<Integer> jsonWeekdays(JSONArray values) {
        Set<Integer> result = new HashSet<>();
        if (values == null) {
            for (int day = 1; day <= 5; day++) result.add(day);
            return result;
        }
        for (int index = 0; index < values.length(); index++) {
            int day = values.optInt(index, -1);
            if (day >= 0 && day <= 6) result.add(day);
        }
        return result;
    }

    private static boolean scheduleAlarm(Context context, int requestCode, long triggerAt, String kind, int duration, String label) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null || !canScheduleExactAlarms(context)) return false;
        Intent intent = new Intent(context, FocusScheduleReceiver.class)
            .setAction(ACTION_TRIGGER)
            .putExtra(EXTRA_KIND, kind)
            .putExtra(EXTRA_DURATION, duration)
            .putExtra(EXTRA_LABEL, label);
        PendingIntent pending = PendingIntent.getBroadcast(context, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending);
        } else {
            manager.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pending);
        }
        return true;
    }

    private static void cancelAlarm(Context context, int requestCode) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(context, FocusScheduleReceiver.class).setAction(ACTION_TRIGGER);
        PendingIntent pending = PendingIntent.getBroadcast(context, requestCode, intent,
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        if (manager != null && pending != null) manager.cancel(pending);
        if (pending != null) pending.cancel();

        // Cancel alarms created by the short-lived activity PendingIntent implementation.
        Intent activityIntent = new Intent().setClassName(
            context, "com.pageme.app.FocusScheduleLaunchActivity").setAction(ACTION_TRIGGER);
        PendingIntent legacy = PendingIntent.getActivity(context, requestCode, activityIntent,
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        if (manager != null && legacy != null) manager.cancel(legacy);
        if (legacy != null) legacy.cancel();
    }

    private static void cancelCalendarAlarms(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            JSONArray codes = new JSONArray(prefs.getString(CALENDAR_CODES_KEY, "[]"));
            for (int index = 0; index < codes.length(); index++) cancelAlarm(context, codes.optInt(index));
        } catch (Exception ignored) {}
        prefs.edit().putString(CALENDAR_CODES_KEY, "[]").putLong(NEXT_CALENDAR_KEY, 0L).apply();
    }

    private static Set<String> parseKeywords(String value) {
        Set<String> result = new HashSet<>();
        for (String keyword : value.toLowerCase(Locale.ROOT).split(",")) {
            String trimmed = keyword.trim();
            if (!trimmed.isEmpty()) result.add(trimmed);
        }
        if (result.isEmpty()) {
            result.add("focus");
            result.add("study");
        }
        return result;
    }

    private static boolean matchesKeyword(String title, Set<String> keywords) {
        String value = title == null ? "" : title.toLowerCase(Locale.ROOT);
        for (String keyword : keywords) if (value.contains(keyword)) return true;
        return false;
    }

    private static void postReminder(Context context, String label, int duration) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Focus reminders", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Reminders created from your PageMe focus schedule");
            manager.createNotificationChannel(channel);
        }
        Intent openIntent = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("scheduled_focus", true);
        PendingIntent content = PendingIntent.getActivity(context, REMINDER_NOTIFICATION_ID, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String title = label == null || label.trim().isEmpty() ? "It is time to focus" : label.trim();
        android.app.Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(title)
            .setContentText("PageMe focus starts now for " + duration + " minutes")
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(content)
            .setAutoCancel(true)
            .setTimeoutAfter(10L * 60L * 1000L)
            .build();
        manager.notify(REMINDER_NOTIFICATION_ID, notification);
    }

    private static void postCalendarReminder(Context context, String label) {
        if (!canPostReminders(context)) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Focus reminders", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Calendar reminders selected in PageMe");
            manager.createNotificationChannel(channel);
        }
        Intent openIntent = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent content = PendingIntent.getActivity(context, REMINDER_NOTIFICATION_ID + 1, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String event = label == null || label.trim().isEmpty() ? "Upcoming focus event" : label.trim();
        android.app.Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("Focus reminder: " + event)
            .setContentText("Your matching calendar event starts soon.")
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(content)
            .setAutoCancel(true)
            .setTimeoutAfter(60L * 60L * 1000L)
            .build();
        manager.notify(REMINDER_NOTIFICATION_ID + 1, notification);
    }

    private static void launchPageMeWhenAllowed(Context context) {
        if (!canAutoLaunch(context)) return;
        try {
            // This activity does not show over or dismiss the keyguard. If the phone is
            // locked, Android keeps PageMe behind it and reveals PageMe after unlock.
            Intent intent = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("scheduled_focus", true);
            context.startActivity(intent);
        } catch (Exception ignored) {}
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }
}
