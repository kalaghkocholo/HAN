# Private conversation: professional audit and redesign baseline

Date: 2026-11-07  
Repository: `kalaghkocholo/HAN`  
Reference: `main`  
Scope: one-to-one private conversations only. Group/channel behavior is outside this document unless a shared subsystem is affected.

## Executive decision

The current private-chat experience has a useful functional base, but it is not yet at the standard of a mature privacy-first messenger. The next design must not preserve legacy implementation choices merely for compatibility. Existing code is evidence to inspect, not a constraint on the target architecture.

The redesign must preserve the product principles: fast, calm, accessible, mobile-first, reliable on unstable networks, minimal in the conversation view, and explicit about privacy and deletion semantics.

No claim of end-to-end encryption, secure chat locking, disappearing-message enforcement, or background push delivery may be made until the relevant architecture and real-device tests prove it.

## 1. Verified current capabilities

Source review of `index.html`, `js/core.js`, `js/chat-menu-v5.js`, `js/local-store.js`, relevant migrations, and live Supabase metadata found:

- One-to-one text messages; 5,000-character client/database policy limit.
- Image, video, audio/voice and generic file attachments; 20 MiB client limit.
- Reply, forward, edit own message, delete own message for everyone, hide a message for self, and hide a conversation for self.
- Six fixed emoji reactions.
- Message pinning, read receipts, typing state, presence/last-seen privacy.
- Per-device IndexedDB message cache and per-conversation drafts.
- Older-message loading and advanced search by phrase, type and date.
- Private contact blocking; blocked pairs are restricted from inserting messages.
- Contact profile information, local contact alias, calls, and a recent mixed attachment list.
- Conversation list pin/archive/hide preferences.

Live database metadata confirms RLS is enabled on the inspected private-chat tables. The current policies restrict message reads to sender/receiver, inserts to the authenticated sender, edits/deletes to the sender, and private attachment reads to users referenced by a message. Storage policy and signed URL behavior still require adversarial two-account testing.

## 2. Verified gaps and design risks

### P0 — security and trust claims

1. **No verifiable E2EE protocol was identified in the reviewed client/database design.** Message bodies are stored as ordinary text in `public.messages.body`; the browser reads and renders that field. The current architecture therefore must be treated as server-readable, not as Signal-like E2EE.
2. **No cryptographic identity verification, device identity/key lifecycle, forward secrecy, post-compromise recovery, or encrypted attachment-key protocol was identified.**
3. **A local chat lock must not be presented as message encryption.** A browser/PWA lock can reduce casual access on a device but cannot protect data from a compromised device or an already-authorized browser session.
4. **Disappearing messages are absent.** They require server-side retention semantics, expiry enforcement, cleanup policy, and clear treatment of offline devices, exports, notifications and backups. A client-only timer is insufficient.
5. **The live security advisor reports 17 authenticated-callable SECURITY DEFINER functions and leaked-password protection disabled.** These findings are not proof of exploitable vulnerabilities; every function needs authorization-contract review. They are project-wide follow-up items, not a reason to revoke RPCs blindly.
6. **The private schema contains an RLS-enabled table with no policies.** This is an informational advisor finding for `private.farnaz_user_search_limits`; inspect intended access before changing it.
7. **Storage, message and RPC controls still need two-account negative tests**, including cross-user IDs, blocked users, deleted accounts, revoked sessions, signed URL expiry, and attachment path guessing.

### P1 — correctness and completeness

