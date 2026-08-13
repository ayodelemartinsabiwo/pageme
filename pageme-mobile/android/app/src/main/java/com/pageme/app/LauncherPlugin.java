package com.pageme.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LauncherPlugin")
public class LauncherPlugin extends Plugin {
    private static final String LAUNCHER_SELECTION_STARTED_AT = "launcher_selection_started_at";
    private static final String LAUNCHER_USER_SELECTED = "launcher_user_selected";
    private static final long LAUNCHER_SELECTION_TIMEOUT_MS = 120_000L;
    static final String EXTRA_LAUNCHER_SELECTION_COMPLETED = "launcher_selection_completed";
    static final String EXTRA_LAUNCHER_IS_DEFAULT = "launcher_is_default";

    @PluginMethod
    public void checkLauncherDefault(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("isDefault", isPageMeDefaultHome(getContext()));
        ret.put("isSelected", hasHomeTakeoverConsent(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void requestLauncherDefault(PluginCall call) {
        android.util.Log.i("PageMeLauncher", "Home role requested from WebView");
        Context context = getContext();
        if (isPageMeDefaultHome(context)) {
            context.getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE).edit()
                .putBoolean(LAUNCHER_USER_SELECTED, true)
                .remove(LAUNCHER_SELECTION_STARTED_AT)
                .commit();
            JSObject current = new JSObject();
            current.put("isDefault", true);
            current.put("pending", false);
            call.resolve(current);
            return;
        }
        rememberAlternativeHome(context);
        context.getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE).edit()
            .putLong(LAUNCHER_SELECTION_STARTED_AT, System.currentTimeMillis())
            .commit();
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).beginExternalSystemFlow();
        }
        try {
            context.startService(new Intent(context, LauncherRoleRequestService.class));
            android.util.Log.i("PageMeLauncher", "Home role handoff service requested");
        } catch (Exception e) {
            android.util.Log.e("PageMeLauncher", "Unable to start the Home role handoff", e);
            enableLauncherAlias(context, true);
        }
        JSObject result = new JSObject();
        result.put("isDefault", false);
        result.put("pending", true);
        call.resolve(result);
    }

    static Intent createHomeRoleIntent(Context context) {
        // Samsung's request-role dialog can repeatedly dismiss and relaunch while a
        // launcher component changes. The full settings screen is static and works
        // consistently across Android versions.
        return new Intent(android.provider.Settings.ACTION_HOME_SETTINGS);
    }

    static boolean isPageMeDefaultHome(Context context) {
        Intent intent = new Intent(Intent.ACTION_MAIN);
        intent.addCategory(Intent.CATEGORY_HOME);
        ResolveInfo resolveInfo = context.getPackageManager()
            .resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY);
        return resolveInfo != null
            && resolveInfo.activityInfo != null
            && context.getPackageName().equals(resolveInfo.activityInfo.packageName);
    }

    @PluginMethod
    public void releaseLauncherDefault(PluginCall call) {
        rememberAlternativeHome(getContext());
        clearLauncherSelectionState(getContext());
        enableLauncherAlias(getContext(), false);
        JSObject ret = new JSObject();
        ret.put("isDefault", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void exitLauncher(PluginCall call) {
        leavePagerMode(getContext(), getActivity(), true);
        call.resolve();
    }

    public static void leavePagerMode(Context context, android.app.Activity activity, boolean launchHome) {
        PagerNotificationListenerService.clearLegacyPassthroughNotifications(context);
        EmergencyExitManager.cancelAndClear(context);
        context.getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE)
            .edit()
            .putBoolean("pager_mode_active", false)
            .putBoolean("notification_capture_enabled", false)
            .putBoolean("bypass_relaunch", true)
            .putBoolean("has_been_pinned", false)
            .apply();

        clearLauncherSelectionState(context);
        // Explicitly leaving PageMe must restore Android's launcher and gestures.
        // Scheduled focus can re-enable this alias when its alarm actually fires.
        enableLauncherAlias(context, false);

        Runnable finishExit = () -> {
            if (activity != null) {
                try { activity.stopLockTask(); } catch (Exception ignored) {}
                if (activity instanceof MainActivity) {
                    ((MainActivity) activity).setPagerUiActive(false);
                }
            }
            if (launchHome) launchSystemHome(context);
        };

        if (activity != null) {
            activity.runOnUiThread(finishExit);
        } else {
            finishExit.run();
        }
    }

    public static void launchSystemHome(Context context) {
        ComponentName alternative = resolveAlternativeHome(context);
        if (alternative != null) {
            Intent explicit = new Intent(Intent.ACTION_MAIN);
            explicit.addCategory(Intent.CATEGORY_HOME);
            explicit.setComponent(alternative);
            explicit.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            try {
                context.startActivity(explicit);
                return;
            } catch (Exception ignored) {}
        }
        Intent intent = new Intent(Intent.ACTION_MAIN);
        intent.addCategory(Intent.CATEGORY_HOME);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(intent);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public static boolean isHomeAliasIntent(Intent intent) {
        return intent != null && intent.getComponent() != null
            && intent.getComponent().getClassName().endsWith("LauncherAliasActivity");
    }

    static boolean isLauncherSelectionPending(Context context) {
        long startedAt = context.getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE)
            .getLong(LAUNCHER_SELECTION_STARTED_AT, 0L);
        return startedAt > 0L && System.currentTimeMillis() - startedAt < LAUNCHER_SELECTION_TIMEOUT_MS;
    }

    static boolean isLauncherUserSelected(Context context) {
        return context.getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE)
            .getBoolean(LAUNCHER_USER_SELECTED, false);
    }

    static boolean hasHomeTakeoverConsent(Context context) {
        return isPageMeDefaultHome(context) || isLauncherUserSelected(context);
    }

    static void markLauncherUserSelected(Context context) {
        context.getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE).edit()
            .putBoolean(LAUNCHER_USER_SELECTED, true)
            .remove(LAUNCHER_SELECTION_STARTED_AT)
            .commit();
    }

    static void clearLauncherSelectionPending(Context context) {
        context.getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE).edit()
            .remove(LAUNCHER_SELECTION_STARTED_AT)
            .apply();
    }

    static void clearLauncherSelectionState(Context context) {
        context.getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE).edit()
            .remove(LAUNCHER_SELECTION_STARTED_AT)
            .remove(LAUNCHER_USER_SELECTED)
            .apply();
    }

    private static void rememberAlternativeHome(Context context) {
        ComponentName alternative = resolveAlternativeHome(context);
        if (alternative != null) {
            context.getSharedPreferences(FocusScheduleManager.PREFS, Context.MODE_PRIVATE)
                .edit().putString("alternative_home_component", alternative.flattenToString()).apply();
        }
    }

    private static ComponentName resolveAlternativeHome(Context context) {
        String saved = context.getSharedPreferences(FocusScheduleManager.PREFS, Context.MODE_PRIVATE)
            .getString("alternative_home_component", "");
        if (!saved.isEmpty()) {
            ComponentName component = ComponentName.unflattenFromString(saved);
            if (component != null && !context.getPackageName().equals(component.getPackageName())) {
                try {
                    context.getPackageManager().getActivityInfo(component, 0);
                    return component;
                } catch (Exception ignored) {}
            }
        }

        Intent home = new Intent(Intent.ACTION_MAIN);
        home.addCategory(Intent.CATEGORY_HOME);
        java.util.List<ResolveInfo> candidates = context.getPackageManager().queryIntentActivities(home, 0);
        ComponentName first = null;
        for (ResolveInfo candidate : candidates) {
            if (candidate.activityInfo == null || context.getPackageName().equals(candidate.activityInfo.packageName)) continue;
            ComponentName component = new ComponentName(candidate.activityInfo.packageName, candidate.activityInfo.name);
            if (candidate.activityInfo.packageName.contains("sec.android.app.launcher")) return component;
            if (first == null) first = component;
        }
        return first;
    }

    public static void enableLauncherAlias(Context context, boolean enable) {
        try {
            ComponentName alias = new ComponentName(context, "com.pageme.app.LauncherAliasActivity");
            int state = enable ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED;
            context.getPackageManager().setComponentEnabledSetting(
                alias,
                state,
                PackageManager.DONT_KILL_APP
            );
            android.util.Log.i("PageMeLauncher", "Home alias enabled=" + enable);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
