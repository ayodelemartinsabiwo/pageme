# PageMe

PageMe is a public source-available monorepo organized as two separate projects:

- `pageme-mobile/` contains the React, Capacitor, Android, Apps Script backend, tests, and mobile release documentation.
- `pageme-site/` contains the public landing page and Google Play beta access experience.

The GitHub Pages workflow at `.github/workflows/deploy-pages.yml` publishes only `pageme-site/`.

Website: https://ayodelemartinsabiwo.github.io/pageme/

The source is publicly visible but is not open source. See `LICENSE` for the all-rights-reserved terms.

## Mobile verification

```powershell
cd pageme-mobile
npm run verify
cd android
.\gradlew.bat lintDebug testDebugUnitTest assembleDebug
```

## Website preview

Serve `pageme-site/` with any static web server. The website does not share build dependencies with the mobile application.

## Android releases

Local APKs are excluded from Git. Public-facing beta distribution now routes through Google Play testing; GitHub release assets remain an archive for signed builds and are not copied into the Pages deployment. Release signing and privacy checks are documented in `pageme-mobile/docs/RELEASE_AND_PRIVACY_NOTES.md`.
