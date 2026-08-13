package com.pageme.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.hardware.camera2.CameraManager;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.FileInputStream;
import java.lang.reflect.Method;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

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
    public void selectedRearTorchTurnsOnAndOffOnPhysicalDevice() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        runShellCommand("pm grant com.pageme.app android.permission.CAMERA");
        CameraManager manager = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
        Method selector = NotificationReceiverPlugin.class.getDeclaredMethod(
            "findTorchCameraId", CameraManager.class);
        selector.setAccessible(true);
        String cameraId = (String) selector.invoke(null, manager);
        assertTrue(cameraId != null && !cameraId.isEmpty());

        CountDownLatch turnedOn = new CountDownLatch(1);
        CountDownLatch turnedOff = new CountDownLatch(1);
        AtomicBoolean observedOn = new AtomicBoolean(false);
        CameraManager.TorchCallback callback = new CameraManager.TorchCallback() {
            @Override
            public void onTorchModeChanged(String changedCameraId, boolean enabled) {
                if (!cameraId.equals(changedCameraId)) return;
                if (enabled) {
                    observedOn.set(true);
                    turnedOn.countDown();
                } else if (observedOn.get()) {
                    turnedOff.countDown();
                }
            }
        };

        manager.registerTorchCallback(callback, new Handler(Looper.getMainLooper()));
        try {
            manager.setTorchMode(cameraId, true);
            assertTrue("Rear torch did not turn on", turnedOn.await(3, TimeUnit.SECONDS));
            manager.setTorchMode(cameraId, false);
            assertTrue("Rear torch did not turn off", turnedOff.await(3, TimeUnit.SECONDS));
        } finally {
            try { manager.setTorchMode(cameraId, false); } catch (Exception ignored) {}
            manager.unregisterTorchCallback(callback);
        }
    }

    private void runShellCommand(String command) throws Exception {
        try (ParcelFileDescriptor descriptor = InstrumentationRegistry.getInstrumentation()
                .getUiAutomation().executeShellCommand(command);
             FileInputStream stream = new FileInputStream(descriptor.getFileDescriptor())) {
            byte[] buffer = new byte[256];
            while (stream.read(buffer) >= 0) { /* wait for shell completion */ }
        }
    }
}
