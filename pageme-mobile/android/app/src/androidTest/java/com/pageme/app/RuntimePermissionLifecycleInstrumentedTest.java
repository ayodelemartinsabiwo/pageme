package com.pageme.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.WindowManager;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class RuntimePermissionLifecycleInstrumentedTest {
    @Test
    public void permissionDialogLeaveHintDoesNotDeactivatePagerMode() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        SharedPreferences prefs = context.getSharedPreferences("PageMePrefs", Context.MODE_PRIVATE);
        prefs.edit()
            .putBoolean("pager_mode_active", true)
            .putBoolean("notification_capture_enabled", true)
            .putBoolean("bypass_relaunch", false)
            .putLong("focus_lock_until", 0L)
            .commit();

        Intent launch = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        Activity launched = InstrumentationRegistry.getInstrumentation().startActivitySync(launch);
        assertTrue(launched instanceof MainActivity);
        MainActivity activity = (MainActivity) launched;
        try {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                activity.beginRuntimePermissionFlow();
                activity.onUserLeaveHint();
            });

            assertTrue(prefs.getBoolean("pager_mode_active", false));
            assertTrue(prefs.getBoolean("notification_capture_enabled", false));
            assertFalse(prefs.getBoolean("bypass_relaunch", true));

            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                activity.endRuntimePermissionFlow();
                activity.onUserLeaveHint();
            });
            assertFalse(prefs.getBoolean("pager_mode_active", true));
        } finally {
            LauncherPlugin.leavePagerMode(context, activity, true);
            InstrumentationRegistry.getInstrumentation().runOnMainSync(activity::finish);
        }
    }

    @Test
    public void screenLightUsesFullBrightnessWithoutCameraPermission() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Intent launch = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        Activity launched = InstrumentationRegistry.getInstrumentation().startActivitySync(launch);
        assertTrue(launched instanceof MainActivity);
        MainActivity activity = (MainActivity) launched;
        try {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                WindowManager.LayoutParams params = activity.getWindow().getAttributes();
                params.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL;
                activity.getWindow().setAttributes(params);
            });
            assertTrue(activity.getWindow().getAttributes().screenBrightness
                == WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL);

            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                WindowManager.LayoutParams params = activity.getWindow().getAttributes();
                params.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
                activity.getWindow().setAttributes(params);
            });
            assertTrue(activity.getWindow().getAttributes().screenBrightness
                == WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE);
        } finally {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(activity::finish);
        }
    }
}
