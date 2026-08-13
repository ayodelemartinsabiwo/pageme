package com.pageme.app;

import java.text.Normalizer;
import java.util.Locale;

/** Pure notification classification rules shared by the listener and unit tests. */
final class NotificationPolicy {
    private static final long RECONNECT_GRACE_MS = 30_000L;
    private static final long STALE_NOTIFICATION_MS = 30_000L;
    private static final long REPLY_ACTION_TTL_MS = 24L * 60L * 60L * 1000L;

    private NotificationPolicy() {}

    static boolean isWeatherForecast(String packageName, String channelId, String title, String text) {
        String pkg = lower(packageName);
        String channel = lower(channelId);
        String content = lower(title) + " " + lower(text);

        if (pkg.equals("com.sec.android.daemonapp")) return true;
        if (pkg.contains("weather") || pkg.contains("forecast")) return true;
        if (channel.contains("weather") || channel.contains("forecast")) return true;

        if (!pkg.contains("googlequicksearchbox")) return false;
        return containsWeatherTerm(content);
    }

    static boolean isAlarm(String packageName, String category) {
        String pkg = lower(packageName);
        return "alarm".equals(category)
            || pkg.contains("deskclock")
            || pkg.contains("alarm")
            || pkg.contains("clock");
    }

    static boolean isOwnNotification(String packageName, String selfPackageName) {
        return !lower(selfPackageName).isEmpty()
            && lower(selfPackageName).equals(lower(packageName));
    }

    static boolean hasSameNotificationContent(String previousSignature, String currentSignature) {
        return previousSignature != null && previousSignature.equals(currentSignature);
    }

    static boolean isReplyActionExpired(long cachedAt, long now) {
        return cachedAt <= 0L || now < cachedAt || now - cachedAt > REPLY_ACTION_TTL_MS;
    }

    static boolean isDismissAction(String label) {
        String value = lower(label);
        return value.contains("dismiss")
            || value.contains("stop")
            || value.contains("turn off")
            || value.contains("end alarm")
            || value.contains("cancel alarm");
    }

    static boolean isAlarmControlAction(String label) {
        String value = lower(label);
        return isDismissAction(value) || value.contains("snooze");
    }

    static boolean isLiveAlarmControlAction(String label) {
        String value = lower(label);
        return value.contains("snooze")
            || value.contains("stop")
            || value.contains("turn off")
            || value.contains("end alarm");
    }

    static boolean isActionableAlarm(
            String packageName, String category, String channelId,
            String title, String text, String... actionLabels) {
        return isActionableAlarm(
            packageName, category, channelId, title, text, false, actionLabels);
    }

    static boolean isActionableAlarm(
            String packageName, String category, String channelId,
            String title, String text, boolean hasFullScreenIntent,
            String... actionLabels) {
        if (!isAlarm(packageName, category)) return false;

        String channel = lower(channelId);
        String content = lower(title) + " " + lower(text);
        if (channel.contains("missed_alarm")
                || channel.contains("upcoming_alarm")
                || channel.contains("snoozed_alarm")
                || content.contains("missed alarm")
                || content.contains("alarm missed")
                || content.contains("upcoming alarm")
                || content.contains("snoozed alarm")) {
            return false;
        }

        if (actionLabels == null) return false;
        boolean hasDismissAction = false;
        for (String label : actionLabels) {
            if (isLiveAlarmControlAction(label)) return true;
            hasDismissAction = hasDismissAction || isDismissAction(label);
        }

        // Some Clock implementations label the live ringing action "Dismiss".
        // Accept that ambiguous label only when Android also identifies the
        // notification as a firing/full-screen alarm, never for a retained card.
        boolean firingChannel = channel.equals("alarm")
            || channel.contains("firing_alarm")
            || channel.contains("alarm_alert");
        return hasDismissAction && (hasFullScreenIntent || firingChannel);
    }

    static boolean isStaleReconnectNotification(long postTime, long connectedAt, long now) {
        if (postTime <= 0L || connectedAt <= 0L) return false;
        boolean listenerJustConnected = now >= connectedAt && now - connectedAt <= RECONNECT_GRACE_MS;
        boolean notificationPredatesConnection = connectedAt - postTime > STALE_NOTIFICATION_MS;
        return listenerJustConnected && notificationPredatesConnection;
    }

    static String canonicalSenderName(String value) {
        String sender = value == null ? "" : Normalizer.normalize(value, Normalizer.Form.NFKC);
        sender = sender
            .replaceAll("[\\u200B-\\u200D\\u2060\\uFEFF]", "")
            .replaceAll("\\s+", " ")
            .trim()
            .replaceAll("(?i)^\\d+\\s+(?:new\\s+)?messages?\\s+from\\s+", "")
            .replaceAll("(?i)\\s*[-–—]\\s*(?:whatsapp|\\d+\\s+(?:new\\s+)?messages?)\\s*$", "")
            .replaceAll("(?i)\\s*\\((?:\\d+\\s+)?(?:new\\s+)?messages?\\)\\s*$", "")
            .replaceAll("(?i)\\s*[·•]\\s*\\d+\\s+(?:new\\s+)?messages?\\s*$", "")
            .replaceAll("(?i)\\s*\\[\\d+\\s+(?:new\\s+)?messages?\\]\\s*$", "")
            .replaceAll("\\s+", " ")
            .trim();
        return sender.isEmpty() ? "UNKNOWN" : sender;
    }

    static String stableConversationKey(
            String packageName, String shortcutId, String conversationTitle,
            String notificationTag, String fallbackTitle) {
        String pkg = lower(packageName).trim();
        String shortcut = normalizedKeyPart(shortcutId);
        if (!shortcut.isEmpty()) return pkg + "|shortcut|" + shortcut;

        String conversation = normalizedKeyPart(canonicalSenderName(conversationTitle));
        if (!conversationTitleIsEmpty(conversationTitle) && !conversation.isEmpty()) {
            return pkg + "|conversation|" + conversation;
        }

        String tag = normalizedKeyPart(notificationTag);
        if (!tag.isEmpty() && !"null".equals(tag)) return pkg + "|tag|" + tag;

        return pkg + "|sender|" + normalizedKeyPart(canonicalSenderName(fallbackTitle));
    }

    private static boolean conversationTitleIsEmpty(String value) {
        return value == null || value.trim().isEmpty();
    }

    private static String normalizedKeyPart(String value) {
        if (value == null) return "";
        return Normalizer.normalize(value, Normalizer.Form.NFKC)
            .replaceAll("[\\u200B-\\u200D\\u2060\\uFEFF]", "")
            .replaceAll("\\s+", " ")
            .trim()
            .toLowerCase(Locale.ROOT);
    }

    private static boolean containsWeatherTerm(String content) {
        String[] terms = {
            "weather", "forecast", "temperature", "humidity", "uv index",
            "cooling", "warming", "heat advisory", "rain expected",
            "chance of rain", "showers", "thunderstorm", "snow expected"
        };
        for (String term : terms) {
            if (content.contains(term)) return true;
        }
        return false;
    }

    private static String lower(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }
}
