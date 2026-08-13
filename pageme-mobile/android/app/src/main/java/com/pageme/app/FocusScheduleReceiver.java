package com.pageme.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class FocusScheduleReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent != null && EmergencyExitManager.ACTION_RESTORE.equals(intent.getAction())) {
            EmergencyExitManager.handleRestoreAlarm(context);
            return;
        }
        if (intent != null && FocusScheduleManager.ACTION_TRIGGER.equals(intent.getAction())) {
            FocusScheduleManager.handleTrigger(context, intent);
        }
    }
}
