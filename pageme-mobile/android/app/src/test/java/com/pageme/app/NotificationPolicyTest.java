package com.pageme.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class NotificationPolicyTest {
    @Test
    public void detectsSamsungAndGoogleWeatherWithoutBlockingGoogleNews() {
        assertTrue(NotificationPolicy.isWeatherForecast(
            "com.sec.android.daemonapp", "weather.notification.forecast_change",
            "Significant weather", "UV will be extreme"));
        assertTrue(NotificationPolicy.isWeatherForecast(
            "com.google.android.googlequicksearchbox", "74",
            "Google", "Slight cooling over the next 3 days"));
        assertFalse(NotificationPolicy.isWeatherForecast(
            "com.google.android.googlequicksearchbox", "74",
            "Forbes", "Markets close higher"));
    }

    @Test
    public void detectsAlarmPackagesAndDismissActions() {
        assertTrue(NotificationPolicy.isAlarm("com.sec.android.app.clockpackage", "alarm"));
        assertFalse(NotificationPolicy.isAlarm("com.google.android.googlequicksearchbox", null));
        assertTrue(NotificationPolicy.isDismissAction("Turn off"));
        assertTrue(NotificationPolicy.isDismissAction("DISMISS"));
        assertTrue(NotificationPolicy.isDismissAction("Cancel alarm"));
        assertFalse(NotificationPolicy.isDismissAction("Snooze"));
    }

    @Test
    public void showsControlsOnlyForCurrentlyActionableAlarms() {
        assertFalse(NotificationPolicy.isActionableAlarm(
            "com.sec.android.app.clockpackage", "alarm", "notification_channel_missed_alarm",
            "2 missed alarms", "3:18 am"));
        assertFalse(NotificationPolicy.isActionableAlarm(
            "com.sec.android.app.clockpackage", "alarm", "notification_channel_upcoming_alarm",
            "Upcoming alarm", "3:00 am", "Dismiss", "Cancel alarm"));
        assertFalse(NotificationPolicy.isActionableAlarm(
            "com.sec.android.app.clockpackage", "alarm", "notification_channel_snoozed_alarm",
            "Alarm snoozed", "3:10 am", "Dismiss"));
        assertFalse(NotificationPolicy.isActionableAlarm(
            "com.sec.android.app.clockpackage", "alarm", "notification_channel_other",
            "Alarm set", "Tomorrow at 3:00 am", "Dismiss"));
        assertTrue(NotificationPolicy.isActionableAlarm(
            "com.sec.android.app.clockpackage", "alarm", "notification_channel_firing_alarm",
            "Alarm", "3:00 am", "Snooze", "Stop"));
        assertTrue(NotificationPolicy.isActionableAlarm(
            "com.google.android.deskclock", "alarm", "alarm",
            "Alarm", "Wake up", "Dismiss"));
        assertTrue(NotificationPolicy.isActionableAlarm(
            "com.example.clock", "alarm", "generic_channel",
            "Alarm", "Wake up", true, "Dismiss"));
    }

    @Test
    public void identifiesOnlyNotificationsPostedByPageMeItself() {
        assertTrue(NotificationPolicy.isOwnNotification("com.pageme.app", "com.pageme.app"));
        assertTrue(NotificationPolicy.isOwnNotification("COM.PAGEME.APP", "com.pageme.app"));
        assertFalse(NotificationPolicy.isOwnNotification("com.google.android.apps.messaging", "com.pageme.app"));
        assertFalse(NotificationPolicy.isOwnNotification(null, "com.pageme.app"));
    }

    @Test
    public void detectsRepeatedUpdatesForTheSameActiveNotification() {
        assertTrue(NotificationPolicy.hasSameNotificationContent("clock\u0000alarm", "clock\u0000alarm"));
        assertFalse(NotificationPolicy.hasSameNotificationContent("clock\u0000alarm", "clock\u0000snoozed"));
        assertFalse(NotificationPolicy.hasSameNotificationContent(null, "clock\u0000alarm"));
    }

    @Test
    public void expiresOnlyStaleNotificationReplyActions() {
        long now = 100_000_000L;
        assertFalse(NotificationPolicy.isReplyActionExpired(now - 60_000L, now));
        assertTrue(NotificationPolicy.isReplyActionExpired(now - (25L * 60L * 60L * 1000L), now));
        assertTrue(NotificationPolicy.isReplyActionExpired(0L, now));
    }

    @Test
    public void suppressesOnlyOldNotificationsDuringListenerReconnect() {
        long connectedAt = 1_000_000L;
        assertTrue(NotificationPolicy.isStaleReconnectNotification(
            connectedAt - 120_000L, connectedAt, connectedAt + 5_000L));
        assertFalse(NotificationPolicy.isStaleReconnectNotification(
            connectedAt - 5_000L, connectedAt, connectedAt + 5_000L));
        assertFalse(NotificationPolicy.isStaleReconnectNotification(
            connectedAt - 120_000L, connectedAt, connectedAt + 60_000L));
    }

    @Test
    public void canonicalizesNotificationSenderSummariesForAllSources() {
        org.junit.Assert.assertEquals("Siblings Abiwo", NotificationPolicy.canonicalSenderName(
            "3 messages from Siblings\u200B  Abiwo (2 messages)"));
        org.junit.Assert.assertEquals("Project Team", NotificationPolicy.canonicalSenderName(
            "Project Team - 4 new messages"));
    }

    @Test
    public void stableConversationIdentityPrefersShortcutAndConversationMetadata() {
        org.junit.Assert.assertEquals(
            "com.whatsapp|shortcut|family-42",
            NotificationPolicy.stableConversationKey(
                "com.whatsapp", "Family-42", "Siblings Abiwo", "changing-tag", "Abiwo"));
        org.junit.Assert.assertEquals(
            NotificationPolicy.stableConversationKey("com.whatsapp", "", "Siblings Abiwo", "", "Abiwo"),
            NotificationPolicy.stableConversationKey("com.whatsapp", "", "SIBLINGS  ABIWO", "", "Another title"));
    }
}
