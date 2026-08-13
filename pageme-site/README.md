# PageMe download site

This is a static website and can be served directly by GitHub Pages.

## Local preview

From this directory, run a static server and open the printed URL:

```powershell
python -m http.server 4173
```

## Download configuration

`site-config.js` controls whether downloads are enabled as well as the APK URL, visible build number, size, and SHA-256 checksum. The current public download is a same-origin GitHub Pages mirror of the release-signed B24 beta.

For each new distribution, upload a release-signed APK named `PageMe-Android.apk` to a GitHub Release. Then update the tag and expected checksum in `.github/workflows/deploy-pages.yml`. The workflow downloads the release asset, rejects it if its checksum differs, and includes the verified APK in the Pages artifact without committing the binary to Git.

Keep the website URL same-origin:

```text
downloads/PageMe-Android.apk
```

GitHub Releases remains the source of truth and archive for signed builds. GitHub Pages serves the current verified beta directly to Android browsers.

## Public beta signing

The public B24 APK uses the dedicated PageMe beta signing key. The keystore and credentials remain excluded from source control and must be backed up securely. Configure the four `PAGEME_KEYSTORE_*` environment variables documented in `../pageme-mobile/docs/RELEASE_AND_PRIVACY_NOTES.md`, build the release APK, verify its signature, and publish its checksum. Do not use Android's shared debug key for a public release.
