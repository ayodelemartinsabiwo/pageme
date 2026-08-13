package com.pageme.app;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

@CapacitorPlugin(
    name = "FocusSchedulePlugin",
    permissions = {
        @Permission(alias = "calendar", strings = { Manifest.permission.READ_CALENDAR })
    }
)
public class FocusSchedulePlugin extends Plugin {
    @PluginMethod
    public void getConfig(PluginCall call) {
        JSObject result = new JSObject();
        result.put("config", FocusScheduleManager.getConfig(getContext()).toString());
        result.put("nextTriggerAt", FocusScheduleManager.nextTriggerAt(getContext()));
        result.put("calendarPermission", FocusScheduleManager.hasCalendarPermission(getContext()));
        result.put("exactAlarmAllowed", FocusScheduleManager.canScheduleExactAlarms(getContext()));
        result.put("autoLaunchAllowed", FocusScheduleManager.canAutoLaunch(getContext()));
        result.put("reminderNotificationsAllowed", FocusScheduleManager.canPostReminders(getContext()));
        result.put("homeTakeoverAllowed", LauncherPlugin.hasHomeTakeoverConsent(getContext()));
        android.content.SharedPreferences prefs = getContext().getSharedPreferences(FocusScheduleManager.PREFS, android.content.Context.MODE_PRIVATE);
        result.put("focusLockUntil", prefs.getLong("focus_lock_until", 0L));
        result.put("pagerModeActive", prefs.getBoolean("pager_mode_active", false));
        call.resolve(result);
    }

    @PluginMethod
    public void saveConfig(PluginCall call) {
        try {
            String raw = call.getString("config", "{}");
            JSONObject requested = new JSONObject(raw);
            JSONObject saved = FocusScheduleManager.saveConfig(getContext(), requested);
            JSObject result = new JSObject();
            result.put("config", saved.toString());
            result.put("nextTriggerAt", FocusScheduleManager.nextTriggerAt(getContext()));
            result.put("calendarPermission", FocusScheduleManager.hasCalendarPermission(getContext()));
            result.put("exactAlarmAllowed", FocusScheduleManager.canScheduleExactAlarms(getContext()));
            result.put("autoLaunchAllowed", FocusScheduleManager.canAutoLaunch(getContext()));
            result.put("reminderNotificationsAllowed", FocusScheduleManager.canPostReminders(getContext()));
            result.put("homeTakeoverAllowed", LauncherPlugin.hasHomeTakeoverConsent(getContext()));
            call.resolve(result);
        } catch (Exception error) {
            String message = error.getMessage();
            call.reject(message == null || message.trim().isEmpty() ? "Invalid focus schedule" : message, error);
        }
    }

    @PluginMethod
    public void cancelScheduledActivation(PluginCall call) {
        JSONObject saved = FocusScheduleManager.cancelScheduledActivation(getContext());
        JSObject result = new JSObject();
        result.put("config", saved.toString());
        result.put("nextTriggerAt", FocusScheduleManager.nextTriggerAt(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void checkCalendarPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", FocusScheduleManager.hasCalendarPermission(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void requestCalendarPermission(PluginCall call) {
        if (getPermissionState("calendar") == PermissionState.GRANTED) {
            FocusScheduleManager.syncCalendar(getContext());
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).beginRuntimePermissionFlow();
        }
        requestPermissionForAlias("calendar", call, "calendarPermissionCallback");
    }

    @PermissionCallback
    private void calendarPermissionCallback(PluginCall call) {
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).endRuntimePermissionFlow();
        }
        boolean granted = getPermissionState("calendar") == PermissionState.GRANTED;
        if (granted) FocusScheduleManager.syncCalendar(getContext());
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    @PluginMethod
    public void syncCalendar(PluginCall call) {
        if (!FocusScheduleManager.hasCalendarPermission(getContext())) {
            call.reject("Calendar permission is required");
            return;
        }
        FocusScheduleManager.CalendarSyncResult sync = FocusScheduleManager.syncCalendarDetailed(getContext());
        JSONObject config = FocusScheduleManager.getConfig(getContext());
        JSObject result = new JSObject();
        result.put("count", sync.scheduled);
        result.put("scanned", sync.scanned);
        result.put("matched", sync.matched);
        result.put("keywords", config.optString("calendarKeyword", "focus,study"));
        result.put("nextTriggerAt", FocusScheduleManager.nextTriggerAt(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void requestExactAlarmAccess(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !FocusScheduleManager.canScheduleExactAlarms(getContext())) {
            try {
                if (getActivity() instanceof MainActivity) {
                    ((MainActivity) getActivity()).beginExternalSystemFlow();
                }
                Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                    Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            } catch (Exception ignored) {}
        }
        call.resolve();
    }

    @PluginMethod
    public void requestAutoLaunchAccess(PluginCall call) {
        if (FocusScheduleManager.canAutoLaunch(getContext())) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        try {
            if (getActivity() instanceof MainActivity) {
                ((MainActivity) getActivity()).beginExternalSystemFlow();
            }
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception error) {
            call.reject("Unable to open automatic launch access", error);
            return;
        }
        JSObject result = new JSObject();
        result.put("granted", false);
        call.resolve(result);
    }
}
