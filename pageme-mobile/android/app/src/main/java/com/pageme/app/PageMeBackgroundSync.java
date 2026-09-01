package com.pageme.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class PageMeBackgroundSync {
    enum SyncResult { SUCCESS, RETRY, FAILURE }

    private PageMeBackgroundSync() {}

    static SyncResult sync(Context context) {
        SharedPreferences prefs = PageMeMessagingPlugin.preferences(context);
        String endpoint = prefs.getString(PageMeMessagingPlugin.BACKGROUND_ENDPOINT, "");
        String capCode = prefs.getString(PageMeMessagingPlugin.BACKGROUND_UCN, "");
        if (endpoint == null || capCode == null || endpoint.isEmpty() || capCode.isEmpty()) {
            return SyncResult.SUCCESS;
        }

        final String sessionToken;
        try {
            sessionToken = SecureIdentityPlugin.readSessionToken(context);
        } catch (Exception error) {
            PageMeMessagingPlugin.markBackgroundAuthRequired(context);
            return SyncResult.FAILURE;
        }
        if (sessionToken == null || sessionToken.isEmpty()) {
            PageMeMessagingPlugin.markBackgroundAuthRequired(context);
            return SyncResult.FAILURE;
        }

        long cursor = Math.max(0L, prefs.getLong(PageMeMessagingPlugin.BACKGROUND_CURSOR, 0L));
        try {
            for (int page = 0; page < 5; page++) {
                JSONObject request = new JSONObject()
                    .put("action", "syncMessages")
                    .put("capCode", capCode)
                    .put("sessionToken", sessionToken)
                    .put("afterRevision", cursor)
                    .put("limit", 100);
                HttpResult http = postJson(endpoint, request.toString());
                if (http.statusCode == 429 || http.statusCode >= 500) return SyncResult.RETRY;
                if (http.statusCode < 200 || http.statusCode >= 300) return SyncResult.FAILURE;

                JSONObject response = new JSONObject(http.body);
                if (!"success".equals(response.optString("status"))) {
                    if ("AUTH_REQUIRED".equals(response.optString("code"))) {
                        PageMeMessagingPlugin.markBackgroundAuthRequired(context);
                        return SyncResult.FAILURE;
                    }
                    return "RATE_LIMIT".equals(response.optString("code")) ? SyncResult.RETRY : SyncResult.FAILURE;
                }

                JSONArray messages = response.optJSONArray("messages");
                long nextCursor = Math.max(cursor, response.optLong("cursor", cursor));
                long acceptedCursor = PageMeMessagingPlugin.appendPendingMessages(context, messages, nextCursor);
                if (acceptedCursor < nextCursor) return SyncResult.SUCCESS;
                if (!response.optBoolean("hasMore", false) || acceptedCursor <= cursor) return SyncResult.SUCCESS;
                cursor = acceptedCursor;
            }
            return SyncResult.RETRY;
        } catch (java.net.SocketTimeoutException error) {
            return SyncResult.RETRY;
        } catch (java.io.IOException error) {
            return SyncResult.RETRY;
        } catch (Exception error) {
            return SyncResult.FAILURE;
        }
    }

    private static HttpResult postJson(String endpoint, String body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(15000);
        connection.setRequestMethod("POST");
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        connection.setRequestProperty("Accept", "application/json");
        connection.setDoOutput(true);
        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
        connection.setFixedLengthStreamingMode(payload.length);
        try (OutputStream output = connection.getOutputStream()) {
            output.write(payload);
        }

        int status = connection.getResponseCode();
        if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
            String location = connection.getHeaderField("Location");
            connection.disconnect();
            if (location == null || !location.startsWith("https://")) return new HttpResult(status, "");
            HttpURLConnection redirected = (HttpURLConnection) new URL(location).openConnection();
            redirected.setConnectTimeout(12000);
            redirected.setReadTimeout(15000);
            redirected.setRequestProperty("Accept", "application/json");
            int redirectedStatus = redirected.getResponseCode();
            String redirectedBody = readBody(redirected, redirectedStatus);
            redirected.disconnect();
            return new HttpResult(redirectedStatus, redirectedBody);
        }
        String responseBody = readBody(connection, status);
        connection.disconnect();
        return new HttpResult(status, responseBody);
    }

    private static String readBody(HttpURLConnection connection, int statusCode) throws Exception {
        InputStream stream = statusCode >= 200 && statusCode < 400
            ? connection.getInputStream()
            : connection.getErrorStream();
        if (stream == null) return "";
        StringBuilder body = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) body.append(line);
        }
        return body.toString();
    }

    private static final class HttpResult {
        final int statusCode;
        final String body;

        HttpResult(int statusCode, String body) {
            this.statusCode = statusCode;
            this.body = body == null ? "" : body;
        }
    }
}
