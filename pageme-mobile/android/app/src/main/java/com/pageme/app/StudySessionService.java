package com.pageme.app;

import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

/**
 * Foreground service active for the duration of a study session.
 *
 * Responsibilities:
 *  1. Show a persistent "FOCUS ACTIVE — tap to return to PageMe" notification that
 *     effectively occupies the shade and gives the user a visible way back.
 *  2. Sweep clickable notifications from the shade every 300 ms so nothing
 *     clickable builds up while the student is away.
 *  3. If PACKAGE_USAGE_STATS permission is granted, detect when the user navigates
 *     to a non-study / non-PageMe app and immediately bring PageMe back to front.
 *  4. Stop itself when the focus lock expires or the study session ends.
 */
public class StudySessionService extends Service {
    private static final int NOTIF_ID   = 7777;
    private static final String CHANNEL = "pageme_study_session";
    private static final long   TICK_MS = 300L; // Check every 300ms for near-instant response
    private static final String REPOST_CHANNEL = "pageme_silent_passthrough";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable watchdog;
    private android.view.WindowManager windowManager;
    private android.view.View statusBlockerView;
    private final Runnable collapseRunnable = new Runnable() {
        @Override
        public void run() {
            android.content.SharedPreferences prefs =
                getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE);
            boolean studyActive = prefs.getBoolean("study_session_active", false);
            if (studyActive) {
                collapseStatusBar();
                handler.postDelayed(this, 250);
            }
        }
    };

    // ── Lifecycle helpers ────────────────────────────────────────────

    public static void start(Context ctx) {
        Intent i = new Intent(ctx, StudySessionService.class);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            ctx.startForegroundService(i);
        } else {
            ctx.startService(i);
        }
    }

    public static void stop(Context ctx) {
        ctx.stopService(new Intent(ctx, StudySessionService.class));
    }

    // ── Service callbacks ────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannel();
        startForeground(NOTIF_ID, buildNotification());
        startWatchdog();
        handler.post(collapseRunnable);
        setupStatusBlocker();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (watchdog != null) handler.removeCallbacks(watchdog);
        handler.removeCallbacks(collapseRunnable);
        removeStatusBlocker();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    // ── Watchdog loop ────────────────────────────────────────────────

    private void startWatchdog() {
        watchdog = new Runnable() {
            @Override
            public void run() {
                android.content.SharedPreferences prefs =
                    getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE);

                boolean studyActive   = prefs.getBoolean("study_session_active", false);
                long    focusUntil    = prefs.getLong("focus_lock_until", 0L);
                String  studyPackage  = prefs.getString("study_active_package", "");
                String  selfPkg       = getPackageName();

                // A study app may be launched with or without a focus timer. A positive
                // focus deadline ends the session; zero means the session ends on return.
                boolean timedSessionExpired = focusUntil > 0L && focusUntil < System.currentTimeMillis();
                if (!studyActive || timedSessionExpired) {
                    prefs.edit().putBoolean("study_session_active", false).apply();
                    if (timedSessionExpired) returnToPageMe();
                    stopSelf();
                    return;
                }

                // Sweep all clickable notifications, including those emitted by the
                // selected study app. Calls and PageMe's own focus notice remain.
                PagerNotificationListenerService.sweepNotificationsForStudy(studyPackage, selfPkg);
                cancelRepostChannelNotifications();

                // Foreground-app monitoring (requires PACKAGE_USAGE_STATS)
                if (hasUsageStatsPermission()) {
                    String fg = getForegroundApp();
                    if (fg != null
                            && !fg.equals(studyPackage)
                            && !fg.equals(selfPkg)
                            && !fg.equals("android")
                            && !fg.equals("com.android.systemui")
                            && !fg.equals("com.android.phone")
                            && !fg.equals("com.android.server.telecom")
                            && !fg.equals("com.android.dialer")
                            && !fg.equals("com.google.android.dialer")
                            && !fg.isEmpty()) {
                        // User navigated to a rogue app via the notification shade —
                        // pull PageMe back immediately and signal the study-apps screen.
                        try {
                            Intent bring = new Intent(StudySessionService.this, MainActivity.class);
                            bring.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                            bring.putExtra("show_study_lock", true);
                            startActivity(bring);
                        } catch (Exception ignored) {}
                    }
                }

                handler.postDelayed(this, TICK_MS);
            }
        };
        handler.post(watchdog);
    }

    private void returnToPageMe() {
        try {
            Intent bring = new Intent(this, MainActivity.class);
            bring.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(bring);
        } catch (Exception ignored) {}
    }

    /**
     * Cancels any notifications we reposted on the silent passthrough channel
     * so they can't be clicked during a study session.
     */
    private void cancelRepostChannelNotifications() {
        try {
            android.app.NotificationManager nm =
                (android.app.NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            android.service.notification.StatusBarNotification[] active =
                PagerNotificationListenerService.listenerInstance != null
                    ? PagerNotificationListenerService.listenerInstance.getActiveNotifications()
                    : null;
            if (active == null) return;
            for (android.service.notification.StatusBarNotification sbn : active) {
                if (getPackageName().equals(sbn.getPackageName())
                        && sbn.getId() != NOTIF_ID) {
                    nm.cancel(sbn.getId());
                }
            }
        } catch (Exception ignored) {}
    }

    // ── Notification ─────────────────────────────────────────────────

    private void ensureChannel() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            android.app.NotificationChannel ch = new android.app.NotificationChannel(
                CHANNEL, "PageMe Focus Session",
                android.app.NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            ch.setDescription("Active while a focus session is running");
            ((android.app.NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE))
                .createNotificationChannel(ch);
        }
    }

    private android.app.Notification buildNotification() {
        // Tap → return to PageMe
        Intent tapIntent = new Intent(this, MainActivity.class);
        tapIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        android.app.PendingIntent pi = android.app.PendingIntent.getActivity(
            this, 0, tapIntent,
            android.app.PendingIntent.FLAG_IMMUTABLE
                | android.app.PendingIntent.FLAG_UPDATE_CURRENT);

        return new android.app.Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentTitle("PAGEME — FOCUS SESSION ACTIVE")
            .setContentText("Tap to return to your pager")
            .setContentIntent(pi)
            .setOngoing(true)
            .build();
    }

    // ── Usage stats helpers ───────────────────────────────────────────

    private boolean hasUsageStatsPermission() {
        try {
            android.app.AppOpsManager appOps = (android.app.AppOpsManager) getSystemService(Context.APP_OPS_SERVICE);
            int mode = appOps.checkOpNoThrow(android.app.AppOpsManager.OPSTR_GET_USAGE_STATS,
                    android.os.Process.myUid(), getPackageName());
            return mode == android.app.AppOpsManager.MODE_ALLOWED;
        } catch (Exception e) {
            return false;
        }
    }

    private String getForegroundApp() {
        try {
            android.app.usage.UsageStatsManager usm = (android.app.usage.UsageStatsManager)
                getSystemService(Context.USAGE_STATS_SERVICE);
            if (usm == null) return null;
            long now = System.currentTimeMillis();
            android.app.usage.UsageEvents events = usm.queryEvents(now - 10000, now);
            if (events == null) return null;

            android.app.usage.UsageEvents.Event event = new android.app.usage.UsageEvents.Event();
            String lastForegroundApp = null;
            while (events.hasNextEvent()) {
                events.getNextEvent(event);
                if (event.getEventType() == android.app.usage.UsageEvents.Event.ACTIVITY_RESUMED) {
                    lastForegroundApp = event.getPackageName();
                }
            }
            return lastForegroundApp;
        } catch (Exception e) {
            return null;
        }
    }

    private boolean hasOverlayPermission() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            return android.provider.Settings.canDrawOverlays(this);
        }
        return true;
    }

    @android.annotation.SuppressLint("ClickableViewAccessibility")
    private void setupStatusBlocker() {
        if (!hasOverlayPermission()) return;
        try {
            windowManager = (android.view.WindowManager) getSystemService(WINDOW_SERVICE);
            if (windowManager == null) return;

            int statusBarHeight = Math.round(24 * getResources().getDisplayMetrics().density);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                android.view.WindowMetrics metrics = windowManager.getCurrentWindowMetrics();
                android.graphics.Insets insets = metrics.getWindowInsets().getInsetsIgnoringVisibility(
                    android.view.WindowInsets.Type.statusBars());
                statusBarHeight = insets.top;
            }
            if (statusBarHeight <= 0) {
                statusBarHeight = 80;
            }

            statusBlockerView = new android.view.View(this);
            statusBlockerView.setBackgroundColor(android.graphics.Color.TRANSPARENT);
            statusBlockerView.setOnTouchListener(new android.view.View.OnTouchListener() {
                @Override
                public boolean onTouch(android.view.View v, android.view.MotionEvent event) {
                    return true;
                }
            });

            android.view.WindowManager.LayoutParams params = new android.view.WindowManager.LayoutParams(
                android.view.WindowManager.LayoutParams.MATCH_PARENT,
                statusBarHeight,
                android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O
                    ? android.view.WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                    : android.view.WindowManager.LayoutParams.TYPE_PHONE,
                android.view.WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                    | android.view.WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                android.graphics.PixelFormat.TRANSLUCENT
            );
            params.gravity = android.view.Gravity.TOP;

            windowManager.addView(statusBlockerView, params);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void removeStatusBlocker() {
        try {
            if (windowManager != null && statusBlockerView != null) {
                windowManager.removeView(statusBlockerView);
                statusBlockerView = null;
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @android.annotation.SuppressLint("WrongConstant")
    private void collapseStatusBar() {
        try {
            Object statusBarService = getSystemService("statusbar");
            Class<?> statusBarManager = Class.forName("android.app.StatusBarManager");
            java.lang.reflect.Method collapsePanels = statusBarManager.getMethod("collapsePanels");
            collapsePanels.invoke(statusBarService);
        } catch (Exception ignored) {}
    }
}
