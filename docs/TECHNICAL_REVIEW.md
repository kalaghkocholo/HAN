# Technical review — 2026-10-23

This is a source-level review and a record of the hardening changes applied during this pass. It is not a substitute for end-to-end browser testing.

## Changes applied

1. Removed the stray `s += "";` statement after the closing IIFE in `js/spaces.js`. No matching global `s` was defined in the inspected frontend files.
2. Bumped the `spaces.js` cache query in `index.html` from `20261023-67` to `20261023-68`.
3. Updated `public.find_farnaz_user_by_phone(text)` so its result keeps the existing return shape but always returns `NULL` for the `phone` field. The frontend uses the result's user ID to start a conversation and does not need the matched user's raw phone number.
4. Added indexes for the four foreign-key columns identified by Supabase's performance advisor:
   - `message_read_receipts.reader_id`
   - `message_read_receipts.receiver_id`
   - `space_message_hidden.message_id`
   - `space_message_reads.user_id`
5. Added repository documentation, a release smoke-test checklist, and a GitHub Actions workflow that runs `node --check` on the three browser scripts.

## Database verification

The connected database was queried after the migrations:

- The phone-search function still has its original table return signature, and the function definition now masks the phone field.
- All four new indexes are present.
- The advisor no longer reports the four previously unindexed foreign keys.

The new indexes may appear as unused until representative production queries exercise them. Do not remove them based on a fresh/low-traffic usage counter alone.

## Findings to address next

### High priority — authentication configuration

Supabase reports that leaked-password protection is disabled. Enable it in the project's Auth password/security settings before inviting real users. This setting is managed in Supabase Auth configuration and was not changed by the SQL migrations in this pass.

### High priority — validate account lookup privacy and abuse resistance

The user-search RPCs are callable by authenticated users and intentionally use `SECURITY DEFINER` to read profile data across RLS boundaries. Current database inspection shows these RPCs have a fixed `search_path`, explicit authenticated-user checks, and execute grants for `authenticated` rather than `PUBLIC`. That is useful defense in depth, but it does not replace review of returned fields, row authorization, and abuse/rate-limiting protections. The phone-search response was reduced to the minimum required fields in this pass. Further rate limiting should be designed without breaking legitimate contact discovery.

### Medium priority — complete migration history

The connected database contains older migrations that are not all represented in this repository. The two new migrations are recorded under `supabase/migrations/`, but the folder is not yet a complete reproducible baseline. Reconstruct and verify the historical migration set before using the repository to create a new Supabase environment.

### Medium priority — reduce coupling carefully

The application is currently built from classic browser scripts with shared global state. `js/core.js` wraps navigation and `js/spaces.js` also wraps navigation/language switching. This is fragile but can be part of the current integration contract. Before changing it, map all callers and split the refactor into small changes with smoke tests.

### Medium priority — CSS duplication and injected styles

`styles.css` contains multiple override layers, and `js/spaces.js` injects a large block of CSS. This makes theme/layout bugs harder to reason about. Consolidate one component at a time only after capturing the current selectors and testing dark/light mode, RTL/LTR, group headers, dialogs, and the mobile composer.

### Product gaps, not represented as completed features

- One-to-one calling and the service-worker shell have since been added in the follow-up pass below. They remain unverified on real devices; group calls and fully configured background push are still incomplete.
- The current GitHub Actions job checks JavaScript syntax only; it does not execute browser flows or test Supabase authorization.

## Suggested order for the next pass

1. Enable leaked-password protection in Supabase Auth.
2. Reconstruct the historical migrations and add repeatable database access-control tests.
3. Add focused tests for profile/phone lookup, private messages, attachment ownership, group roles, and per-user message hiding.
4. Consolidate group styles out of the injected CSS in small batches.
5. Reduce global navigation/language coupling after the existing behavior is covered by tests.
6. Plan service-worker notifications and real audio/video calling as separate feature projects.

## Verification boundary

The SQL changes were applied to the connected Supabase project and queried afterward. GitHub file changes were committed. A complete browser session on iOS/desktop was not run in this pass, and the syntax workflow's hosted result was not available at review time. Do not interpret source review or SQL metadata checks as proof that all user flows work end to end.


## Follow-up pass — static checks and product accuracy

1. Added `scripts/validate.mjs` and expanded the GitHub Actions workflow. It checks the syntax of all three browser scripts, validates local script/stylesheet links in `index.html`, detects duplicate static IDs, checks CSS string/comment/brace balance, and scans browser JavaScript for common Supabase secret-key patterns. These are guardrails, not a full browser test suite.
2. Updated the landing-page feature cards and both Persian/English translation entries so the public-facing copy emphasizes contacts, groups, and channels instead of suggesting that background reminders and real audio/video calls are already implemented.
3. Rechecked CSS selector repetition with a lightweight source scan. The main `styles.css` contains many repeated selector blocks (roughly 90 selectors appear more than once in the source scan), particularly around chat viewport, composer, and theme overrides. Some rules may be intentional because they sit in different media queries or are later compatibility overrides. They should not be deleted mechanically. The next CSS refactor should first map each rule to its enclosing media/theme context and remove only demonstrably redundant declarations, with visual regression checks for iOS chat layout.
4. The connected Supabase project has a migration history covering the existing database changes, but the repository does not yet contain a complete historical SQL migration baseline. The database's migration ledger alone does not provide the original SQL text. Do not synthesize old migrations from their names or use a guessed baseline; recover the original SQL from a trusted source or create a carefully reviewed schema baseline in a separate, tested process.

