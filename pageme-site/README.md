# PageMe website

This is a static website and can be served directly by GitHub Pages.

The visual user guide is published at `guide.html`. Its chapters and stable deep links are defined in `guide-data.js`; screenshots live in `assets/guide/`.

## Local preview

From this directory, run a static server and open the printed URL:

```powershell
python -m http.server 4173
```

## Google Play configuration

`site-config.js` controls Google Play beta availability, the active testing URL, testing status, and access level. The current link is the Closed Testing opt-in page and therefore works only for Google accounts included in the closed tester list.

When Google unlocks Open Testing or Production, set `downloadUrl` to the prepared `publicDownloadUrl`, set `publicTestingAvailable` to `true`, and replace the access/status copy with public-beta wording. Before deploying that cutover, verify the Play listing and installation with a Google account that has never appeared on a PageMe tester list. No page markup change is required.

GitHub Pages publishes only the static website; installation and updates are handled by Google Play.

## Product Hunt launch gate

The launch kit lives in `product-hunt/`. Do not submit or schedule the Product Hunt post until public Google Play installation and live two-account UCN messaging have both passed. Product Hunt outreach must ask for visits, testing, and honest feedback rather than upvotes.

## Play beta signing

The Android App Bundle uses the dedicated PageMe signing key and Google Play App Signing. The local keystore and credentials remain excluded from source control and must be backed up securely. Configure the four `PAGEME_KEYSTORE_*` environment variables documented in `../pageme-mobile/docs/RELEASE_AND_PRIVACY_NOTES.md`, build the release bundle, and verify its signature before uploading it to Play Console. Do not use Android's shared debug key for a Play release.
