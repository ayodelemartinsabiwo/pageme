# PageMe download site

This is a static website and can be served directly by GitHub Pages.

## Local preview

From this directory, run a static server and open the printed URL:

```powershell
python -m http.server 4173
```

## Download configuration

`site-config.js` controls whether downloads are enabled as well as the APK URL, visible build number, size, and SHA-256 checksum. The current public download is the release-signed B24 beta from GitHub Releases.

For each new distribution, upload a release-signed APK named `PageMe-Android.apk` to a GitHub Release and update `downloadUrl` to the new release tag:

```text
https://github.com/OWNER/REPOSITORY/releases/download/TAG/PageMe-Android.apk
```

GitHub Pages should host the website. GitHub Releases should host long-term APK builds.

## Public beta signing

The public B24 APK uses the dedicated PageMe beta signing key. The keystore and credentials remain excluded from source control and must be backed up securely. Configure the four `PAGEME_KEYSTORE_*` environment variables documented in `../pageme-mobile/docs/RELEASE_AND_PRIVACY_NOTES.md`, build the release APK, verify its signature, and publish its checksum. Do not use Android's shared debug key for a public release.
