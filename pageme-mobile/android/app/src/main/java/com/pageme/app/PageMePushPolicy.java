package com.pageme.app;

import java.util.Map;

final class PageMePushPolicy {
    private PageMePushPolicy() {}

    static boolean isMessageSyncPush(Map<String, String> data) {
        return data != null && "pageme_message".equals(data.get("type"));
    }
}
