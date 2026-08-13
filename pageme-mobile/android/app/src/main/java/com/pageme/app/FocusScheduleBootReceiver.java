package com.pageme.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class FocusScheduleBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        FocusScheduleManager.scheduleAll(context);
        EmergencyExitManager.rescheduleIfPending(context);
    }
}
