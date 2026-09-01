# PageMe Apps Script backend

This directory is the production server contract expected by the mobile app. Version 4 adds private, expiring pager-status links and content-free product measurement to the authenticated, persistent PageMe-to-PageMe messaging service introduced in version 3.

## Deploy

1. Either open the Google Sheet that stores PageMe users and select **Extensions > Apps Script**, or create a standalone Apps Script project and set `PAGEME_SPREADSHEET_ID` to the private data spreadsheet ID.
2. Replace `Code.gs` with this directory's `Code.gs` and set `appsscript.json` from **Project Settings > Show appsscript.json**.
3. Deploy as a Web app, execute as the deploying account, and allow access to anyone. Copy the new `/exec` URL.
4. Set `VITE_PAGEME_SCRIPT_URL` to that URL before building. Never use the Apps Script editor's `/dev` URL in a user build.
5. Test new registration, restoration of an existing account, settings sync, paging, offline delivery, read status, blocking, and inbox clearing before promoting the Android bundle.

Deploy version 3 before releasing a mobile build that uses it. The current client begins registration with `requestRegistration` and restoration with `requestRestore`; a version 2 backend does not understand those actions. During a controlled overlap with older beta builds, set `PAGEME_ALLOW_LEGACY_AUTH=true` only long enough for those builds to migrate. Remove the property, or set it to `false`, once the supported clients use email verification.

Registration and restoration require a six-digit code sent to the account email. Codes expire after 10 minutes, are invalidated when a replacement is requested, and are locked after five incorrect attempts. The server stores only a peppered hash of each code. `PAGEME_CHALLENGE_PEPPER` is generated automatically in Script Properties and must never be copied into the app or repository.

Existing rows are migrated lazily. A valid legacy token is moved out of the user row into the `PageMe Sessions` tab on first use. New registration and restoration requests create separate, expiring sessions, so restoring an account on a second phone no longer signs the first phone out.

Optional session properties:

- `PAGEME_SESSION_LIFETIME_DAYS` (30-365, default 180)
- `PAGEME_MAX_SESSIONS_PER_ACCOUNT` (2-12, default 8)

Status-sharing properties:

- `PAGEME_STATUS_LINKS_ENABLED` (`true` by default; set to `false` as an emergency kill switch without disabling Pager Mode)
- `PAGEME_STATUS_LINK_BASE_URL` (defaults to `https://ayodelemartinsabiwo.github.io/pageme/page.html?s=`)

By default the first spreadsheet tab is used. To select another tab, add the Apps Script property `PAGEME_SHEET_NAME` with the exact tab name before deployment. A container-bound script can omit `PAGEME_SPREADSHEET_ID`; a standalone project must set it. The manifest uses the `spreadsheets` scope because a standalone deployment must open that explicitly configured file by ID.

The app deliberately refuses registration or restoration when the server does not return a session token. This prevents locally invented or unauthenticated pager identities.

## Message storage

The backend creates these private spreadsheet tabs when first used:

- `PageMe Messages`: durable message bodies, sender and recipient UCNs, unique client/server IDs, reply links, delivery/read timestamps, per-user deletion tombstones, and monotonic revisions.
- `PageMe Sessions`: bounded, expiring per-device authentication sessions stored as token hashes.
- `PageMe Challenges`: short-lived, hashed email-verification challenges for registration and restoration.
- `PageMe Devices`: active Android push tokens. Tokens are never returned to clients or written to logs.
- `PageMe Blocks`: sender blocks used before accepting a new page.
- `PageMe Reports`: the minimum moderation audit record needed for reports.
- `PageMe Status Links`: hashed, expiring status tokens and anonymous aggregate open counts. Raw tokens are never stored.
- `PageMe Product Events`: a content-free beta funnel keyed by the hidden immutable user ID and retained for up to 90 days.

Clients call `syncMessages` with their last revision. Receiving a message marks it delivered; opening it calls `markRead`. Repeating `sendMessage` with the same sender and client message ID returns the original message rather than creating a duplicate.

The default retention window is 90 days. Set `PAGEME_MESSAGE_RETENTION_DAYS` to a value from 7 to 365 to change what the server returns. Inbox clearing uses per-participant tombstones, so one user cannot delete the other participant's copy.

## Push configuration

Polling on app start, foreground return, and a short visible-app interval is the reliable fallback. A data-only FCM wake schedules a network-constrained Android WorkManager job, which securely retrieves and privately queues message records even when the WebView process is not active. For near-instant Android delivery, enable the Firebase Cloud Messaging API for the PageMe Firebase project and set this Apps Script property:

- `PAGEME_FCM_PROJECT_ID`

The default `script` authentication mode uses the deploying Apps Script account's short-lived OAuth token and the `firebase.messaging` scope declared in `appsscript.json`. This avoids creating or storing a long-lived service-account key. The deploying account must have permission to send messages in the Firebase project.

`PAGEME_FCM_AUTH_MODE=service_account` remains available only for deployments that cannot use script OAuth. In that mode, `PAGEME_FCM_CLIENT_EMAIL` and `PAGEME_FCM_PRIVATE_KEY` are also required. Store a private key only in Apps Script properties, never in this repository or the Android application.

Push payloads contain only the message ID and sender UCN; the authenticated app retrieves the message body from this backend.

## Email relay migration

Direct PageMe storage is always authoritative. `PAGEME_EMAIL_RELAY_MODE` defaults to `off` so UCN pages do not reappear through Gmail notification capture.

- `off`: no page email is sent.
- `fallback`: send a content-free migration notice only when no push request was accepted.
- `always`: send a content-free notice for every page during a temporary staged rollout.

Do not include page contents in migration emails. Return the property to `off` after all supported clients use direct sync.

## Security controls

- All message, device, block, report, settings, and account-deletion actions require the UCN session token.
- New accounts and restored sessions are issued only after the submitted email address is verified.
- Session tokens are stored server-side only as SHA-256 hashes, compared without early exit, bounded per account, and expired automatically.
- Message bodies are excluded from push payloads, migration email, and server logging.
- Send, sync, registration, and restoration routes are rate limited.
- Account deletion requires an exact UCN confirmation and removes the user's profile, messages, devices, blocks, reports, status links, and product events. A non-addressable UCN tombstone remains so an old identity can never be reassigned.
- Existing user rows receive an append-only hidden `User ID`; visible UCNs and message addressing are unchanged.
