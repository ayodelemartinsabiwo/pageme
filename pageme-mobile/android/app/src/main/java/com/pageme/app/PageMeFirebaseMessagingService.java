package com.pageme.app;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class PageMeFirebaseMessagingService extends FirebaseMessagingService {
    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        if (remoteMessage == null) return;
        PageMeMessagingPlugin.recordMessagePush(getApplicationContext(), remoteMessage.getData());
    }

    @Override
    public void onNewToken(String token) {
        PageMeMessagingPlugin.recordToken(getApplicationContext(), token);
    }

    @Override
    public void onDeletedMessages() {
        PageMeMessagingPlugin.recordDeletedMessages(getApplicationContext());
    }
}
