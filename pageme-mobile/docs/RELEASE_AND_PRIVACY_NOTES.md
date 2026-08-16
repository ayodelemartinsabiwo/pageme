# Release and Privacy Notes

## Local verification

Run the web checks before syncing Android:

```powershell
npm run test
npm run build
npx cap sync android
cd android
.\gradlew.bat lintDebug testDebugUnitTest assembleDebug bundleRelease
```

If the local npm wrapper cannot locate Node on Windows, invoke the bundled Node runtime directly and run Vite's CLI through `node_modules/vite/bin/vite.js`.

## Android release build

1. Deploy [backend/Code.gs](../backend/Code.gs) and verify its `doGet` response reports version 2.
2. Set `VITE_PAGEME_SCRIPT_URL` to that deployment's `/exec` URL and keep `VITE_PAGEME_REQUIRE_SERVER_SESSION=true`.
3. Verify `www/` was regenerated and run `npx cap sync android`.
4. Provide release signing through `PAGEME_KEYSTORE_PATH`, `PAGEME_KEYSTORE_PASSWORD`, `PAGEME_KEY_ALIAS`, and `PAGEME_KEY_PASSWORD` environment variables.
5. Run `android\gradlew.bat bundleRelease`. Confirm `android/app/build/outputs/bundle/release/app-release.aab` is signed before upload.
6. Keep `android/local.properties`, signing keys, credentials, and generated build outputs out of source control.

The local beta signing identity is stored under the ignored `signing-private/`
directory. Back up both the keystore and its credentials file to a secure,
access-controlled location. Every future update to the direct-download beta
must use the same key or Android will reject it as an upgrade.

The current beta build is version `1.3.13` (`versionCode 26`, build B26), supports Android 8.0 and later, and targets API 35. Google Play requires API 35 for mobile submissions at the time of this release work and raises the requirement to API 36 on August 31, 2026. Upgrade and retest before submitting on or after that date.

## Production preflight

- Register a new account and confirm the server returns a session token.
- Restore an existing UCN and confirm its token is rotated.
- Send a page and verify the server derives the sender name from its own user row.
- Confirm inbox pages survive an app restart and remain isolated by UCN.
- Exercise notification capture, direct reply, rear torch permission and shutoff, built-in LoRa startup, single-contact picking, study mode with and without a timer, and emergency exit on a physical API 33+ device.
- Complete Play Console declarations for notification listener, usage access, overlay, camera, Nearby devices, exact alarms, calendar, and special-use foreground service behavior.

## Sensitive permission posture

PageMe intentionally requests focus-launcher capabilities such as notification listener access, usage stats, overlay, DND policy access, calendar access, exact alarms, and home launcher selection. LoRa runs as an internal receiver and requests Nearby-device access on Android 12+ without location access. Emergency setup uses Android's one-contact picker rather than full address-book access. Camera permission is requested only when the user first presses the torch button and is used solely to control the rear flashlight. Play Store submission should describe the remaining permissions as core pager and focus-session capabilities, not analytics or advertising behavior.

Broad `QUERY_ALL_PACKAGES` access has been removed. Installed study apps are discovered through a launcher-intent visibility query.

The app disables Android Auto Backup because local profile, focus, emergency-contact, and study-app settings are personal state and should not be copied into cloud backups without an explicit product decision.