1. **Reactions are structurally limited to one reaction per user per message.** The primary key is `(message_id,user_id)`; the UI upserts on that pair. This prevents one user from applying multiple distinct emoji reactions to the same message.
2. **Pinned-message presentation is incomplete.** The UI presents one current pinned-message banner even though the data model can contain multiple pinned messages. The product must deliberately choose either a single pin or a full pinned-items view.
3. **Conversation preferences lack mute fields.** Current live columns are `pinned`, `archived`, `hidden_at`, `display_name`, and `updated_at`; no per-conversation notification mode or mute expiry exists.
4. **Notification delivery is not wired to incoming private messages.** A generic incoming-message notification helper exists, but the reviewed private-message Realtime handler does not call it. The service worker can display notifications; this does not prove actual private-message notification delivery.
5. **Advanced search is not fully paginated.** It runs directional queries with a limit of 101 per query, then merges, filters and displays at most 100. The UI wording should not imply an unbounded full-history search.
6. **Shared media is a recent mixed list, not a complete media library.** It fetches up to 60 attachments in each direction, merges to 80, and obtains signed URLs one at a time. This creates an avoidable sequential-request cost and does not provide category navigation or pagination.
7. **Shared media has no dedicated links collection**, and no first-class saved/bookmarked-message collection was identified.
8. **Forwarding does not preserve explicit forwarding provenance.** The forwarded content is inserted as a new message without a first-class forwarded-from marker or auditable provenance model.
9. **Delivery state is less expressive than a mature messenger.** Read receipts exist, but a distinct durable delivered/failed/pending state machine is not represented in the private-message schema.
10. **Drafts are local to the device.** This is useful for speed and privacy, but drafts do not synchronize across devices.
11. **The local message cache stores message body text in IndexedDB.** It is a performance cache, not an encrypted vault. Device-level protection and cache lifecycle need explicit product/security treatment.
12. **Pagination uses a timestamp cursor.** A stable compound cursor such as `(created_at,id)` is safer for deterministic pagination when timestamps collide.

### P2 — usability, accessibility and polish

- The contact-information surface combines identity, actions, media and destructive actions in one modal. It needs a clearer hierarchy and category navigation.
- Action controls and labels should be consistent, localized, keyboard accessible and sized for touch.
- The message action menu uses a mixture of dynamically injected inline styles and CSS. This should move to one authoritative component stylesheet.
- Dialog focus management, focus restoration, screen-reader announcements, reduced-motion behavior, RTL/LTR layout and small-screen overflow need explicit tests.
- The composer must remain stable when the keyboard opens, while only the message list scrolls.
- The conversation must communicate sending, sent, delivered, read, retrying, failed and offline states without ambiguous symbols.

## 3. Target product architecture

### Conversation surface

Keep the message screen intentionally quiet:
- Header: back, avatar/name/presence, audio call and video call.
- Message timeline: stable chronological ordering, clear day separators, reply context, edited/deleted state, reactions, pin indicator, and delivery state.
- Composer: text, attachment, voice recording, send; preserve drafts and pending sends.
- No settings dashboard or rarely used feature grid in the main timeline.

### Contact and conversation hub

The contact-information surface becomes a structured hub:
1. Identity: avatar, display name, username/about, privacy-filtered phone, presence.
2. Primary actions: message, audio, video.
3. Shared content: Photos, Videos, Files, Audio, Links — each with search, date filters and pagination.
4. Saved items: bookmarked messages and pinned items.
5. Conversation controls: mute schedule, archive, local lock, search, export policy and retention settings where supported.
6. Safety: block/unblock, report, verify identity/key when E2EE exists, active devices/session warnings where relevant.
7. Destructive actions at the bottom, with explicit local-vs-everyone consequences.

### Data and service boundaries

The long-term design should separate:
- `private-chat-ui`: rendering and user interaction.
- `private-chat-controller`: view state and transitions.
- `private-message-service`: send, edit, delete, reply, forward and retry orchestration.
- `private-message-repository`: Supabase reads/writes and pagination.
- `private-media-service`: uploads, signed URLs, media metadata and category queries.
- `conversation-preferences-service`: per-user mute, archive, pin, local hide and alias.
- `private-chat-security`: identity, session checks, cryptographic protocol and device keys.
- `private-chat-notifications`: foreground and supported push delivery, honoring mute preferences.
- `private-chat-outbox`: durable idempotent pending sends and reconciliation after network loss.

Do not create a second implementation beside the current one. Migrate ownership deliberately, remove superseded code after parity tests, and keep one authoritative source for each responsibility.

## 4. Security architecture decision

