# Product Hunt launch readiness

The Product Hunt post must remain a local draft until every launch gate is checked.

## Public access

- [ ] Google Play Open Testing or Production is available.
- [ ] An account absent from every PageMe tester list can open the listing and install PageMe.
- [ ] `site-config.js` uses `publicDownloadUrl`, sets `publicTestingAvailable` to `true`, and contains no invitation-only wording.
- [ ] The landing page, Guide, Privacy Policy, and Google Play listing agree about availability and features.

## Live UCN acceptance

- [x] Two separately registered accounts can exchange UCN pages in both directions. Verified live on 2026-08-30 between the SM-A566B and `PageMe_API_36`, with delivery/read timestamps and a reply recorded.
- [ ] Foreground, background, offline/reconnect, and app-restart delivery pass.
- [ ] Every page appears exactly once in the correct UCN conversation.
- [ ] Replies and sent, delivered, and read states synchronize correctly.
- [ ] Clearing, blocking, reporting, and account deletion behave as documented.
- [ ] Neither participant can see the other's registered email address or phone number.

## Release quality

- [ ] Web and backend tests pass.
- [ ] Android unit tests and lint pass.
- [ ] The signed public bundle is active on Google Play.
- [ ] Registration, verification email, Pager Mode, Home restoration, schedules, calendar behavior, alarms, emergency exit, and torch pass on a physical device.
- [ ] Launch media contains only fictional identities and no device-owner information.

## Product Hunt

- [ ] Maker profile bio is complete.
- [ ] Listing copy and launch tags match `listing.md`.
- [ ] Thumbnail and all four gallery images meet Product Hunt dimensions and file-size limits.
- [ ] The full YouTube demo URL is public or unlisted, not private.
- [ ] The post is scheduled for Saturday at 12:01 a.m. Pacific Time.
- [ ] Outreach asks for visits, testing, and comments, never upvotes.
