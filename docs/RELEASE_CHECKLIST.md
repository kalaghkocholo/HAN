# Farnaz release checklist

Use this checklist before publishing changes that affect authentication, messaging, groups/channels, styling, or database access.

## Automated checks

- [ ] GitHub Actions JavaScript syntax workflow passes.
- [ ] New SQL migrations are committed under `supabase/migrations/` and match the connected project.
- [ ] Supabase security and performance advisors have been reviewed; the latest review still shows leaked-password protection disabled.
- [ ] No service-role or secret key is present in client files.

## Authentication and privacy

- [ ] Sign-up, sign-in, sign-out, and session restoration work.
- [ ] Account lookup returns only the minimum data needed to start a conversation.
- [ ] Users cannot enumerate or retrieve private profile fields beyond the intended product rules.
- [ ] RLS prevents cross-account reads and writes.
- [x] Static policy inspection: private chat attachments are in a non-public bucket with participant/member-scoped read policies; verify with two real accounts before release.
- [ ] Privileged database functions validate the current authenticated user and the requested resource.

## Messaging

- [ ] Sending, receiving, pagination, reply/edit/delete, and read receipts work.
- [ ] Multi-select actions state the deletion scope clearly.
- [x] Source-level recovery added for reconnect/mobile suspension; two-device duplicate and history checks still need runtime verification.
- [x] Live configuration check: private chat attachments have a 20 MiB Storage limit matching the frontend; disallowed MIME types and over-limit uploads still need runtime tests.
- [ ] Voice recordings can be discarded before sending and their temporary URLs are released when no longer needed.

## Groups and channels

- [ ] Owners, admins, and members can perform only their intended actions.
- [ ] Private invite codes work and do not expose private channel data.
- [ ] Channel posting permissions are enforced by the database, not only by hidden UI controls.
- [ ] Hiding a message for one user does not delete it for other members.

## UI and mobile

- [ ] Persian RTL and English LTR layouts work.
- [ ] Light/dark themes have readable text, composer, and message bubbles.
- [ ] iOS keyboard does not cover the composer.
- [ ] Dialogs can be closed and have accessible labels/status messages.
- [ ] No console errors on startup, navigation, sending, or reconnection.

## Implemented but not yet production-verified

- One-to-one WebRTC audio/video signaling and call UI (requires two-device tests and a TURN relay for reliable networks).
- PWA manifest and service worker shell caching.
- Notification permission UI and service-worker push event handler; true server push after app closure still requires VAPID keys, subscription storage, and a sender.

## Known not-yet-implemented capabilities

- Multi-party group calls
- Reliable push delivery while the app is closed (until server push is configured)

Do not mark these capabilities complete until their implementation and end-to-end tests exist.
