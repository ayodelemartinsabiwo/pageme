package com.pageme.app;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public class PageMeMessageSyncWorker extends Worker {
    private static final String UNIQUE_WORK = "pageme-message-sync";

    public PageMeMessageSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    static void enqueue(Context context) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(PageMeMessageSyncWorker.class)
            .setConstraints(constraints)
            .build();
        WorkManager.getInstance(context.getApplicationContext())
            .enqueueUniqueWork(UNIQUE_WORK, ExistingWorkPolicy.APPEND_OR_REPLACE, request);
    }

    @NonNull
    @Override
    public Result doWork() {
        PageMeBackgroundSync.SyncResult result = PageMeBackgroundSync.sync(getApplicationContext());
        if (result == PageMeBackgroundSync.SyncResult.RETRY) return Result.retry();
        return result == PageMeBackgroundSync.SyncResult.FAILURE ? Result.failure() : Result.success();
    }
}
