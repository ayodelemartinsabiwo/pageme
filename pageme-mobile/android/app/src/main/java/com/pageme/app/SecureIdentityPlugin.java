package com.pageme.app;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureIdentity")
public class SecureIdentityPlugin extends Plugin {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "PageMeSessionKey";
    private static final String PREFS = "PageMeSecureIdentity";
    private static final String TOKEN_CIPHERTEXT = "session_ciphertext";
    private static final String TOKEN_IV = "session_iv";

    @PluginMethod
    @SuppressLint("ApplySharedPref")
    public void setSessionToken(PluginCall call) {
        String token = call.getString("token", "").trim();
        if (token.isEmpty() || token.length() > 300) {
            call.reject("A valid session token is required.");
            return;
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            byte[] encrypted = cipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
            preferences().edit()
                .putString(TOKEN_CIPHERTEXT, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .putString(TOKEN_IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .commit();
            call.resolve();
        } catch (Exception error) {
            call.reject("Secure session storage is unavailable.");
        }
    }

    @PluginMethod
    public void getSessionToken(PluginCall call) {
        JSObject result = new JSObject();
        try {
            result.put("token", readSessionToken(getContext()));
            call.resolve(result);
        } catch (Exception error) {
            clearStoredToken(getContext());
            result.put("token", "");
            result.put("invalidated", true);
            call.resolve(result);
        }
    }

    @PluginMethod
    public void clearSessionToken(PluginCall call) {
        clearStoredToken(getContext());
        call.resolve();
    }

    static String readSessionToken(Context context) throws Exception {
        SharedPreferences prefs = preferences(context);
        String encryptedValue = prefs.getString(TOKEN_CIPHERTEXT, "");
        String ivValue = prefs.getString(TOKEN_IV, "");
        if (encryptedValue.isEmpty() || ivValue.isEmpty()) return "";
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(
            Cipher.DECRYPT_MODE,
            getOrCreateKey(),
            new GCMParameterSpec(128, Base64.decode(ivValue, Base64.NO_WRAP))
        );
        byte[] decrypted = cipher.doFinal(Base64.decode(encryptedValue, Base64.NO_WRAP));
        return new String(decrypted, StandardCharsets.UTF_8);
    }

    private static SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        java.security.Key existing = keyStore.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
        return generator.generateKey();
    }

    private SharedPreferences preferences() {
        return preferences(getContext());
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @SuppressLint("ApplySharedPref")
    private static void clearStoredToken(Context context) {
        preferences(context).edit().remove(TOKEN_CIPHERTEXT).remove(TOKEN_IV).commit();
    }
}
