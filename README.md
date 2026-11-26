# Farnaz

Farnaz is a mobile-first, Persian/English private communication web app. The current implementation is a lightweight browser application built with HTML, CSS, JavaScript, and Supabase.

## Current capabilities

- Email/password authentication and user profiles
- Private one-to-one conversations
- Message attachments and voice-message recording
- Saved contacts and account lookup by email or normalized phone number
- Conversation preferences and message actions
- Groups and channels, including membership and management flows
- Read-receipt and per-user message visibility features
- Persian (RTL) and English (LTR) interface modes

**Implementation status:** The default one-to-one audio/video call path remains the existing WebRTC implementation. Its call interface now uses the iPhone-inspired Phone/FaceTime visual design independently of the media engine. The LiveKit one-to-one path remains an isolated pilot, disabled by default and available only for controlled testing with `?livekitPilot=1`; do not treat it as production-verified until two-device tests cover permissions, reject/end flows, and restrictive mobile networks. Group calls are not implemented. The PWA shell supports offline fallback and background refresh of cached assets. Push delivery after the app is closed still needs VAPID keys, subscription persistence, and a server-side sender. Offline caching does not make Supabase messaging available without a network.

## Repository layout

- `index.html` — application shell and page markup
- `styles.css` — shared application styling
- `spaces.css` — extracted styling for groups, channels, and their dialogs/composer
- `js/core.js` — Supabase setup, authentication, navigation, profiles, contacts, and shared state
- `js/local-store.js`, `js/private-chat-model.js`, `js/private-chat-hub.js` — account-scoped local storage, deterministic private-message ordering/outbox, and contact/shared-content views
- `js/chat-menu-v5.js` — private messaging, message actions, attachment/voice flows, and connection recovery
- `js/spaces.js` — groups/channels UI and related messaging flows
- `js/calls.js` — legacy call entry points and gated LiveKit pilot integration
- `js/livekit-calls.js`, `js/livekit-call-sessions.js`, `js/livekit-call-controller.js`, `js/livekit-call-ui.js` — isolated LiveKit adapter, session lifecycle, media controller, and call interface
- `service-worker.js`, `manifest.webmanifest`, `farnaz-icon.svg` — PWA shell, install metadata, and notification event handler
- `supabase/migrations/` — recent hardening and call-signaling migrations; this is **not yet a complete historical migration baseline**
- `scripts/validate.mjs` — dependency-free checks for local asset references, duplicate static IDs, CSS structure, and common server-key patterns
- `.github/workflows/validate.yml` — JavaScript syntax and app-shell validation on pushes and pull requests

The application currently uses classic browser scripts and shared global state. Avoid renaming global functions or moving code between files without checking all callers and page-navigation hooks.

## Deployment

The repository is designed to be served as a static site (for example, GitHub Pages).

1. Confirm the Supabase project URL and **publishable** key in `js/core.js`.
2. Never place a Supabase `service_role` key or any secret credential in browser code.
3. Confirm the SQL migrations in `supabase/migrations/` match the database state. The older schema history has not yet been reconstructed in this repository, so do not use this folder alone to bootstrap a fresh Supabase project.
4. Publish the repository using the configured static-site deployment.
5. Open the deployed site on both desktop and an iPhone-sized viewport and run the smoke-test checklist below.

Supabase publishable keys are expected to be public in browser applications. Security must be enforced through authentication, Row Level Security (RLS), storage policies, and carefully validated database functions—not by hiding a publishable key.

## Local validation

Use Node.js 20 or newer. For the complete local quality gate:

```sh
npm install
npm run check
```

`npm run check` runs application and call-infrastructure validation, the automated test suite, and the production build verifier. Syntax-only checks can also be run with `node --check` on the relevant JavaScript files. Automated checks do **not** replace two-device browser testing, Supabase permission checks, or iOS keyboard/audio-route testing.

## Release smoke-test checklist

Run these checks after UI, database, authentication, or message-flow changes:

1. Sign up with a new test account, sign out, and sign back in.
2. Save a contact, reload the app, and confirm it remains saved.
3. Find a test account by email and by phone (with and without a country-code prefix).
4. Send, receive, reply to, edit, and delete test messages using the available actions.
5. Confirm message selection and the delete-scope choice behave as expected.
6. Send a permitted attachment and a voice message; verify access from the intended account only.
7. Open a group and a channel; test membership, role permissions, message delivery, and message hiding.
8. Confirm users cannot read or modify another user's private messages, contacts, or profile fields.
9. Switch Persian/English and light/dark themes; check layout direction, composer placement, and the iOS keyboard.
10. Disconnect and reconnect the network; confirm the app recovers without duplicate messages.
11. Check browser console and network requests for errors.
12. With two separate test accounts on different devices, test incoming/outgoing audio and video calls, reject, hang up, permissions denied, and network loss. Calls may fail on restrictive networks until a TURN relay is configured.
13. Install the PWA, enable notification permission, and verify notification clicks open Farnaz. Do not consider push after app closure verified until the server push sender is configured and tested.

Use dedicated test accounts and non-sensitive test content. Do not test privacy boundaries with real users' private data.

## Security and operational notes

- RLS and storage policies are part of the application boundary; review them whenever a query or table changes.
- Functions declared `SECURITY DEFINER` require particular care. Confirm their execute grants, fixed `search_path`, authentication checks, and row-level authorization before changing their privileges.
- Keep the checked-in migration history aligned with the connected database. The historical migration set still needs to be reconstructed before a fresh environment can be reliably provisioned from source control.
- Review Supabase security and performance advisors after database changes. Advisor warnings need context: a function required by an authenticated RPC flow is not automatically unsafe, and an unused index may simply not have been exercised yet.
- Enable leaked-password protection in Supabase Auth settings before inviting real users.


## Production build and caching

The source tree remains directly servable (including GitHub Pages). Vercel builds and serves the minified `dist/` output:

- `npm run build` minifies first-party JavaScript and CSS file-by-file; it does not bundle classic scripts because the app relies on shared global names and inline handlers.
- `scripts/verify-dist.mjs` checks that output files parse, required global names and inline handlers survive minification, and development-only files are excluded.
- When a local asset changes, update its version query in both `index.html` and `service-worker.js`, then increment the service-worker cache name. The static validator checks that shell URLs and versions stay synchronized.
- The service worker uses a network-first strategy for navigation with a short timeout and cached-page fallback; versioned code assets use stale-while-revalidate so the cached copy can load immediately while a fresh copy updates in the background.