## Follow-up pass — low-risk CSS cleanup

1. Consolidated the two group-call SVG rules into one rule, preserving the final cascade values: 19px icon dimensions, mint stroke/color, no fill, and the existing stroke width/caps/joins.
2. Removed one redundant group-composer override that repeated `justify-content:flex-end!important` and `direction:ltr!important` already set by the immediately preceding rule for the same selector and context.
3. Left other repeated selectors untouched where they change layout, specificity, or final values, or where responsive/context boundaries could affect behavior. No visual regression test was available in this pass, so this was deliberately limited to declarations whose redundancy could be established from the source.


## Live Supabase access-control review — 2026-10-23

The connected project `iemykhluluoymsbqpjsn` was queried directly after the earlier review. This is a metadata/policy inspection, not an adversarial two-account integration test.

- All inspected application tables in `public` have RLS enabled.
- Private chat attachment bucket `chat-attachments` is non-public, has a server-side 20 MiB limit, and restricts reads to paths referenced by messages in which the current user is a sender or receiver, or space attachments readable through `private.can_read_space`. Upload paths must start with the authenticated user's ID. The frontend's 20 MiB check matches the bucket limit; the earlier suspected 10 MiB mismatch is not present in the live project.
- `group-avatars` is non-public with a 5 MiB limit and member/manager-scoped policies. `avatars` is public by design; profile avatar URLs must therefore be treated as public assets, not private content.
- Message RLS ties reads to sender/receiver, inserts to the authenticated sender, and edits to the sender. The database trigger preventing message identity changes remains part of the protection. Group/channel message reads and posting are governed by `private.can_read_space` and `private.can_post_space`; manager actions are checked by database policies.
- The seven authenticated-callable `SECURITY DEFINER` functions flagged by the Supabase advisor were inspected. They are intentional RPCs for account discovery/profile access and group membership/administration, have an empty fixed `search_path`, and contain authentication/resource checks in their definitions. Do not revoke them blindly because the application uses them. Their privacy and abuse-resistance still require authenticated multi-user tests.
- Supabase's security advisor still reports **Leaked Password Protection disabled**. The available connected tools can inspect SQL and advisors but do not expose the Auth dashboard setting needed to toggle it. Enable it manually in **Supabase Dashboard → Authentication → Security and Protection / Password Security** (exact labels may vary), then rerun the security advisor.
- The Storage bucket limit and frontend 20 MiB limit agree. Do not change the bucket limit without a product decision.

### Remaining verification that requires a real session or dashboard access

1. Enable leaked-password protection in Auth settings and confirm the advisor warning disappears.
2. Test as two separate authenticated accounts: private message visibility, attachment download, user lookup response fields, group role changes, and per-user message hiding.
3. Test a disallowed MIME type and a file just above 20 MiB against the real Storage API.
4. Check the hosted GitHub Actions run and perform a real iOS Safari/PWA smoke test.

No destructive policy changes were made during this review. The remaining SECURITY DEFINER advisor warnings are not automatically vulnerabilities; each RPC needs its current authorization contract preserved and tested.


## Reliability and call implementation follow-up — 2026-10-23

- Added a private-call signaling schema (`call_sessions`, `call_signals`) with RLS policies that restrict records to the call participants, fixed participant/type fields, and guarded call status transitions so only the receiver can accept or reject and either participant can end a call. Both tables are included in the Realtime publication. Live metadata confirms RLS is enabled (3 policies on sessions; 2 on signals) and both tables are published.
- Added a browser WebRTC flow for one-to-one audio/video calls, including incoming-call prompts, offer/answer/ICE exchange, microphone/camera cleanup, reconnect lookup for recent ringing invitations, and a missed-call timeout. Group call buttons are hidden because multi-party calling is not implemented.
- Added a service worker and manifest for installable PWA metadata, offline shell caching, notification display/click handling, and a notification permission control. The current UI can show notifications while the app's Realtime connection is alive; **true push delivery after the app is closed is not complete** because VAPID keys, subscription persistence, and a server-side push sender still need configuration.
- Realtime recovery now reconciles the open private conversation after a network interruption or mobile tab suspension, while preserving the user's scroll position when they were not already at the bottom.

## Important verification boundary

The schema and RLS metadata for call signaling were verified against the live project. The browser code has been committed but has **not** been tested with two logged-in browsers/devices, real microphone/camera permissions, or difficult NAT/mobile networks. The WebRTC configuration currently uses public STUN servers and has no TURN relay; calls may fail on restrictive networks until a TURN service is configured. Push after app closure likewise remains a deployment task. Do not describe these features as production-verified yet.
