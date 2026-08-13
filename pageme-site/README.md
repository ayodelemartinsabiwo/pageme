# PageMe download site

This is a static website and can be served directly by GitHub Pages.

## Local preview

From this directory, run a static server and open the printed URL:

```powershell
python -m http.server 4173
```

## Download configuration

`site-config.js` controls whether downloads are enabled as well as the APK URL, visible build number, size, and SHA-256 checksum. Downloads remain disabled until a release-signed APK is available.

For distribution, upload a release-signed APK named `PageMe-Android.apk` to a GitHub Release, set `downloadAvailable` to `true`, and change `downloadUrl` to:

```text
https://github.com/OWNER/REPOSITORY/releases/latest/download/PageMe-Android.apk
```

GitHub Pages should host the website. GitHub Releases should host long-term APK builds.

## Public beta signing

The local B24 APK is a device-test build and is excluded from source control. Before enabling downloads, create and securely back up a dedicated PageMe beta signing key, configure the four `PAGEME_KEYSTORE_*` environment variables documented in `../pageme-mobile/docs/RELEASE_AND_PRIVACY_NOTES.md`, build the release APK, and publish its checksum. Do not use Android's shared debug key for a public release.
