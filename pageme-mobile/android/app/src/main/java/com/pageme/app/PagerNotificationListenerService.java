package com.pageme.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import java.util.Locale;

public class PagerNotificationListenerService extends NotificationListenerService {
    private static final String TAG = "PageMeNotifListener";
    private static final String LEGACY_PASSTHROUGH_CHANNEL_ID = "pageme_silent_passthrough";

    // Static reference so NotificationReceiverPlugin and StudySessionService can call sweep
    static PagerNotificationListenerService listenerInstance;
    private volatile long listenerConnectedAt = 0L;

    @Override
    public void onListenerConnected() {
        listenerInstance = this;
        listenerConnectedAt = System.currentTimeMillis();
    }

    @Override
    public void onListenerDisconnected() {
        if (listenerInstance == this) listenerInstance = null;
    }

    /**
     * Cancels all active notifications except:
     *  - calls (CATEGORY_CALL)
     *  - notifications from selfPackage (PageMe's own foreground service notification)
     * The selected study app is intentionally not exempt: its notification can
     * still be tapped to open a distracting screen inside that app.
     *
     * Called at study-session start and again when PageMe resumes, so the shade
     * never has clickable shortcuts to non-study apps.
     */
    public static void sweepNotificationsForStudy(String studyPackage, String selfPackage) {
        PagerNotificationListenerService svc = listenerInstance;
        if (svc == null) return;
        try {
            StatusBarNotification[] active = svc.getActiveNotifications();
            if (active == null) return;
            for (StatusBarNotification sbn : active) {
                String pkg = sbn.getPackageName();
                boolean isCall  = Notification.CATEGORY_CALL.equals(sbn.getNotification().category);
                boolean isOwn   = pkg.equals(selfPackage);
                if (!isCall && !isOwn) {
                    try { svc.cancelNotification(sbn.getKey()); } catch (Exception ex) { /* ignore */ }
                }
            }
        } catch (Exception e) { /* ignore */ }
    }

    public static class NotificationCompatInfo {
        public android.app.PendingIntent pendingIntent;
        public android.app.RemoteInput remoteInput;
        public String resultKey;
        public long cachedAt;
    }

    private static final java.util.Map<String, NotificationCompatInfo> replyActions = new java.util.concurrent.ConcurrentHashMap<>();
    private static final java.util.Map<String, StatusBarNotification> alarmNotifications = new java.util.concurrent.ConcurrentHashMap<>();
    private static final java.util.Map<String, String> activeAlarmSignatures = new java.util.concurrent.ConcurrentHashMap<>();
    private static final java.util.Map<String, RecentNotification> recentNotifications = new java.util.concurrent.ConcurrentHashMap<>();
    private static final java.util.Map<String, Long> recentAlarms = new java.util.concurrent.ConcurrentHashMap<>();
    private static final int MAX_CACHED_ACTIONS = 100;
    private static final long DUPLICATE_WINDOW_MS = 60_000L;
    public static String lastSentReplyText = null;

