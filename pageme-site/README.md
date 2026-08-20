# PageMe website

This is a static website and can be served directly by GitHub Pages.

## Local preview

From this directory, run a static server and open the printed URL:

```powershell
python -m http.server 4173
```

## Google Play configuration

`site-config.js` controls Google Play beta availability, the active testing URL, testing status, and access level. The current link is an Internal Testing invitation and therefore works only for Google accounts included in the Play tester list.

When Google unlocks Open Testing, replace `downloadUrl`, set `publicTestingAvailable` to `true`, and update the access/status copy in `site-config.js`. No page markup change is required.

GitHub Pages publishes only the static website; installation and updates are handled by Google Play.

## Play beta signing

The Android App Bundle uses the dedicated PageMe signing key and Google Play App Signing. The local keystore and credentials remain excluded from source control and must be backed up securely. Configure the four `PAGEME_KEYSTORE_*` environment variables documented in `../pageme-mobile/docs/RELEASE_AND_PRIVACY_NOTES.md`, build the release bundle, and verify its signature before uploading it to Play Console. Do not use Android's shared debug key for a Play release.
