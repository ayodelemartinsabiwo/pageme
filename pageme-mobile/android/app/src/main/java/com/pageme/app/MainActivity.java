package com.pageme.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String RUNTIME_PERMISSION_FLOW_UNTIL = "runtime_permission_flow_until";
    private static final long RUNTIME_PERMISSION_FLOW_TIMEOUT_MS = 5 * 60 * 1000L;
    private static final String EXTERNAL_SYSTEM_FLOW_PENDING = "external_system_flow_pending";
    private static final String EXTERNAL_SYSTEM_FLOW_WAS_ACTIVE = "external_system_flow_was_active";
    public static boolean isResumed = false;
    private static long launcherSelectionGraceUntil = 0L;
    private boolean screenPinRequestIssued = false;
    private final android.os.Handler pinHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable delayedPinRequest = this::requestScreenPinning;
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NotificationReceiverPlugin.class);
        registerPlugin(LauncherPlugin.class);
        registerPlugin(LoraBlePlugin.class);
        registerPlugin(FocusSchedulePlugin.class);
        registerPlugin(PageMeMessagingPlugin.class);
        registerPlugin(SecureIdentityPlugin.class);

        super.onCreate(savedInstanceState);
        PagerNotificationListenerService.clearLegacyPassthroughNotifications(this);
        FocusScheduleManager.cancelReminder(this);

        android.content.Intent launchIntent = getIntent();
        boolean emergencyRestore = EmergencyExitManager.consumeRestoreIntent(this, launchIntent);
        boolean launcherSelectionCompleted = launchIntent != null
            && launchIntent.getBooleanExtra(LauncherPlugin.EXTRA_LAUNCHER_SELECTION_COMPLETED, false);
        if (launcherSelectionCompleted) {
            launcherSelectionGraceUntil = System.currentTimeMillis() + 5_000L;
        }
        android.content.SharedPreferences prefs = getSharedPreferences("PageMePrefs", android.content.Context.MODE_PRIVATE);
        boolean isPagerActive = prefs.getBoolean("pager_mode_active", false);
        boolean launcherSelectionReturn = LauncherPlugin.isHomeAliasIntent(getIntent())
            && isLauncherSelectionReturnAllowed();
        if (!isPagerActive && FocusScheduleManager.hasEnabledAutomation(this)
                && LauncherPlugin.isHomeAliasIntent(getIntent())
                && !launcherSelectionReturn) {
            LauncherPlugin.launchSystemHome(this);
            finish();
            return;
        }
        if (isPagerActive) {
            LauncherPlugin.enableLauncherAlias(this, true);
        }
        setPagerUiActive(isPagerActive && !prefs.getBoolean("bypass_relaunch", false));

        if (launcherSelectionReturn) {
            LauncherPlugin.markLauncherUserSelected(this);
            LauncherPlugin.clearLauncherSelectionPending(this);
            getBridge().getWebView().postDelayed(() -> dispatchLauncherDefaultChanged(true), 500L);
        }

        if (launcherSelectionCompleted) {
            LauncherPlugin.clearLauncherSelectionPending(this);
            boolean isDefault = launchIntent.getBooleanExtra(LauncherPlugin.EXTRA_LAUNCHER_IS_DEFAULT, true);
            if (isDefault) LauncherPlugin.markLauncherUserSelected(this);
            launchIntent.removeExtra(LauncherPlugin.EXTRA_LAUNCHER_SELECTION_COMPLETED);
            launchIntent.removeExtra(LauncherPlugin.EXTRA_LAUNCHER_IS_DEFAULT);
            // A cold WebView also checks the role during setup mount. This delayed
            // event covers the case where its listener is already available.
            getBridge().getWebView().postDelayed(() -> dispatchLauncherDefaultChanged(isDefault), 500L);
        }
        if (emergencyRestore) {
            getBridge().getWebView().postDelayed(this::dispatchEmergencyExitEnded, 500L);
        }
    }

    private boolean isPinned() {
        android.app.ActivityManager am = (android.app.ActivityManager) getSystemService(android.content.Context.ACTIVITY_SERVICE);
        if (am == null) return false;
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            return am.getLockTaskModeState() != android.app.ActivityManager.LOCK_TASK_MODE_NONE;
        } else {
            return am.isInLockTaskMode();
        }
    }

    public void requestScreenPinning() {
        if (android.os.Looper.myLooper() != android.os.Looper.getMainLooper()) {
            runOnUiThread(this::requestScreenPinning);
            return;
        }
        if (isPinned()) {
            screenPinRequestIssued = false;
            pinHandler.removeCallbacks(delayedPinRequest);
            return;
        }
        if (screenPinRequestIssued) return;
        if (!isResumed) return;
        if (!hasWindowFocus()) {
            pinHandler.removeCallbacks(delayedPinRequest);
            pinHandler.postDelayed(delayedPinRequest, 100L);
            return;
        }
        pinHandler.removeCallbacks(delayedPinRequest);
        screenPinRequestIssued = true;
        try {
            startLockTask();
        } catch (Exception e) {
            screenPinRequestIssued = false;
        }
    }

    public void beginExternalSystemFlow() {
        android.content.SharedPreferences prefs = getSharedPreferences(
            "PageMePrefs", android.content.Context.MODE_PRIVATE);
        boolean isPagerActive = prefs.getBoolean("pager_mode_active", false);
        prefs.edit()
            .putBoolean("bypass_relaunch", true)
            .putBoolean(EXTERNAL_SYSTEM_FLOW_PENDING, true)
            .putBoolean(EXTERNAL_SYSTEM_FLOW_WAS_ACTIVE, isPagerActive)
            .commit();
        screenPinRequestIssued = false;
        runOnUiThread(() -> {
            pinHandler.removeCallbacks(delayedPinRequest);
            collapseHandler.removeCallbacks(collapseRunnable);
            setPagerUiActive(false);
            try { stopLockTask(); } catch (Exception ignored) {}
        });
    }

    private boolean isExternalSystemFlowActive() {
        return getSharedPreferences("PageMePrefs", android.content.Context.MODE_PRIVATE)
            .getBoolean(EXTERNAL_SYSTEM_FLOW_PENDING, false);
    }

    private void completeExternalSystemFlow() {
        android.content.SharedPreferences prefs = getSharedPreferences(
            "PageMePrefs", android.content.Context.MODE_PRIVATE);
        if (!prefs.getBoolean(EXTERNAL_SYSTEM_FLOW_PENDING, false)) return;
        boolean restorePager = prefs.getBoolean(EXTERNAL_SYSTEM_FLOW_WAS_ACTIVE, false)
            && prefs.getBoolean("pager_mode_active", false);
        android.content.SharedPreferences.Editor editor = prefs.edit()
            .remove(EXTERNAL_SYSTEM_FLOW_PENDING)
            .remove(EXTERNAL_SYSTEM_FLOW_WAS_ACTIVE);
        if (restorePager) editor.putBoolean("bypass_relaunch", false);
        editor.commit();
        if (restorePager) {
            screenPinRequestIssued = false;
            setPagerUiActive(true);
            requestScreenPinning();
        }
    }

    public void beginRuntimePermissionFlow() {
        getSharedPreferences("PageMePrefs", android.content.Context.MODE_PRIVATE).edit()
            .putLong(RUNTIME_PERMISSION_FLOW_UNTIL,
                System.currentTimeMillis() + RUNTIME_PERMISSION_FLOW_TIMEOUT_MS)
            .commit();
        screenPinRequestIssued = false;
    }

    public void endRuntimePermissionFlow() {
        getSharedPreferences("PageMePrefs", android.content.Context.MODE_PRIVATE).edit()
            .remove(RUNTIME_PERMISSION_FLOW_UNTIL)
            .commit();
        runOnUiThread(() -> {
            android.content.SharedPreferences prefs = getSharedPreferences(
                "PageMePrefs", android.content.Context.MODE_PRIVATE);
            if (prefs.getBoolean("pager_mode_active", false)
                    && !prefs.getBoolean("bypass_relaunch", false)) {
                setPagerUiActive(true);
                requestScreenPinning();
            }
        });
    }

    boolean isRuntimePermissionFlowActive() {
        android.content.SharedPreferences prefs = getSharedPreferences(
            "PageMePrefs", android.content.Context.MODE_PRIVATE);
        long until = prefs.getLong(RUNTIME_PERMISSION_FLOW_UNTIL, 0L);
        if (until <= System.currentTimeMillis()) {
            if (until != 0L) prefs.edit().remove(RUNTIME_PERMISSION_FLOW_UNTIL).apply();
            return false;
        }
        return true;
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        boolean emergencyRestore = EmergencyExitManager.consumeRestoreIntent(this, intent);
        boolean launcherSelectionCompleted = intent != null
            && intent.getBooleanExtra(LauncherPlugin.EXTRA_LAUNCHER_SELECTION_COMPLETED, false);
        if (launcherSelectionCompleted) {
            launcherSelectionGraceUntil = System.currentTimeMillis() + 5_000L;
        }
        if (intent != null && intent.getBooleanExtra("scheduled_focus", false)) {
            FocusScheduleManager.cancelReminder(this);
        }
        android.content.SharedPreferences prefs = getSharedPreferences("PageMePrefs", android.content.Context.MODE_PRIVATE);
        boolean returningFromLauncherSelection = launcherSelectionCompleted
            || (LauncherPlugin.isHomeAliasIntent(intent)
                && isLauncherSelectionReturnAllowed());
        if (returningFromLauncherSelection) {
            if (LauncherPlugin.isPageMeDefaultHome(this)) LauncherPlugin.markLauncherUserSelected(this);
            LauncherPlugin.clearLauncherSelectionPending(this);
            completeExternalSystemFlow();
        }
        if (!prefs.getBoolean("pager_mode_active", false)
                && FocusScheduleManager.hasEnabledAutomation(this)
                && LauncherPlugin.isHomeAliasIntent(intent)
                && !returningFromLauncherSelection) {
            LauncherPlugin.launchSystemHome(this);
            finish();
        }
        if (launcherSelectionCompleted) {
            intent.removeExtra(LauncherPlugin.EXTRA_LAUNCHER_SELECTION_COMPLETED);
            boolean isDefault = intent.getBooleanExtra(LauncherPlugin.EXTRA_LAUNCHER_IS_DEFAULT, true);
            intent.removeExtra(LauncherPlugin.EXTRA_LAUNCHER_IS_DEFAULT);
            dispatchLauncherDefaultChanged(isDefault);
        }
        if (emergencyRestore) dispatchEmergencyExitEnded();
    }

    @Override
    public void onResume() {
        isResumed = true;

        android.content.SharedPreferences prefs = getSharedPreferences("PageMePrefs", android.content.Context.MODE_PRIVATE);
        boolean studySessionActive = prefs.getBoolean("study_session_active", false);
        long focusLockUntil = prefs.getLong("focus_lock_until", 0L);
        boolean isPagerActive = prefs.getBoolean("pager_mode_active", false);

        android.content.Intent intent = getIntent();
        final boolean scheduledFocus = intent != null && intent.getBooleanExtra("scheduled_focus", false);
        if (scheduledFocus) {
            intent.removeExtra("scheduled_focus");
            FocusScheduleManager.cancelReminder(this);
        }
        final boolean rogueDetected = intent != null && intent.getBooleanExtra("show_study_lock", false);
        if (rogueDetected) {
            intent.removeExtra("show_study_lock");
        }

        // Returning from a study session — do cleanup BEFORE super.onResume() fires
        // Capacitor's appStateChange event in JS, so JS sees a clean state.
        if (studySessionActive) {
            prefs.edit()
                .putBoolean("study_session_active", false)
                .putBoolean("bypass_relaunch",      false)
                .apply();
            // Stop the watchdog service
            StudySessionService.stop(this);
            if (isPagerActive) {
                requestScreenPinning();
            }
            // Sweep the notification shade clean before the user can interact with it
            PagerNotificationListenerService.sweepNotificationsForStudy("", getPackageName());
        }

        super.onResume();
        completeExternalSystemFlow();
        boolean bypassRelaunch = prefs.getBoolean("bypass_relaunch", false);
        setPagerUiActive(isPagerActive && !bypassRelaunch);
        if (LauncherPlugin.isLauncherSelectionPending(this)) {
            boolean isDefaultHome = LauncherPlugin.isPageMeDefaultHome(this);
            dispatchLauncherDefaultChanged(isDefaultHome);
        }

        if (scheduledFocus) {
            try {
                getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('pagemeScheduledFocusActivated'))", null));
            } catch (Exception ignored) {}
        }

        // A cold WebView launch can restore Pager Mode before the JavaScript bridge is ready.
        // Pin from the resumed activity as well so activation does not wait for JS polling.
        if (isPagerActive && !prefs.getBoolean("bypass_relaunch", false)
                && !isRuntimePermissionFlowActive()) {
            getWindow().getDecorView().post(() -> {
                android.content.SharedPreferences currentPrefs = getSharedPreferences("PageMePrefs", android.content.Context.MODE_PRIVATE);
                if (currentPrefs.getBoolean("pager_mode_active", false)
                        && !currentPrefs.getBoolean("bypass_relaunch", false)
                        && !isPinned()) {
                    requestScreenPinning();
                }
            });
        }

        // Only clear bypass flag if the app is currently in lock task mode.
        // When not pinned (emergency or study mode), bypass must stay true so the user
        // can still leave the pager freely until the window expires / re-pin happens.
        if (isPagerActive && isPinned()) {
            prefs.edit().putBoolean("bypass_relaunch", false).apply();
        }

        // ANR auto-recovery: reload WebView if JS heartbeat is stale (>60s old)
        try {
            getBridge().getWebView().evaluateJavascript(
                "(function(){try{var h=localStorage.getItem('pageme_heartbeat');return h?h:'0';}catch(e){return '0';}})()",
                value -> {
                    try {
                        long heartbeat = Long.parseLong(value.replaceAll("[\"']", "").trim());
                        if (heartbeat > 0 && System.currentTimeMillis() - heartbeat > 60000) {
                            getBridge().getWebView().post(() -> getBridge().getWebView().reload());
                        }
                    } catch (Exception e) { /* ignore */ }
                }
            );
        } catch (Exception e) { /* ignore */ }

        // Signal JS to return to home screen or study apps list after a study session ends
        if (studySessionActive) {
            try {
                getBridge().getWebView().post(() ->
                    getBridge().getWebView().evaluateJavascript(
                        rogueDetected
                        ? "window.dispatchEvent(new CustomEvent('pagemeStudyRogueAppDetected'))"
                        : "window.dispatchEvent(new CustomEvent('pagemeStudySessionEnded'))", null));
            } catch (Exception e) { /* ignore */ }
        }
    }

    private void dispatchLauncherDefaultChanged(boolean isDefault) {
        try {
            getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('pagemeLauncherDefaultChanged',{detail:{isDefault:"
                    + (isDefault ? "true" : "false") + "}}))",
                null));
        } catch (Exception ignored) {}
    }

    private void dispatchEmergencyExitEnded() {
        try {
            getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('pagemeEmergencyExitEnded'))", null));
        } catch (Exception ignored) {}
    }

    private boolean isLauncherSelectionReturnAllowed() {
        return LauncherPlugin.isLauncherUserSelected(this)
            || LauncherPlugin.isLauncherSelectionPending(this)
            || System.currentTimeMillis() < launcherSelectionGraceUntil;
    }

    private final android.os.Handler collapseHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable collapseRunnable = new Runnable() {
        @Override
        public void run() {
            android.content.SharedPreferences prefs = getSharedPreferences("PageMePrefs", android.content.Context.MODE_PRIVATE);
            boolean isPagerActive = prefs.getBoolean("pager_mode_active", false);
            long focusLockUntil = prefs.getLong("focus_lock_until", 0L);
            boolean isFocusActive = focusLockUntil > System.currentTimeMillis();
            boolean bypassRelaunch = prefs.getBoolean("bypass_relaunch", false);
            android.app.KeyguardManager km = (android.app.KeyguardManager) getSystemService(android.content.Context.KEYGUARD_SERVICE);
            boolean isKeyguardLocked = km != null && km.isKeyguardLocked();
            if (isResumed && !hasWindowFocus() && isPagerActive && isFocusActive
                    && !isRuntimePermissionFlowActive()
                    && !isKeyguardLocked && !bypassRelaunch) {
                hideSystemUI();
                collapseHandler.postDelayed(this, 200);
            }
        }
    };

    @Override
    public void onPause() {
        isResumed = false;
        screenPinRequestIssued = false;
        pinHandler.removeCallbacks(delayedPinRequest);
        collapseHandler.removeCallbacks(collapseRunnable);
        NotificationReceiverPlugin.turnOffTorch(this);
        super.onPause();

        android.content.SharedPreferences prefs = getSharedPreferences("PageMePrefs", android.content.Context.MODE_PRIVATE);
        boolean isPagerActive = prefs.getBoolean("pager_mode_active", false);
        long focusLockUntil = prefs.getLong("focus_lock_until", 0L);
        boolean isFocusActive = focusLockUntil > System.currentTimeMillis();
        android.os.PowerManager pm = (android.os.PowerManager) getSystemService(android.content.Context.POWER_SERVICE);
        boolean isScreenOn = pm != null && pm.isInteractive();

        android.app.KeyguardManager km = (android.app.KeyguardManager) getSystemService(android.content.Context.KEYGUARD_SERVICE);
        boolean isKeyguardLocked = km != null && km.isKeyguardLocked();

        // Don't force-foreground when we intentionally left (study app launch or emergency dial).
        boolean bypassRelaunch = prefs.getBoolean("bypass_relaunch", false);
        if (isPagerActive && isFocusActive && isScreenOn && !isKeyguardLocked
                && !bypassRelaunch && !isRuntimePermissionFlowActive()) {
            try {
                android.content.Intent intent = new android.content.Intent(this, MainActivity.class);
                intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                    | android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                    | android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(intent);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }

    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        // Runtime permission dialogs are Android-owned UI, not an intentional exit.
        if (isRuntimePermissionFlowActive()) return;
        android.content.SharedPreferences prefs = getSharedPreferences("PageMePrefs", android.content.Context.MODE_PRIVATE);
        boolean isPagerActive = prefs.getBoolean("pager_mode_active", false);
        boolean bypassRelaunch = prefs.getBoolean("bypass_relaunch", false);
        long focusLockUntil = prefs.getLong("focus_lock_until", 0L);
        if (isPagerActive && !bypassRelaunch && focusLockUntil <= System.currentTimeMillis()) {
            LauncherPlugin.leavePagerMode(this, this, false);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        android.content.SharedPreferences prefs = getSharedPreferences("PageMePrefs", android.content.Context.MODE_PRIVATE);
        boolean isPagerActive = prefs.getBoolean("pager_mode_active", false);
        long focusLockUntil = prefs.getLong("focus_lock_until", 0L);
        boolean isFocusActive = focusLockUntil > System.currentTimeMillis();
        boolean bypassRelaunch = prefs.getBoolean("bypass_relaunch", false);

        if (hasFocus) {
            setPagerUiActive(isPagerActive && !bypassRelaunch);
            collapseHandler.removeCallbacks(collapseRunnable);
            if (isPagerActive && !bypassRelaunch && !isPinned()
                    && !isRuntimePermissionFlowActive() && !isExternalSystemFlowActive()) {
                requestScreenPinning();
            }
        } else {
            android.app.KeyguardManager km = (android.app.KeyguardManager) getSystemService(android.content.Context.KEYGUARD_SERVICE);
            boolean isKeyguardLocked = km != null && km.isKeyguardLocked();

            android.content.SharedPreferences wfcPrefs = getSharedPreferences("PageMePrefs", android.content.Context.MODE_PRIVATE);
            boolean bypassRelaunchNow = wfcPrefs.getBoolean("bypass_relaunch", false);
            if (isResumed && isPagerActive && isFocusActive && !isKeyguardLocked
                    && !bypassRelaunchNow && !isRuntimePermissionFlowActive()) {
                hideSystemUI();
                collapseHandler.removeCallbacks(collapseRunnable);
                collapseHandler.post(collapseRunnable);
            }
            if (isResumed && isPagerActive && isFocusActive && !isKeyguardLocked
                    && !bypassRelaunchNow && !isRuntimePermissionFlowActive()) {
                if (NotificationReceiverPlugin.instance != null) {
                    NotificationReceiverPlugin.instance.triggerBypassEvent();
                }
                try {
                    android.content.Intent intent = new android.content.Intent(this, MainActivity.class);
                    intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                        | android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                        | android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    startActivity(intent);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
        }
    }

    private void hideSystemUI() {
        android.view.Window window = getWindow();
        if (window == null) return;

        // Keep screen on
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Immersive Fullscreen Mode
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
            android.view.WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.hide(android.view.WindowInsets.Type.statusBars() | android.view.WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            window.getDecorView().setSystemUiVisibility(
                android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | android.view.View.SYSTEM_UI_FLAG_FULLSCREEN
            );
        }
    }

    public void setPagerUiActive(boolean active) {
        android.view.Window window = getWindow();
        if (window == null) return;
        if (active) {
            hideSystemUI();
            return;
        }

        window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(true);
            android.view.WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.show(android.view.WindowInsets.Type.statusBars() | android.view.WindowInsets.Type.navigationBars());
            }
        } else {
            window.getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_VISIBLE);
        }
    }

    @Override
    @android.annotation.SuppressLint("MissingSuperCall")
    public void onBackPressed() {
        android.content.SharedPreferences prefs = getSharedPreferences("PageMePrefs", android.content.Context.MODE_PRIVATE);
        long focusLockUntil = prefs.getLong("focus_lock_until", 0L);
        if (focusLockUntil > System.currentTimeMillis()) {
            return;
        }
        LauncherPlugin.leavePagerMode(this, this, true);
    }

}