    public static void clearLegacyPassthroughNotifications(android.content.Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context == null) return;
        try {
            NotificationManager manager = (NotificationManager) context.getSystemService(NOTIFICATION_SERVICE);
            if (manager != null) manager.deleteNotificationChannel(LEGACY_PASSTHROUGH_CHANNEL_ID);
        } catch (Exception e) {
            Log.e(TAG, "Unable to remove legacy passthrough notifications", e);
        }
    }

    private static class RecentNotification {
        final String signature;
        final long timestamp;

        RecentNotification(String signature, long timestamp) {
            this.signature = signature;
            this.timestamp = timestamp;
        }
    }

    public static boolean fireAlarmAction(String key, int actionIndex) {
        StatusBarNotification sbn = alarmNotifications.get(key);
        if (sbn == null) return false;
        Notification.Action[] actions = sbn.getNotification().actions;
        if (actions == null || actionIndex < 0 || actionIndex >= actions.length) return false;
        try {
            actions[actionIndex].actionIntent.send();
            clearCachedAlarms();
            return true;
        } catch (Exception e) {
            Log.e(TAG, "fireAlarmAction failed", e);
            return false;
        }
    }

    public static boolean dismissAlarm(String key) {
        StatusBarNotification sbn = alarmNotifications.get(key);
        if (sbn == null) return false;

        boolean actionSent = false;
        Notification.Action[] actions = sbn.getNotification().actions;
        if (actions != null) {
            for (Notification.Action action : actions) {
                CharSequence title = action.title;
                if (NotificationPolicy.isDismissAction(title == null ? "" : title.toString())) {
                    try {
                        action.actionIntent.send();
                        actionSent = true;
                    } catch (Exception e) {
                        Log.e(TAG, "dismissAlarm action failed", e);
                    }
                    break;
                }
            }
        }

        PagerNotificationListenerService svc = listenerInstance;
        clearCachedAlarms();
        return actionSent || svc != null;
    }

    private static void clearCachedAlarms() {
        PagerNotificationListenerService svc = listenerInstance;
        for (String alarmKey : new java.util.ArrayList<>(alarmNotifications.keySet())) {
            if (svc != null) {
                try { svc.cancelNotification(alarmKey); } catch (Exception ignored) {}
            }
            alarmNotifications.remove(alarmKey);
        }
    }

    private static <T> void putBounded(java.util.Map<String, T> map, String key, T value) {
        if (!map.containsKey(key) && map.size() >= MAX_CACHED_ACTIONS) {
            java.util.Iterator<String> iterator = map.keySet().iterator();
            if (iterator.hasNext()) map.remove(iterator.next());
        }
        map.put(key, value);
    }

    private static boolean isRecentDuplicate(String key, String signature, long now) {
        RecentNotification previous = recentNotifications.get(key);
        recentNotifications.put(key, new RecentNotification(signature, now));
        if (recentNotifications.size() > MAX_CACHED_ACTIONS) {
            String oldestKey = null;
            long oldestTime = Long.MAX_VALUE;
            for (java.util.Map.Entry<String, RecentNotification> entry : recentNotifications.entrySet()) {
                if (entry.getValue().timestamp < oldestTime) {
                    oldestTime = entry.getValue().timestamp;
                    oldestKey = entry.getKey();
                }
            }
            if (oldestKey != null) recentNotifications.remove(oldestKey);
        }
        return previous != null
            && signature.equals(previous.signature)
            && now - previous.timestamp < DUPLICATE_WINDOW_MS;
    }

    private static boolean isRecentAlarm(String signature, long now) {
        Long previous = recentAlarms.put(signature, now);
        if (recentAlarms.size() > MAX_CACHED_ACTIONS) {
            String oldestKey = null;
            long oldestTime = Long.MAX_VALUE;
            for (java.util.Map.Entry<String, Long> entry : recentAlarms.entrySet()) {
                if (entry.getValue() < oldestTime) {
                    oldestTime = entry.getValue();
                    oldestKey = entry.getKey();
                }
            }
            if (oldestKey != null) recentAlarms.remove(oldestKey);
        }
        return previous != null && now - previous < DUPLICATE_WINDOW_MS;
    }

    private static boolean isActiveAlarmDuplicate(String key, String signature) {
        String previous = activeAlarmSignatures.put(key, signature);
        return NotificationPolicy.hasSameNotificationContent(previous, signature);
    }

    private static com.getcapacitor.JSObject buildAlarmData(StatusBarNotification sbn) {
        Notification notification = sbn.getNotification();
        Bundle extras = notification.extras;
        CharSequence titleChar = extras == null ? null : extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence textChar = extras == null ? null : extras.getCharSequence(Notification.EXTRA_TEXT);
        String title = titleChar == null ? "ALARM" : titleChar.toString();
        String text = textChar == null ? "" : textChar.toString();

        putBounded(alarmNotifications, sbn.getKey(), sbn);
        org.json.JSONArray actionsArr = new org.json.JSONArray();
        boolean hasStopAction = false;
        if (notification.actions != null) {
            for (int i = 0; i < notification.actions.length; i++) {
                CharSequence labelChar = notification.actions[i].title;
                String label = labelChar == null ? "ACTION " + i : labelChar.toString();
                hasStopAction = hasStopAction || NotificationPolicy.isDismissAction(label);
                com.getcapacitor.JSObject action = new com.getcapacitor.JSObject();
                action.put("label", label.toUpperCase(Locale.ROOT));
                action.put("index", i);
                actionsArr.put(action);
            }
        }
        if (!hasStopAction) {
            com.getcapacitor.JSObject fallback = new com.getcapacitor.JSObject();
            fallback.put("label", "STOP / CANCEL");
            fallback.put("index", -1);
            actionsArr.put(fallback);
        }

        com.getcapacitor.JSObject alarmData = new com.getcapacitor.JSObject();
        alarmData.put("key", sbn.getKey());
        alarmData.put("from", title.toUpperCase(Locale.ROOT));
        alarmData.put("text", text);
        alarmData.put("actions", actionsArr);
        return alarmData;
    }

    public static com.getcapacitor.JSObject getActiveAlarmData() {
        PagerNotificationListenerService svc = listenerInstance;
        if (svc == null) return null;
        try {
            StatusBarNotification[] active = svc.getActiveNotifications();
            if (active == null) return null;
            for (StatusBarNotification sbn : active) {
                if (isActionableAlarm(sbn)) {
                    return buildAlarmData(sbn);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Unable to inspect active alarms", e);
        }
        return null;
    }

    private static boolean isActionableAlarm(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) return false;
        Notification notification = sbn.getNotification();
        Bundle extras = notification.extras;
        String title = extras == null || extras.getCharSequence(Notification.EXTRA_TITLE) == null
            ? "" : extras.getCharSequence(Notification.EXTRA_TITLE).toString();
        String text = extras == null || extras.getCharSequence(Notification.EXTRA_TEXT) == null
            ? "" : extras.getCharSequence(Notification.EXTRA_TEXT).toString();
        String channelId = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? notification.getChannelId() : "";
        Notification.Action[] actions = notification.actions;
        String[] labels = new String[actions == null ? 0 : actions.length];
        for (int index = 0; index < labels.length; index++) {
            CharSequence label = actions[index] == null ? null : actions[index].title;
            labels[index] = label == null ? "" : label.toString();
        }
        return NotificationPolicy.isActionableAlarm(
            sbn.getPackageName(), notification.category, channelId, title, text,
            notification.fullScreenIntent != null, labels);
    }

    private boolean isPageMeDefaultLauncher() {
        try {
            android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_MAIN);
            intent.addCategory(android.content.Intent.CATEGORY_HOME);
            android.content.pm.ResolveInfo resolveInfo = getPackageManager().resolveActivity(intent, android.content.pm.PackageManager.MATCH_DEFAULT_ONLY);
            if (resolveInfo != null && resolveInfo.activityInfo != null) {
                String currentHomePackage = resolveInfo.activityInfo.packageName;
                return currentHomePackage.equals(getPackageName());
            }
        } catch (Exception e) {
            Log.e(TAG, "Error checking default launcher", e);
        }
        return false;
    }

    public static boolean replyToNotification(String replyKey, String text) {
        NotificationCompatInfo info = replyActions.get(replyKey);
        if (info == null) {
            Log.w(TAG, "No cached reply action found for notification key");
            return false;
        }
        if (NotificationPolicy.isReplyActionExpired(info.cachedAt, System.currentTimeMillis())) {
            replyActions.remove(replyKey);
            return false;
        }

        try {
            android.content.Intent intent = new android.content.Intent();
            android.os.Bundle bundle = new android.os.Bundle();
            bundle.putCharSequence(info.resultKey, text);
            android.app.RemoteInput.addResultsToIntent(new android.app.RemoteInput[]{info.remoteInput}, intent, bundle);

            if (NotificationReceiverPlugin.instance != null) {
                lastSentReplyText = text;
                info.pendingIntent.send(NotificationReceiverPlugin.instance.getContext(), 0, intent);
                replyActions.remove(replyKey);
                Log.d(TAG, "Reply sent successfully");
                return true;
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to send notification reply", e);
        }
        return false;
    }

    private boolean isReplyWorthy(String packageName, Notification notification) {
        if (packageName == null) return false;
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
            if (Notification.CATEGORY_MESSAGE.equals(notification.category)) {
                return true;
            }
        }
        String pkg = packageName.toLowerCase(Locale.ROOT);
        return pkg.contains("message")
            || pkg.contains("messaging")
            || pkg.contains("sms")
            || pkg.contains("mms")
            || pkg.contains("whatsapp")
            || pkg.contains("slack")
            || pkg.contains("telegram")
            || pkg.contains("signal")
            || pkg.contains("facebook.orca")
            || pkg.contains("discord")
            || pkg.contains("skype")
            || pkg.contains("viber")
            || pkg.contains("line.android")
            || pkg.contains("tencent.mm")
            || pkg.contains("teams")
            || pkg.contains("groupme")
            || pkg.contains("hangouts");
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        String packageName = sbn.getPackageName();
        Notification notification = sbn.getNotification();
        Bundle extras = notification.extras;

        if (extras == null) return;

        CharSequence titleChar = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence textChar = extras.getCharSequence(Notification.EXTRA_TEXT);

        String title = titleChar != null ? titleChar.toString() : "UNKNOWN";
        String text = textChar != null ? textChar.toString() : "";
        String channelId = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? notification.getChannelId() : "";

        // Do not intercept or cancel notifications if PageMe is not currently active in Pager Mode
        android.content.SharedPreferences prefs = getSharedPreferences("PageMePrefs", android.content.Context.MODE_PRIVATE);
        boolean isPagerActive = prefs.getBoolean("pager_mode_active", false);
        boolean isCaptureEnabled = prefs.getBoolean("notification_capture_enabled", false);

        // Self-heal check: if PageMe is neither in the foreground nor the default home launcher, turn off blocker!
        boolean isForegroundOrDefault = MainActivity.isResumed || isPageMeDefaultLauncher();
        if (isPagerActive && !isForegroundOrDefault) {
            prefs.edit()
                .putBoolean("pager_mode_active", false)
                .putBoolean("notification_capture_enabled", false)
                .apply();
            isPagerActive = false;
            isCaptureEnabled = false;
        }

        if (!isPagerActive || !isCaptureEnabled) {
            return;
        }

        // Silent passthrough notifications are posted by PageMe itself. Capturing
        // them again creates a notification feedback loop and duplicate pages.
        if (NotificationPolicy.isOwnNotification(packageName, getPackageName())) {
            return;
        }

        long notificationNow = System.currentTimeMillis();
        if (NotificationPolicy.isStaleReconnectNotification(
                sbn.getPostTime(), listenerConnectedAt, notificationNow)) {
            return;
        }

        boolean isCall = Notification.CATEGORY_CALL.equals(notification.category);
        boolean studySessionActive = prefs.getBoolean("study_session_active", false);
        if (studySessionActive) {
            if (!isCall && !packageName.equals(getPackageName())) {
                try { cancelNotification(sbn.getKey()); } catch (Exception ignored) {}
            }
            return;
        }

        // Weather remains an ordinary Android notification but never becomes a page.
        if (NotificationPolicy.isWeatherForecast(packageName, channelId, title, text)) {
            return;
        }

        // Alarm notifications — intercept before the ongoing/foreground filter because
        // alarm notifications are typically FLAG_ONGOING while ringing.
        boolean isAlarm = NotificationPolicy.isAlarm(packageName, notification.category);
        if (isAlarm) {
            // Clock apps retain missed, upcoming, and snoozed notifications. Only
            // surface controls for a notification that is actively ringing.
            if (!isActionableAlarm(sbn)) return;
            putBounded(alarmNotifications, sbn.getKey(), sbn);
            String alarmSignature = packageName + "\u0000" + title + "\u0000" + text;
            if (isActiveAlarmDuplicate(sbn.getKey(), alarmSignature)) return;
            if (isRecentAlarm(alarmSignature, notificationNow)) return;
            NotificationReceiverPlugin.notifyAlarmReceived(buildAlarmData(sbn));
            return;
        }

        // Filter out system, ongoing, foreground, group-summary, or empty notifications
        boolean isOngoing = (notification.flags & Notification.FLAG_ONGOING_EVENT) != 0;
        boolean isForeground = (notification.flags & Notification.FLAG_FOREGROUND_SERVICE) != 0;
        boolean isGroupSummary = (notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0;

        // Filter out screenshot notifications
        String titleLower = title.toLowerCase(Locale.ROOT).trim();
        String textLower = text.toLowerCase(Locale.ROOT).trim();
        String pkgLower = packageName.toLowerCase(Locale.ROOT);
        if (pkgLower.contains("screenshot")
            || pkgLower.contains("capture")
            || pkgLower.contains("markup")
            || titleLower.contains("screenshot")
            || titleLower.contains("screen shot")
            || titleLower.contains("capture")
            || textLower.contains("screenshot")
            || textLower.contains("screen shot")
            || textLower.contains("capture")
        ) {
            return;
        }

        // Filter out self-replies or self-notifications
        if (titleLower.equals("you")
            || titleLower.startsWith("you:")
            || titleLower.startsWith("you (")
            || (lastSentReplyText != null && text.trim().equals(lastSentReplyText.trim()))
        ) {
            return;
        }

        if (packageName.equals("android")
            || packageName.equals("com.android.systemui")
            || packageName.contains("systemui")
            || packageName.equals("com.google.android.gms")
            || text.isEmpty()
            || isOngoing
            || isForeground
            || isGroupSummary
        ) {
            return;
        }

        String notificationSignature = title + "\u0000" + text;
        if (isRecentDuplicate(sbn.getKey(), notificationSignature, notificationNow)) {
            try { cancelNotification(sbn.getKey()); } catch (Exception ignored) {}
            return;
        }

        // During focus lock, suppress notifications from non-study apps (except calls and our own app)
        long focusLockUntil = prefs.getLong("focus_lock_until", 0L);
        if (focusLockUntil > System.currentTimeMillis()) {
            String studyAppsJson = prefs.getString("study_app_packages", "[]");
            boolean isStudyApp = false;
            try {
                org.json.JSONArray arr = new org.json.JSONArray(studyAppsJson);
                for (int i = 0; i < arr.length(); i++) {
                    if (packageName.equals(arr.getString(i))) { isStudyApp = true; break; }
                }
            } catch (Exception e) { /* ignore */ }
            if (!isStudyApp && !packageName.equals(getPackageName()) && !isCall) {
                try { cancelNotification(sbn.getKey()); } catch (Exception ex) { /* ignore */ }
                return;
            }
        }

        // Map packages to sources dynamically and classify app name
        String source = "SMS";
        String pkg = packageName.toLowerCase(Locale.ROOT);
        if (pkg.contains("whatsapp")) {
            source = "WhatsApp";
        } else if (pkg.contains("slack")) {
            source = "Slack";
        } else if (pkg.contains("gmail")) {
            source = "Gmail";
        } else if (pkg.contains("outlook")) {
            source = "Outlook";
        } else if (pkg.contains("mail")) {
            source = "Email";
        } else if (pkg.contains("messenger") || pkg.contains("orca")) {
            source = "Msgr";
        } else if (pkg.contains("dialer") || pkg.contains("telephony") || pkg.contains("phone")) {
            source = "Call";
        } else if (pkg.contains("deskclock") || pkg.contains("alarm") || pkg.contains("clock")) {
            source = "Alarm";
        } else if (pkg.contains("googlequicksearchbox") || titleLower.contains("weather") || textLower.contains("weather")) {
            source = "Google";
        } else if (pkg.contains("messaging") || pkg.contains("sms") || pkg.contains("mms")) {
            source = "SMS";
        } else {
            try {
                android.content.pm.PackageManager pm = getPackageManager();
                CharSequence label = pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0));
                if (label != null && label.length() > 0) {
                    source = label.toString();
                }
            } catch (Exception e) {
                source = "SMS";
            }
        }

        CharSequence conversationTitleChar = extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE);
        String conversationTitle = conversationTitleChar == null ? "" : conversationTitleChar.toString();
        String fromName = NotificationPolicy.canonicalSenderName(
            conversationTitle.isEmpty() ? title : conversationTitle
        );
        String senderKey = NotificationPolicy.stableConversationKey(
            packageName,
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? notification.getShortcutId() : "",
            conversationTitle,
            sbn.getTag(),
            title
        );
        String number = "555-0100";

        if (source.equalsIgnoreCase("call")) {
            text = "121"; // Custom Pager code for call back (Call Me)
        }

        // Parse caller/sender phone number or contact name
        String rawTitle = title.trim();
        if (rawTitle.matches("^[\\+]?[0-9\\s\\-\\(\\)]{5,20}$")) {
            fromName = rawTitle;
            number = rawTitle;
        } else {
            // Search for phone number in text (e.g. "Missed call from +1234...")
            if (textChar != null) {
                String rawText = textChar.toString().trim();
                java.util.regex.Matcher m = java.util.regex.Pattern.compile("[\\+]?[0-9\\s\\-\\(\\)]{7,20}").matcher(rawText);
                if (m.find()) {
                    String candidate = m.group().trim();
                    if (candidate.replaceAll("[^0-9]", "").length() >= 5) {
                        number = candidate;
                    }
                }
            }
        }

        // Cache reply action if notification has direct reply capability (e.g. WhatsApp / SMS) and is reply-worthy
        boolean canReply = false;
        if (isReplyWorthy(packageName, notification)) {
            Notification.Action[] actions = notification.actions;
            if (actions != null) {
                for (Notification.Action action : actions) {
                    if (action.getRemoteInputs() != null) {
                        for (android.app.RemoteInput ri : action.getRemoteInputs()) {
                            NotificationCompatInfo info = new NotificationCompatInfo();
                            info.pendingIntent = action.actionIntent;
                            info.remoteInput = ri;
                            info.resultKey = ri.getResultKey();
                            info.cachedAt = System.currentTimeMillis();
                            putBounded(replyActions, sbn.getKey(), info);
                            canReply = true;
                            break;
                        }
                    }
                    if (canReply) break;
                }
            }
        }

        // Relay notification data to Capacitor Web Layer
        NotificationReceiverPlugin.onNotificationIntercepted(
            fromName.toUpperCase(Locale.ROOT), text, source, number, canReply,
            canReply ? sbn.getKey() : "", senderKey, sbn.getKey()
        );

        // Always cancel the original notification to suppress the heads-up banner
        // (we never want a pop-up appearing over the PageMe UI).
        try { cancelNotification(sbn.getKey()); } catch (Exception e) {
            Log.e(TAG, "Error cancelling notification", e);
        }

    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // Keep direct-reply PendingIntents after PageMe cancels the source
        // notification. They are removed after use, on expiry, or cache eviction.
        alarmNotifications.remove(sbn.getKey());
        String alarmSignature = activeAlarmSignatures.remove(sbn.getKey());
        if (alarmSignature != null) recentAlarms.remove(alarmSignature);
    }

}