E2EE is a separate architecture project, not a UI feature. Before implementation:
- Select a maintained, audited protocol implementation with real browser support; do not write custom cryptography.
- Evaluate Signal-style asynchronous one-to-one sessions and MLS for group messaging separately.
- Define identity keys, signed prekeys, one-time prekeys, device linking, key rotation, key-change alerts, verification, recovery and account deletion.
- Encrypt message content and attachments client-side with independent per-object keys; the server stores ciphertext and only necessary routing metadata.
- Define what search, link previews, moderation, backups, multi-device sync and account recovery can do without plaintext server access.
- Threat-model XSS, malicious dependencies, compromised devices, backups, browser storage, push payloads and metadata leakage.
- Publish a truthful security model and limitations before advertising E2EE.

Do not bolt on a home-grown AES wrapper and call it E2EE. Cryptographic protocol correctness, key authentication and safe key lifecycle matter more than the encryption primitive alone.

## 5. Delivery and reliability requirements

- Use a durable outbox with client-generated idempotency IDs, retry/backoff and server reconciliation.
- Never clear the composer until the message is confirmed or the user explicitly discards it.
- Use deterministic keyset pagination on `created_at,id`.
- Batch signed URL creation and avoid sequential network calls for every media item.
- Keep local cache bounded, account-scoped, versioned and clearable on logout/account deletion.
- Preserve scroll position and avoid rebuilding the full message DOM on a single incoming event.
- Define offline, reconnecting, retrying, failed and delivered states.
- Measure latency, retry rate, message duplication, media load time and reconnect recovery without collecting message content.

## 6. Test gates before production

Required automated and manual coverage:
- Two-account authorization matrix for every private-message operation.
- RLS/Storage tests for participant vs nonparticipant, blocked pair, revoked session, deleted account and guessed object path.
- Duplicate-send and lost-response idempotency tests.
- Offline send, app suspension, reconnect, account switch and logout cache-clearing tests.
- Pagination boundary/timestamp-collision tests.
- Search correctness over more than 100 results and mixed media.
- Media gallery tests for empty, large, expired signed URL, unavailable file and mixed MIME types.
- Reaction concurrency and multiple emoji behavior.
- Mute expiry/time-zone/device synchronization tests.
- iOS Safari, installed PWA, Android browser and desktop smoke tests.
- RTL/LTR, light/dark, keyboard, screen reader, touch target and reduced-motion checks.
- Call tests remain separate and must not regress.

## 7. Implementation sequence

1. **Baseline and testability:** map all private-chat entry points, state owners, data contracts and event handlers; add deterministic tests before refactoring.
2. **Core reliability:** outbox/idempotency, compound pagination, message-state model, race and account-switch handling.
3. **Conversation hub:** redesign information hierarchy; add proper media categories, batched URL loading, pinned/saved items and per-chat controls.
4. **Notification model:** connect actual private incoming-message events, add per-chat mute schedules, and implement only push paths that pass platform tests.
5. **Privacy controls:** local lock and retention controls only after threat-modeling and clear semantics.
6. **E2EE architecture:** independent protocol selection, threat model, key lifecycle, migration strategy and external security review.
7. **Polish and release:** accessibility, visual regression, two-account E2E, iOS PWA and production smoke tests.

## 8. Change-control rules

- All repository changes are direct to `main`; no branches, PRs, parallel copies or staging implementations.
- Existing code is not a design constraint. A replacement is acceptable when justified by correctness, security, maintainability or UX.
- Do not change Supabase Auth/dashboard settings as part of code work without explicit authorization.
- Any database change must have a reviewed migration, RLS/grant review, advisor check and verification query.
- Do not claim a feature is complete based on a visible button or static syntax check.
- Do not claim E2EE, reliable background push, secure lock, or cross-device draft sync until the complete relevant test gates pass.

## Verification boundary

This document is based on source inspection of the current `main` tree and read-only inspection of the connected Supabase schema, policies, indexes and advisors on 2026-11-07. It is not a penetration test, a two-account E2E test, a full browser audit, or an external cryptographic review. No application code, database schema, or Supabase settings were changed during this audit.


## 9. First implementation increment — deterministic private-message history

Implemented directly on `main` after the audit:

