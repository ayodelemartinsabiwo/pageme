# PageMe Apps Script backend

This directory is the production server contract expected by the mobile app. It replaces the older unauthenticated snippet retained in the Antigravity notes.

## Deploy

1. Open the Google Sheet that stores PageMe users and select **Extensions > Apps Script**.
2. Replace `Code.gs` with this directory's `Code.gs` and set `appsscript.json` from **Project Settings > Show appsscript.json**.
3. Deploy as a Web app, execute as the deploying account, and allow access to anyone. Copy the new `/exec` URL.
4. Set `VITE_PAGEME_SCRIPT_URL` to that URL before building. Never use the Apps Script editor's `/dev` URL in a user build.
5. Test new registration, restoration of an existing account, settings sync, and paging before promoting the Android bundle.

Existing rows are migrated lazily: the Token Hash header is added to column I, and an existing user receives a new session token after a successful UCN-and-email restore.

By default the first spreadsheet tab is used. To select another tab, add the Apps Script property `PAGEME_SHEET_NAME` with the exact tab name before deployment.

The app deliberately refuses registration or restoration when the server does not return a session token. This prevents locally invented or unauthenticated pager identities.
