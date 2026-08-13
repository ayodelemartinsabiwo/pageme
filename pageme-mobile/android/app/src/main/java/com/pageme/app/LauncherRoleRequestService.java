package com.pageme.app;

import android.app.Service;
import android.content.Intent;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

/** Completes the Home-role handoff after Samsung removes PageMe's activity task. */
public class LauncherRoleRequestService extends Service {
    private static final long ROLE_SELECTION_TIMEOUT_MS = 120_000L;
    private static final long FAST_POLL_WINDOW_MS = 15_000L;
    private static final long FAST_ROLE_SELECTION_POLL_MS = 50L;
    private static final long SLOW_ROLE_SELECTION_POLL_MS = 250L;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long selectionStartedAt;
    private int activeStartId;

    private final Runnable roleSelectionMonitor = new Runnable() {
        @Override
        public void run() {
            if (LauncherPlugin.isPageMeDefaultHome(LauncherRoleRequestService.this)) {
                android.util.Log.i("PageMeLauncher", "PageMe selected as Home; returning to setup");
                LauncherPlugin.markLauncherUserSelected(LauncherRoleRequestService.this);
                // MainActivity owns this marker. Clearing it here can race the HOME
                // intent Android launches and make automation treat that valid
                // selection as an inactive launcher visit.
                Intent returnIntent = new Intent(LauncherRoleRequestService.this, MainActivity.class);
                returnIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_CLEAR_TOP
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP
                    | Intent.FLAG_ACTIVITY_NO_ANIMATION);
                returnIntent.putExtra(LauncherPlugin.EXTRA_LAUNCHER_SELECTION_COMPLETED, true);
                returnIntent.putExtra(LauncherPlugin.EXTRA_LAUNCHER_IS_DEFAULT, true);
                try {
                    startActivity(returnIntent);
                } catch (Exception error) {
                    android.util.Log.e("PageMeLauncher", "Unable to return to PageMe after Home selection", error);
                }
                stopSelf(activeStartId);
                return;
            }

            long elapsed = System.currentTimeMillis() - selectionStartedAt;
            if (!LauncherPlugin.isLauncherSelectionPending(LauncherRoleRequestService.this)) {
                android.util.Log.i("PageMeLauncher", "Home selection was cancelled");
                stopSelf(activeStartId);
                return;
            }
            if (elapsed >= ROLE_SELECTION_TIMEOUT_MS) {
                android.util.Log.i("PageMeLauncher", "Home selection monitor timed out");
                LauncherPlugin.clearLauncherSelectionPending(LauncherRoleRequestService.this);
                stopSelf(activeStartId);
                return;
            }
            handler.postDelayed(this, elapsed < FAST_POLL_WINDOW_MS
                ? FAST_ROLE_SELECTION_POLL_MS
                : SLOW_ROLE_SELECTION_POLL_MS);
        }
    };

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        android.util.Log.i("PageMeLauncher", "Home role handoff service started");
        activeStartId = startId;
        selectionStartedAt = System.currentTimeMillis();
        LauncherPlugin.enableLauncherAlias(this, true);
        handler.postDelayed(() -> {
            try {
                android.util.Log.i("PageMeLauncher", "Opening Android Home app settings");
                Intent roleIntent = LauncherPlugin.createHomeRoleIntent(this);
                roleIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_MULTIPLE_TASK);
                startActivity(roleIntent);
                handler.post(roleSelectionMonitor);
            } catch (Exception error) {
                android.util.Log.e("PageMeLauncher", "Unable to open the Home role picker", error);
                stopSelf(startId);
            }
        }, 350L);
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