- Added `js/private-chat-model.js` as a small, pure and independently testable message-ordering/pagination model.
- Private-message history now orders by `created_at DESC, id DESC` and uses a compound keyset cursor `(created_at,id)` for both sent and received directions. This prevents same-timestamp messages from being skipped at page boundaries.
- The two directional query results are merged and deduplicated by message ID before the 50-message page is rendered.
- Query errors are checked before treating a page as valid.
- Added `tests/private-chat-model.test.mjs` covering timestamp collisions, deterministic order, deduplication, cursor validation, page boundaries and has-more behavior.
- Added the model to the ordered runtime loader and service-worker shell; bumped the shell cache to `farnaz-shell-v293`.
- Added syntax, loader-order, shell-cache and cursor-contract checks to static validation; CI now runs the new unit tests.

Verification on commit `1736325939c753f049448b60b73dc8772d4c1448`:
- JavaScript syntax validation: passed.
- Application structure validation: passed.
- Call infrastructure security invariants: passed.
- Existing LiveKit test suite: passed.
- New private-chat model tests: passed.
- LiveKit token endpoint type-check: passed.
- Vercel status: failed due to the team's deployment build-rate limit, not a reported source build error. The current production deployment was not replaced by this change.

This increment addresses deterministic history pagination only. It does not yet add offline outbox/idempotency, media library redesign, mute controls, notification delivery, E2EE, or two-account end-to-end security coverage.

## 10. Implementation increment: durable private-message outbox

Implemented directly on `main`:

- IndexedDB schema version 3 adds a dedicated `privateMessageOutbox` object store, separate from the recoverable message cache and drafts.
- Outbox records are scoped to the authenticated account and include a client-generated stable message UUID, destination, text/reply metadata, and the selected attachment Blob when present.
- The IndexedDB primary key is the stable message UUID. Retrying the same UUID cannot create a second queue record, while two intentional messages with identical text but different UUIDs remain separate.
- The composer clears only after the record has been committed to IndexedDB. If local persistence fails, the composer remains intact.
- Pending records render in the private conversation with a waiting indicator and remain visible after reopening the conversation.
- Reconnection and successful realtime subscription trigger sequential retry. Attachment object paths are deterministic from the sender and message UUID; storage conflicts are reconciled, and a failed/ambiguous database insert is checked by the same message UUID before retrying.
- A queue item is removed only after the server confirms the insert or the message is found by its stable UUID.
- Account logout cleanup also purges that account's outbox so queued private content cannot leak into another signed-in session.

Verification scope and limitations:

- The implementation uses IndexedDB for the durable queue and Supabase as the authoritative message store; the outbox is not a cross-device source of truth.
- This increment does not yet provide a dedicated failed-message management screen, manual per-message retry/cancel controls, or background delivery while Safari is fully closed. Retry resumes when the app is open and its authenticated realtime connection is established, or when the browser reports the network online.
- Attachment payloads are retained locally until successful delivery; browser storage quotas and user-cleared site data can still remove local pending data.
- Added fault-injection tests that execute the production retry function against controlled Supabase/Storage adapters: offline hold, interrupted attachment upload, retry after an object already exists, ambiguous insert committed before response loss, failed insert with no commit, blocked-recipient isolation, identical intentional messages, and account switching during upload. GitHub Actions is configured to run these alongside the pagination tests.
- These automated tests exercise the production retry orchestration but do not emulate Safari's actual IndexedDB implementation or prove real two-account delivery. Real Safari offline/online and two-account E2E tests remain required.

Verification recorded on commit `a5a63b1ffa6096317ce01dc6b1e05f1b892f3395`:
- JavaScript syntax checks: passed.
- Application structure validation: passed (210 static IDs and asset/CSS/client-secret checks).
- Call infrastructure security invariants: passed.
- Existing LiveKit tests: 27 passed, 0 failed.
- Private chat ordering plus outbox fault-injection tests: 14 passed, 0 failed (6 pagination/model tests and 8 outbox retry tests).
- LiveKit token endpoint type-check: passed.
- GitHub Actions run: [42386851006](https://github.com/kalaghkocholo/HAN/actions/runs/42386851006), success.
- Vercel did not create a deployment for this cache-busted commit; the commit status reports the team's build-rate limit. Do not use an older deployment as proof that this cache-busted version is live.


