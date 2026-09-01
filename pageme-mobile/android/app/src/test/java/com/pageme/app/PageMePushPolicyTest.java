package com.pageme.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.HashMap;
import java.util.Map;

import org.junit.Test;

public class PageMePushPolicyTest {
    @Test
    public void acceptsOnlyPageMeMessageSyncPayloads() {
        Map<String, String> message = new HashMap<>();
        message.put("type", "pageme_message");
        assertTrue(PageMePushPolicy.isMessageSyncPush(message));

        message.put("type", "marketing");
        assertFalse(PageMePushPolicy.isMessageSyncPush(message));
        assertFalse(PageMePushPolicy.isMessageSyncPush(null));
    }
}
