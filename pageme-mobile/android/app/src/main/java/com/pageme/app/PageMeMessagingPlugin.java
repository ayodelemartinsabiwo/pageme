package com.pageme.app;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

import java.util.Map;
import java.util.Locale;
import java.util.UUID;

import org.json.JSONArray;
import org.json.JSONException;

@CapacitorPlugin(name = "PageMeMessaging")
public class PageMeMessagingPlugin extends Plugin {
    private static final String PREFS = "PageMeMessaging";
    private static final String DEVICE_ID = "device_id";
    private static final String PUSH_TOKEN = "push_token";
    private static final String SYNC_PENDING = "sync_pending";
    static final String BACKGROUND_ENDPOINT = "background_endpoint";
    static final String BACKGROUND_UCN = "background_ucn";
    static final String BACKGROUND_CURSOR = "background_cursor";
    private static final String PENDING_MESSAGES = "pending_messages";
    private static final String BACKGROUND_AUTH_REQUIRED = "background_auth_required";
    private static volatile PageMeMessagingPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        super.handleOnDestroy();
    }

    @PluginMethod
    public void getPushRegistration(PluginCall call) {
        Context context = getContext();
        if (!ensureFirebaseConfigured(context)) {
            JSObject result = baseResult(context, false);
            result.put("token", "");
            call.resolve(result);
            return;
        }

        FirebaseMessaging.getInstance().getToken()
            .addOnSuccessListener(token -> {
                storeToken(context, token);
                JSObject result = baseResult(context, true);
                result.put("token", token == null ? "" : token);
                call.resolve(result);
            })
            .addOnFailureListener(error -> {
                JSObject result = baseResult(context, true);
                result.put("token", "");
                call.resolve(result);
            });
    }

    @PluginMethod
    public void consumePendingSync(PluginCall call) {
        SharedPreferences prefs = preferences(getContext());
        boolean pending = prefs.getBoolean(SYNC_PENDING, false);
        if (pending) prefs.edit().putBoolean(SYNC_PENDING, false).apply();
        JSObject result = new JSObject();
        result.put("pending", pending);
        call.resolve(result);
    }

    @PluginMethod
    public void configureBackgroundSync(PluginCall call) {
        String endpoint = safe(call.getString("endpoint", ""), 1000);
        String capCode = safe(call.getString("capCode", ""), 12).toUpperCase(Locale.ROOT);
        Long requestedCursor = call.getLong("cursor", 0L);
        if (!endpoint.startsWith("https://script.google.com/macros/s/")
            || !endpoint.contains("/exec") || !capCode.matches("[A-Z]{3}-\\d{1,4}")) {
            call.reject("A valid PageMe background-sync configuration is required.");
            return;
        }
        SharedPreferences prefs = preferences(getContext());
        long currentCursor = prefs.getLong(BACKGROUND_CURSOR, 0L);
        prefs.edit()
            .putString(BACKGROUND_ENDPOINT, endpoint)
            .putString(BACKGROUND_UCN, capCode)
            .putLong(BACKGROUND_CURSOR, Math.max(currentCursor, requestedCursor == null ? 0L : requestedCursor))
            .putBoolean(BACKGROUND_AUTH_REQUIRED, false)
            .apply();
        JSObject result = new JSObject();
        result.put("configured", true);
        result.put("cursor", prefs.getLong(BACKGROUND_CURSOR, 0L));
        call.resolve(result);
    }

    @PluginMethod
    public void updateSyncCursor(PluginCall call) {
        Long requested = call.getLong("cursor", 0L);
        SharedPreferences prefs = preferences(getContext());
        long cursor = Math.max(prefs.getLong(BACKGROUND_CURSOR, 0L), requested == null ? 0L : requested);
        prefs.edit().putLong(BACKGROUND_CURSOR, cursor).apply();
        JSObject result = new JSObject();
        result.put("cursor", cursor);
        call.resolve(result);
    }

    @PluginMethod
    public void consumePendingMessages(PluginCall call) {
        synchronized (PageMeMessagingPlugin.class) {
            SharedPreferences prefs = preferences(getContext());
            String raw = prefs.getString(PENDING_MESSAGES, "[]");
            JSObject result = new JSObject();
            try {
                result.put("messages", new JSArray(raw == null ? "[]" : raw));
            } catch (JSONException error) {
                result.put("messages", new JSArray());
            }
            result.put("cursor", prefs.getLong(BACKGROUND_CURSOR, 0L));
            result.put("authRequired", prefs.getBoolean(BACKGROUND_AUTH_REQUIRED, false));
            call.resolve(result);
        }
    }

    @PluginMethod
    public void acknowledgePendingMessages(PluginCall call) {
        Long requested = call.getLong("cursor", -1L);
        long acknowledgedCursor = requested == null ? -1L : requested;
        if (acknowledgedCursor < 0L) {
            call.reject("A valid acknowledged cursor is required.");
            return;
        }
        synchronized (PageMeMessagingPlugin.class) {
            SharedPreferences prefs = preferences(getContext());
            JSONArray pending;
            try {
                pending = new JSONArray(prefs.getString(PENDING_MESSAGES, "[]"));
            } catch (JSONException error) {
                pending = new JSONArray();
            }
            JSONArray retained = new JSONArray();
            for (int i = 0; i < pending.length(); i++) {
                org.json.JSONObject message = pending.optJSONObject(i);
                if (message == null || message.optLong("revision", Long.MAX_VALUE) > acknowledgedCursor) {
                    if (message != null) retained.put(message);
                }
            }
            prefs.edit()
                .putString(PENDING_MESSAGES, retained.toString())
                .putBoolean(SYNC_PENDING, retained.length() > 0)
                .apply();
            JSObject result = new JSObject();
            result.put("remaining", retained.length());
            call.resolve(result);
        }
    }

    @PluginMethod
    public void clearBackgroundSync(PluginCall call) {
        preferences(getContext()).edit()
            .remove(BACKGROUND_ENDPOINT)
            .remove(BACKGROUND_UCN)
            .remove(BACKGROUND_CURSOR)
            .remove(PENDING_MESSAGES)
            .remove(BACKGROUND_AUTH_REQUIRED)
            .remove(SYNC_PENDING)
            .apply();
        call.resolve();
    }

    static void recordMessagePush(Context context, Map<String, String> data) {
        if (!PageMePushPolicy.isMessageSyncPush(data)) return;
        preferences(context).edit().putBoolean(SYNC_PENDING, true).apply();
        PageMeMessageSyncWorker.enqueue(context);
        PageMeMessagingPlugin current = instance;
        if (current == null) return;
        JSObject payload = new JSObject();
        payload.put("messageId", safe(data.get("messageId"), 120));
        payload.put("fromUcn", safe(data.get("fromUcn"), 12));
        current.notifyListeners("messagePushReceived", payload, true);
    }

    static void recordDeletedMessages(Context context) {
        preferences(context).edit().putBoolean(SYNC_PENDING, true).apply();
        PageMeMessageSyncWorker.enqueue(context);
        PageMeMessagingPlugin current = instance;
        if (current != null) current.notifyListeners("messagePushReceived", new JSObject(), true);
    }

    static void recordToken(Context context, String token) {
        storeToken(context, token);
        PageMeMessagingPlugin current = instance;
        if (current == null) return;
        JSObject payload = new JSObject();
        payload.put("token", token == null ? "" : token);
        payload.put("deviceId", deviceId(context));
        current.notifyListeners("pushTokenChanged", payload, true);
    }

    private static boolean ensureFirebaseConfigured(Context context) {
        try {
            if (!FirebaseApp.getApps(context).isEmpty()) return true;
            return FirebaseApp.initializeApp(context) != null;
        } catch (RuntimeException error) {
            return false;
        }
    }

    private static JSObject baseResult(Context context, boolean configured) {
        JSObject result = new JSObject();
        result.put("configured", configured);
        result.put("deviceId", deviceId(context));
        result.put("pending", preferences(context).getBoolean(SYNC_PENDING, false));
        return result;
    }

    private static void storeToken(Context context, String token) {
        if (token == null || token.trim().isEmpty()) return;
        preferences(context).edit().putString(PUSH_TOKEN, token.trim()).apply();
    }

    @SuppressLint("ApplySharedPref")
    private static String deviceId(Context context) {
        SharedPreferences prefs = preferences(context);
        String existing = prefs.getString(DEVICE_ID, "");
        if (existing != null && !existing.isEmpty()) return existing;
        String created = UUID.randomUUID().toString();
        prefs.edit().putString(DEVICE_ID, created).commit();
        return created;
    }

    static long appendPendingMessages(Context context, JSONArray messages, long cursor) {
        synchronized (PageMeMessagingPlugin.class) {
            SharedPreferences prefs = preferences(context);
            long currentCursor = prefs.getLong(BACKGROUND_CURSOR, 0L);
            long acceptedCursor = currentCursor;
            JSONArray combined;
            try {
                combined = new JSONArray(prefs.getString(PENDING_MESSAGES, "[]"));
            } catch (JSONException error) {
                combined = new JSONArray();
            }
            java.util.HashSet<String> ids = new java.util.HashSet<>();
            for (int i = 0; i < combined.length(); i++) {
                String id = combined.optJSONObject(i) == null ? "" : combined.optJSONObject(i).optString("id", "");
                if (!id.isEmpty()) ids.add(id);
            }
            if (messages != null) {
                for (int i = 0; i < messages.length(); i++) {
                    org.json.JSONObject message = messages.optJSONObject(i);
                    if (message == null) continue;
                    String id = message.optString("id", "");
                    long revision = Math.max(0L, message.optLong("revision", 0L));
                    if (!id.isEmpty() && ids.contains(id)) {
                        acceptedCursor = Math.max(acceptedCursor, revision);
                        continue;
                    }
                    if (combined.length() >= 500) break;
                    if (!id.isEmpty() && ids.add(id)) {
                        combined.put(message);
                        acceptedCursor = Math.max(acceptedCursor, revision);
                    }
                }
            }
            if (messages == null || messages.length() == 0) acceptedCursor = Math.max(acceptedCursor, cursor);
            prefs.edit()
                .putString(PENDING_MESSAGES, combined.toString())
                .putLong(BACKGROUND_CURSOR, acceptedCursor)
                .putBoolean(SYNC_PENDING, combined.length() > 0)
                .putBoolean(BACKGROUND_AUTH_REQUIRED, false)
                .apply();
            return acceptedCursor;
        }
    }

    static void markBackgroundAuthRequired(Context context) {
        preferences(context).edit().putBoolean(BACKGROUND_AUTH_REQUIRED, true).apply();
    }

    static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String safe(String value, int maxLength) {
        if (value == null) return "";
        String trimmed = value.trim();
        return trimmed.length() <= maxLength ? trimmed : trimmed.substring(0, maxLength);
    }
}
