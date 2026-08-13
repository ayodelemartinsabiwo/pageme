package com.pageme.app;

import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.text.TextUtils;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PermissionState;
import androidx.activity.result.ActivityResult;

@CapacitorPlugin(
    name = "NotificationReceiverPlugin",
    permissions = {
        @Permission(alias = "postNotifications", strings = { "android.permission.POST_NOTIFICATIONS" })
    }
)
public class NotificationReceiverPlugin extends Plugin {
    public static NotificationReceiverPlugin instance;

    public NotificationReceiverPlugin() {
        instance = this;
    }

    private boolean hasNotificationListenerAccess() {
        Context context = getContext();
        ComponentName cn = new ComponentName(context, PagerNotificationListenerService.class);
        String flat = Settings.Secure.getString(context.getContentResolver(), "enabled_notification_listeners");
        return flat != null && (flat.contains(cn.flattenToString()) || flat.contains(cn.flattenToShortString()));
    }

    @PluginMethod
    public void checkNotificationListener(PluginCall call) {
        Context context = getContext();
        boolean accessGranted = hasNotificationListenerAccess();
        boolean captureEnabled = context.getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE)
            .getBoolean("notification_capture_enabled", false);

        JSObject ret = new JSObject();
        ret.put("enabled", accessGranted && captureEnabled);
        ret.put("accessGranted", accessGranted);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotificationListener(PluginCall call) {
        getContext().getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE)
            .edit().putBoolean("notification_capture_enabled", true).apply();
        if (hasNotificationListenerAccess()) {
            call.resolve();
            return;
        }
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> {
                try {
                    if (getActivity() instanceof MainActivity) {
                        ((MainActivity) getActivity()).beginExternalSystemFlow();
                    } else {
                        getContext().getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE)
                            .edit().putBoolean("bypass_relaunch", true).commit();
                        try { getActivity().stopLockTask(); } catch (Exception ignored) {}
                    }
                    Intent intent = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(intent);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }
        call.resolve();
    }

    @PluginMethod
    public void setNotificationCaptureEnabled(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        getContext().getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE)
            .edit().putBoolean("notification_capture_enabled", enabled).apply();
        JSObject ret = new JSObject();
        ret.put("enabled", enabled && hasNotificationListenerAccess());
        call.resolve(ret);
    }

    @PluginMethod
    public void checkDndAccess(PluginCall call) {
        Context context = getContext();
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        boolean enabled = false;
        if (nm != null) {
            enabled = nm.isNotificationPolicyAccessGranted();
        }
        JSObject ret = new JSObject();
        ret.put("enabled", enabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestDndAccess(PluginCall call) {
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> {
                try {
                    if (getActivity() instanceof MainActivity) {
                        ((MainActivity) getActivity()).beginExternalSystemFlow();
                    } else {
                        getContext().getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE)
                            .edit().putBoolean("bypass_relaunch", true).commit();
                        try { getActivity().stopLockTask(); } catch (Exception ignored) {}
                    }
                    Intent intent = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(intent);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }
        call.resolve();
    }

    @PluginMethod
    public void setPagerModeActive(PluginCall call) {
        boolean active = call.getBoolean("active", false);
        Context context = getContext();
        if (!active) {
            PagerNotificationListenerService.clearLegacyPassthroughNotifications(context);
            LauncherPlugin.leavePagerMode(context, getActivity(), false);
            call.resolve();
            return;
        }
        android.content.SharedPreferences prefs = context.getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE);
        prefs.edit()
            .putBoolean("pager_mode_active", true)
            .putBoolean("notification_capture_enabled", true)
            .putBoolean("bypass_relaunch", false)
            .apply();
        LauncherPlugin.enableLauncherAlias(context, true);
        PagerNotificationListenerService.clearLegacyPassthroughNotifications(context);
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> {
                if (getActivity() instanceof MainActivity) {
                    MainActivity activity = (MainActivity) getActivity();
                    activity.requestScreenPinning();
                    activity.setPagerUiActive(true);
                } else {
                    try { getActivity().startLockTask(); } catch (Exception ignored) {}
                }
            });
        }
        call.resolve();
    }

    @PluginMethod
    public void setFocusLockUntil(PluginCall call) {
        long lockUntil = call.getLong("lockUntil", 0L);
        Context context = getContext();
        android.content.SharedPreferences prefs = context.getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE);
        prefs.edit().putLong("focus_lock_until", lockUntil).apply();
        call.resolve();
    }

    @PluginMethod
    public void isAppPinned(PluginCall call) {
        boolean isPinned = false;
        if (getActivity() != null) {
            try {
                android.app.ActivityManager am = (android.app.ActivityManager) getActivity().getSystemService(Context.ACTIVITY_SERVICE);
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                    isPinned = am.getLockTaskModeState() != android.app.ActivityManager.LOCK_TASK_MODE_NONE;
                } else {
                    isPinned = am.isInLockTaskMode();
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
        android.content.SharedPreferences prefs = getContext()
            .getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE);
        JSObject ret = new JSObject();
        ret.put("isPinned", isPinned);
        ret.put("pagerModeActive", prefs.getBoolean("pager_mode_active", false));
        ret.put("bypassRelaunch", prefs.getBoolean("bypass_relaunch", false));
        call.resolve(ret);
    }

    @PluginMethod
    public void getPagerModeState(PluginCall call) {
        android.content.SharedPreferences prefs = getContext()
            .getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE);
        JSObject ret = new JSObject();
        ret.put("active", prefs.getBoolean("pager_mode_active", false));
        ret.put("bypassRelaunch", prefs.getBoolean("bypass_relaunch", false));
        call.resolve(ret);
    }

    @PluginMethod
    public void pinApp(PluginCall call) {
        // Clear bypass flag before re-entering lock task.
        getContext().getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE)
            .edit().putBoolean("bypass_relaunch", false).apply();
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> {
                if (getActivity() instanceof MainActivity) {
                    MainActivity activity = (MainActivity) getActivity();
                    activity.requestScreenPinning();
                    activity.setPagerUiActive(true);
                } else {
                    try { getActivity().startLockTask(); } catch (Exception e) { e.printStackTrace(); }
                }
            });
        }
        call.resolve();
    }

    @PluginMethod
    public void unpinApp(PluginCall call) {
        // Set bypass flag so onPause/onWindowFocusChanged don't force-relaunch the pager.
        getContext().getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE)
            .edit().putBoolean("bypass_relaunch", true).apply();
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> {
                try { getActivity().stopLockTask(); } catch (Exception e) { e.printStackTrace(); }
            });
        }
        call.resolve();
    }

    @PluginMethod
    public void sendNotificationReply(PluginCall call) {
        String replyKey = call.getString("replyKey", "");
        String text = call.getString("text", "");
        boolean success = PagerNotificationListenerService.replyToNotification(replyKey, text);
        JSObject ret = new JSObject();
        ret.put("success", success);
        call.resolve(ret);
    }

    public static void onNotificationIntercepted(String from, String text, String source, String number, boolean canReply, String replyKey, String senderKey, String notificationKey) {
        if (instance != null) {
            JSObject data = new JSObject();
            data.put("from", from);
            data.put("text", text);
            data.put("source", source);
            data.put("number", number);
            data.put("canReply", canReply);
            data.put("replyKey", replyKey == null ? "" : replyKey);
            data.put("senderKey", senderKey == null ? "" : senderKey);
            data.put("notificationKey", notificationKey == null ? "" : notificationKey);
            boolean isCode = text != null && text.matches("^\\d+[\\*#\\d]*$");
            data.put("type", isCode ? "code" : "text");
            instance.notifyListeners("notificationReceived", data);
        }
    }

    public void triggerBypassEvent() {
        notifyListeners("focusTimerBypassAttempted", new JSObject());
    }

    public static void notifyAlarmReceived(JSObject data) {
        if (instance != null) {
            instance.notifyListeners("alarmReceived", data);
        }
    }

    /**
     * Disables the launcher alias and fires ACTION_HOME so the user lands on the
     * real Android home screen (not PageMe). Used by emergencyExit so pressing
     * Home / unlocking the device no longer bounces back to PageMe.
     */
    @PluginMethod
    public void launchRealHome(PluginCall call) {
        LauncherPlugin.enableLauncherAlias(getContext(), false);
        getActivity().runOnUiThread(() -> {
            try {
                android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_MAIN);
                intent.addCategory(android.content.Intent.CATEGORY_HOME);
                intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve();
            } catch (Exception e) {
                call.reject("launchRealHome failed: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void startEmergencyWindow(PluginCall call) {
        long requestedUntil = call.getLong("until", System.currentTimeMillis() + 600_000L);
        long until = Math.max(System.currentTimeMillis() + 1_000L,
            Math.min(requestedUntil, System.currentTimeMillis() + 60L * 60L * 1000L));
        boolean launchHome = call.getBoolean("launchHome", false);
        EmergencyExitManager.schedule(getContext(), until);
        if (launchHome) LauncherPlugin.enableLauncherAlias(getContext(), false);
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> {
                try { getActivity().stopLockTask(); } catch (Exception ignored) {}
                if (getActivity() instanceof MainActivity) {
                    ((MainActivity) getActivity()).setPagerUiActive(false);
                }
                if (launchHome) LauncherPlugin.launchSystemHome(getContext());
            });
        }
        JSObject result = new JSObject();
        result.put("until", until);
        call.resolve(result);
    }

    @PluginMethod
    public void restoreEmergencyWindow(PluginCall call) {
        EmergencyExitManager.restoreNow(getContext());
        if (getActivity() instanceof MainActivity) {
            MainActivity activity = (MainActivity) getActivity();
            activity.runOnUiThread(() -> {
                activity.setPagerUiActive(true);
                activity.requestScreenPinning();
            });
        }
        call.resolve();
    }

    /** Re-enables PageMe as the launcher. Called when emergency window expires or user returns. */
    @PluginMethod
    public void enableLauncher(PluginCall call) {
        LauncherPlugin.enableLauncherAlias(getContext(), true);
        call.resolve();
    }

    private void beginRuntimePermissionFlow() {
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).beginRuntimePermissionFlow();
        }
    }

    private void endRuntimePermissionFlow() {
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).endRuntimePermissionFlow();
        }
    }

    @PluginMethod
    public void setScreenLight(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        if (getActivity() == null) {
            call.reject("PageMe screen is unavailable");
            return;
        }
        getActivity().runOnUiThread(() -> {
            android.view.Window window = getActivity().getWindow();
            if (window == null) {
                call.reject("PageMe screen is unavailable");
                return;
            }
            android.view.WindowManager.LayoutParams params = window.getAttributes();
            params.screenBrightness = enabled
                ? android.view.WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL
                : android.view.WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
            window.setAttributes(params);
            JSObject ret = new JSObject();
            ret.put("isOn", enabled);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void checkPostNotificationsPermission(PluginCall call) {
        JSObject ret = new JSObject();
        boolean granted = android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.TIRAMISU
            || getPermissionState("postNotifications") == PermissionState.GRANTED;
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPostNotificationsPermission(PluginCall call) {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.TIRAMISU
                || getPermissionState("postNotifications") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        beginRuntimePermissionFlow();
        requestPermissionForAlias("postNotifications", call, "postNotificationsPermissionCallback");
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> {
                try {
                    if (getActivity() instanceof MainActivity) {
                        ((MainActivity) getActivity()).beginExternalSystemFlow();
                    }
                    Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName())
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(intent);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }
        call.resolve();
    }

    @PermissionCallback
    public void postNotificationsPermissionCallback(PluginCall call) {
        endRuntimePermissionFlow();
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("postNotifications") == PermissionState.GRANTED);
        call.resolve(ret);
    }

    @PluginMethod
    public void minimizeApp(PluginCall call) {
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> getActivity().moveTaskToBack(true));
        }
        call.resolve();
    }

    @PluginMethod
    public void fireAlarmAction(PluginCall call) {
        String key = call.getString("key", "");
        int actionIndex = call.getInt("actionIndex", 0);
        boolean success = PagerNotificationListenerService.fireAlarmAction(key, actionIndex);
        JSObject ret = new JSObject();
        ret.put("success", success);
        call.resolve(ret);
    }

    @PluginMethod
    public void dismissAlarm(PluginCall call) {
        String key = call.getString("key", "");
        boolean success = PagerNotificationListenerService.dismissAlarm(key);
        JSObject ret = new JSObject();
        ret.put("success", success);
        call.resolve(ret);
    }

    @PluginMethod
    public void getActiveAlarm(PluginCall call) {
        JSObject alarm = PagerNotificationListenerService.getActiveAlarmData();
        JSObject ret = new JSObject();
        ret.put("active", alarm != null);
        if (alarm != null) ret.put("alarm", alarm);
        call.resolve(ret);
    }

    @PluginMethod
    public void getInstalledApps(PluginCall call) {
        Context context = getContext();
        android.content.pm.PackageManager pm = context.getPackageManager();
        Intent mainIntent = new Intent(Intent.ACTION_MAIN, null);
        mainIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        // GET_META_DATA ensures we get full app info on all Android versions
        int flags = android.content.pm.PackageManager.GET_META_DATA;
        java.util.List<android.content.pm.ResolveInfo> activities;
        try {
            activities = pm.queryIntentActivities(mainIntent, flags);
        } catch (Exception e) {
            activities = pm.queryIntentActivities(mainIntent, 0);
        }

        java.util.Set<String> socialBlocklist = new java.util.HashSet<>(java.util.Arrays.asList(
            "com.instagram.android", "com.facebook.katana", "com.facebook.lite",
            "com.zhiliaoapp.musically", "com.ss.android.ugc.trill", "com.ss.android.ugc.aweme",
            "com.linkedin.android", "com.twitter.android", "com.snapchat.android",
            "com.reddit.frontpage", "com.pinterest", "com.tumblr", "com.bereal.ft",
            "com.bumble.app", "com.tinder", "com.badoo.mobile", "com.vkontakte.android",
            "com.x.android"
        ));

        String selfPkg = context.getPackageName();
        java.util.List<JSObject> appList = new java.util.ArrayList<>();
        java.util.Set<String> seenPkgs = new java.util.HashSet<>();

        for (android.content.pm.ResolveInfo info : activities) {
            if (info.activityInfo == null) continue;
            String pkg = info.activityInfo.packageName;
            if (pkg.equals(selfPkg) || socialBlocklist.contains(pkg) || seenPkgs.contains(pkg)) continue;
            seenPkgs.add(pkg);

            // Filter out non-updatable system apps (carriers, settings panels, hardware services)
            // but keep user-installed apps and updatable system apps (YouTube, Gmail, Maps, etc.)
            try {
                android.content.pm.ApplicationInfo appInfo = pm.getApplicationInfo(pkg, 0);
                boolean isSystemApp = (appInfo.flags & android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0;
                boolean isUpdatedSystemApp = (appInfo.flags & android.content.pm.ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0;
                if (isSystemApp && !isUpdatedSystemApp) continue;
            } catch (Exception ignored) {}

            try {
                JSObject app = new JSObject();
                app.put("name", info.loadLabel(pm).toString());
                app.put("packageName", pkg);
                appList.add(app);
            } catch (Exception ignored) {}
        }

        // Sort alphabetically by name
        appList.sort((a, b) -> {
            try { return a.getString("name").compareToIgnoreCase(b.getString("name")); }
            catch (Exception e) { return 0; }
        });

        org.json.JSONArray appsArray = new org.json.JSONArray();
        for (JSObject app : appList) appsArray.put(app);

        JSObject ret = new JSObject();
        ret.put("apps", appsArray);
        call.resolve(ret);
    }

    @PluginMethod
    public void setStudyApps(PluginCall call) {
        com.getcapacitor.JSArray packages = call.getArray("packages", new com.getcapacitor.JSArray());
        android.content.Context context = getContext();
        android.content.SharedPreferences prefs = context.getSharedPreferences("PageMePrefs", android.content.Context.MODE_PRIVATE);
        prefs.edit().putString("study_app_packages", packages.toString()).apply();
        call.resolve();
    }

    @PluginMethod
    public void launchApp(PluginCall call) {
        String packageName = call.getString("packageName", "");
        if (packageName.isEmpty()) { call.reject("packageName required"); return; }
        android.content.pm.PackageManager pm = getContext().getPackageManager();
        Intent launchIntent = pm.getLaunchIntentForPackage(packageName);
        if (launchIntent == null) { call.reject("No launch intent for " + packageName); return; }
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        getActivity().runOnUiThread(() -> {
            try {
                getContext().startActivity(launchIntent);
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to launch: " + e.getMessage());
            }
        });
    }

    /**
     * Consolidated study-app launch that handles the full setup in one shot:
     *  1. Sets bypass_relaunch + study_session_active flags in SharedPrefs
     *  2. Exits lock task mode
     *  3. Sweeps existing notifications from the shade immediately
     *  4. Starts StudySessionService (watchdog + persistent notification)
     *  5. Launches the target app
     */
    @PluginMethod
    public void launchStudyApp(PluginCall call) {
        String packageName = call.getString("packageName", "");
        if (packageName.isEmpty()) { call.reject("packageName required"); return; }

        Context context = getContext();
        android.content.SharedPreferences prefs =
            context.getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE);

        android.content.pm.PackageManager pm = context.getPackageManager();
        Intent launchIntent = pm.getLaunchIntentForPackage(packageName);
        if (launchIntent == null) { call.reject("No launch intent for " + packageName); return; }
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);

        final String pkg = packageName;
        getActivity().runOnUiThread(() -> {
            try {
                // Mark session active and set bypass so onPause/onWindowFocusChanged
                // don't immediately bring PageMe back to front during launch
                prefs.edit()
                    .putBoolean("bypass_relaunch",       true)
                    .putBoolean("study_session_active",  true)
                    .putString ("study_active_package",  pkg)
                    .apply();

                // Exit lock task so the study app can take focus
                try { getActivity().stopLockTask(); } catch (Exception ignored) {}

                // Remove every clickable shade notification except calls and the
                // PageMe focus-service notification before the study app appears.
                PagerNotificationListenerService.sweepNotificationsForStudy(pkg, context.getPackageName());

                // Start background watchdog
                StudySessionService.start(context);

                // Launch
                context.startActivity(launchIntent);
                call.resolve();
            } catch (Exception e) {
                // Rollback on failure
                prefs.edit()
                    .putBoolean("bypass_relaunch",      false)
                    .putBoolean("study_session_active", false)
                    .apply();
                try { getActivity().startLockTask(); } catch (Exception ignored2) {}
                StudySessionService.stop(context);
                call.reject("Failed to launch study app: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void checkUsageStatsPermission(PluginCall call) {
        boolean granted = false;
        try {
            android.app.AppOpsManager appOps = (android.app.AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
            int mode = appOps.checkOpNoThrow(android.app.AppOpsManager.OPSTR_GET_USAGE_STATS,
                    android.os.Process.myUid(), getContext().getPackageName());
            granted = (mode == android.app.AppOpsManager.MODE_ALLOWED);
        } catch (Exception e) { /* stay false */ }
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestUsageStatsPermission(PluginCall call) {
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> {
                try {
                    getContext().getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE)
                            .edit().putBoolean("bypass_relaunch", true).apply();
                    try {
                        getActivity().stopLockTask();
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                    Intent intent = new Intent(android.provider.Settings.ACTION_USAGE_ACCESS_SETTINGS);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(intent);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }
        call.resolve();
    }

    @PluginMethod
    public void checkOverlayPermission(PluginCall call) {
        boolean granted = false;
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                granted = android.provider.Settings.canDrawOverlays(getContext());
            } else {
                granted = true;
            }
        } catch (Exception e) { /* stay false */ }
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestOverlayPermission(PluginCall call) {
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> {
                try {
                    getContext().getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE)
                            .edit().putBoolean("bypass_relaunch", true).apply();
                    try {
                        getActivity().stopLockTask();
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                        Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                android.net.Uri.parse("package:" + getContext().getPackageName()));
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        getContext().startActivity(intent);
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }
        call.resolve();
    }

    @PluginMethod
    public void dialNumber(PluginCall call) {
        String number = call.getString("number", "");
        if (number.isEmpty()) { call.reject("number required"); return; }
        Intent dialIntent = new Intent(Intent.ACTION_DIAL, android.net.Uri.parse("tel:" + number));
        dialIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getActivity().runOnUiThread(() -> {
            try {
                getContext().startActivity(dialIntent);
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to dial: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void pickContact(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_PICK,
            android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI);
        try {
            if (getActivity() instanceof MainActivity) {
                ((MainActivity) getActivity()).beginExternalSystemFlow();
            }
            startActivityForResult(call, intent, "contactPickerResult");
        } catch (Exception e) {
            call.reject("Unable to open contacts", e);
        }
    }

    @ActivityCallback
    public void contactPickerResult(PluginCall call, ActivityResult result) {
        JSObject ret = new JSObject();
        Intent data = result.getData();
        if (result.getResultCode() != android.app.Activity.RESULT_OK || data == null || data.getData() == null) {
            ret.put("selected", false);
            call.resolve(ret);
            return;
        }
        String[] projection = {
            android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER,
        };
        try (android.database.Cursor cursor = getContext().getContentResolver().query(
                data.getData(), projection, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameIdx = cursor.getColumnIndex(
                    android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
                int numberIdx = cursor.getColumnIndex(
                    android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER);
                String name = nameIdx >= 0 ? cursor.getString(nameIdx) : "";
                String number = numberIdx >= 0 ? cursor.getString(numberIdx) : "";
                if (number != null && !number.trim().isEmpty()) {
                    ret.put("selected", true);
                    ret.put("name", name == null ? "" : name);
                    ret.put("number", number.replaceAll("\\s+", ""));
                    call.resolve(ret);
                    return;
                }
            }
        } catch (Exception e) {
            call.reject("Unable to read the selected contact", e);
            return;
        }
        ret.put("selected", false);
        call.resolve(ret);
    }
}
