# Private Conversation Hub — Product and Implementation Specification

Date: 2026-11-07
Repository: `kalaghkocholo/HAN`
Target branch: `main`
Status: approved implementation baseline; no application code or database schema changed by this specification.

## 1. Purpose and product principles

Replace the current contact-information modal with one coherent, mobile-first private-conversation hub. This is a product specification, not a claim that the features described below are already implemented.

The hub must:
- Make identity and the most common actions immediately understandable.
- Keep conversation management separate from shared content and safety actions.
- Load quickly on mobile networks and avoid blocking the first screen on media requests.
- Respect per-user privacy preferences and server-side authorization.
- Reuse the product's visual language without merging private-chat and group-space permissions or data.
- Work in Persian RTL and English LTR, including narrow iPhone screens, keyboard navigation, screen readers, and reduced-motion settings.
- Avoid decorative complexity, excessive cards, unnecessary confirmation dialogs, and duplicate controls.

Existing implementation is evidence, not a constraint. Replace obsolete code only after identifying all entry points and preserving supported behavior.

## 2. Information architecture

The hub is one scrollable page/surface with these ordered sections:

1. Identity header
2. Primary actions
3. Shared content
4. Conversation management
5. Safety and privacy
6. Destructive actions

Do not render every setting as a prominent card. Use simple list rows with a clear title, concise supporting text, and a trailing affordance. Use section dividers and restrained iconography. Destructive actions are visually separated at the bottom.

### 2.1 Identity header

Display:
- Contact avatar, with a neutral fallback.
- Contact display name (respect the viewer's local alias when one exists; retain the account display name as secondary identity where useful).
- Username, if present.
- About text, if present.
- Presence/last-seen only when the contact's privacy rules permit it.
- Phone number only when the profile's visibility setting permits it.

Rules:
- Never infer or reveal a phone number from authentication metadata or contact matching.
- Never show a stale online state as current; show a neutral unavailable/unknown state when presence is stale or unavailable.
- Long names/about text must wrap or truncate gracefully without pushing primary actions off-screen.
- Avatar loading failure must not block the rest of the page.
- The local alias is viewer-specific and must never overwrite the contact's global profile.

### 2.2 Primary actions

Three clearly labeled, touch-friendly actions:
- Message: close the hub and return to the existing private conversation without resetting its scroll position or draft.
- Audio call: invoke the existing verified call entry point for this contact.
- Video call: invoke the existing verified call entry point for this contact.

Rules:
- Disable only the action that cannot currently run; explain the reason accessibly.
- Prevent double activation while a call is being initiated.
- Do not create a second call implementation or bypass current call authorization/session checks.
- If calls are unavailable, preserve the conversation and show a concise status rather than a dead button.

## 3. Shared content library

Provide category navigation for:
- Photos
- Videos
- Files
- Audio / voice messages
- Links

Saved messages and pinned messages are separate collections; they are not media categories.

### 3.1 Category behavior

Each category opens a focused subview with:
- Clear title and back navigation to the hub.
- Search within that category when supported.
- Date filter.
- Paginated/infinite loading with a stable cursor.
- Loading, empty, partial-failure, and retry states.
- A result count only when the count is authoritative.
- A clear indication when search is limited or incomplete.

Do not download every attachment when the hub opens. Load category counts only if they can be computed cheaply and accurately; otherwise omit counts. The first hub render must not wait for signed media URLs.

### 3.2 Media query and performance contract

- Query only records belonging to the authenticated user and the selected conversation.
- Preserve sender/receiver direction semantics.
- Use deterministic keyset pagination, with a stable compound cursor such as (created_at, id) where the data model supports it.
- Batch signed URL creation; never issue one sequential network round trip per item.
- Do not persist long-lived signed URLs as authoritative data. Refresh expired URLs on demand.
- Lazy-load thumbnails and use an appropriate preview size; do not fetch original full-resolution media for a grid thumbnail.
- Handle missing, expired, deleted, unsupported, and inaccessible objects without breaking the entire list.
- Treat Storage authorization as a server-side security boundary. A guessed object path or changed message ID must not expose another user's attachment.
- Avoid exposing private file names or content in analytics/logs.

### 3.3 Links

Links must be derived from actual message content and retain a reference to the source message. Do not automatically fetch remote previews in the first implementation. If previews are later added, they need SSRF-safe server-side fetching, content-type and size limits, privacy review, and an explicit user expectation.

### 3.4 Saved messages

Saved items are personal to the authenticated user:
- Saving or unsaving must not notify the other participant.
- A saved item references the original message; it must not duplicate message content into a second source of truth.
- If the original message is deleted or becomes inaccessible, show a safe unavailable state and remove or reconcile the saved reference according to the defined retention policy.
- RLS must ensure one user cannot enumerate another user's saved items.

### 3.5 Pinned messages

Pinned messages are conversation-level shared state:
- Clearly explain who can pin/unpin and who sees the pin.
- Until multi-pin behavior is deliberately implemented and tested, the UI must match the actual data model; do not display a multi-item collection backed by a single-pin implementation.
- If multiple pins are supported, provide a list ordered by pin time and allow navigation to the source message.
- A pin reference to a deleted/hidden message must resolve safely.

## 4. Conversation management

### 4.1 Search in conversation

Open the existing conversation search with the contact preselected. Preserve current supported search modes. Do not imply exhaustive search while the implementation has a result cap. Search results must be paginated before the UI claims full-history coverage.

### 4.2 Notifications and mute

Per-user, per-conversation preference:
- Off / always muted
- A finite duration (for example 1 hour, 8 hours, 1 day, or a custom end time if implemented)
- Back to normal

Rules:
- Muting affects only the current user's notification experience.
- It must not change the other participant's preferences.
- Persist the preference server-side for cross-device consistency, scoped to the authenticated user and conversation.
- Expiration must be based on an absolute timestamp, not a local timer alone.
- Display the exact end time in the user's local time zone and handle time-zone/DST changes.
- Incoming messages remain in the conversation; mute is not block.
- If notification delivery is not actually implemented for a platform/path, do not imply that mute controls can suppress notifications that the app never sends.

### 4.3 Archive

Archive is a per-user list preference:
- It does not delete messages.
- It does not notify or alter the other participant.
- New-message behavior (remain archived or return to inbox) must be explicitly selected and consistent; default to the least surprising behavior and document it.
- Restore must be available from the archived list.
- Archive state must not be conflated with hidden/deleted state.

### 4.4 Local conversation removal

The current product has a per-user hide boundary. The UI must describe the actual semantics accurately:
- Clarify whether the operation hides the conversation and its earlier history only for the current user.
- Clarify whether later messages can make the conversation visible again.
- Never describe a local hide as deleting the other participant's copy or deleting server data.
- Require confirmation only where the action is destructive or the consequence could surprise the user.

## 5. Safety and privacy

### 5.1 Block

- Block is distinct from report, archive, and local deletion.
- Explain that new communication is restricted according to the actual server rules.
- Preserve the user's ability to unblock.
- Do not promise that blocking erases existing messages or removes the other participant's copies.
- Ensure the block decision is enforced server-side for message insertion and any applicable call/invitation paths.

### 5.2 Report

Report is separate from block:
- Explain what is submitted (for example, selected message IDs and a reason) before submission.
- Collect the minimum data needed to investigate.
- Do not silently attach an entire conversation or private media library.
- Provide a clear success/failure state and avoid duplicate report submissions.
- Add a report backend only after defining moderation access, retention, abuse controls, and RLS/service-role boundaries. Until then, do not expose a nonfunctional report button.

### 5.3 Security information

Show only verified facts:
- Session/account safety information where available.
- A truthful explanation of current message protection.
- If end-to-end encryption is not implemented and externally verified, do not display E2EE, verified identity, safety number, or equivalent claims.
- A future identity-verification feature must be tied to a real cryptographic key lifecycle and key-change handling, not a decorative badge.
- A local app lock, if later introduced, must be described as local access protection, not encryption of messages or server data.

## 6. Destructive actions

Keep these at the bottom and visually distinct:
- Remove/hide this conversation for me.
- Any future delete-for-everyone operation, only if separately authorized and correctly implemented.

Before confirmation, state:
- What changes for the current user.
- Whether the other participant is affected.
- Whether server messages or attachments are deleted.
- Whether the action can be undone.

Never bundle block, report, archive, and delete into one ambiguous action. Never transfer ownership of a group/space as a side effect of private-chat actions.

## 7. Interaction and visual behavior

- Use one canonical hub implementation; no duplicate modal/page versions.
- On mobile, use a full-height navigable surface with a stable header and a single scroll container for the content. Avoid nested scroll regions unless essential.
- Back returns to the previous conversation state, preserving draft and scroll.
- The hub should render identity and primary actions before media requests finish.
- Use skeletons only for content that is actually loading; avoid layout shifts.
- Empty states must explain the absence without suggesting an error.
- Errors must include retry where safe.
- Use semantic buttons, visible focus, logical focus order, focus restoration on close, accessible names, and live announcements for asynchronous status.
- Meet WCAG 2.2 AA contrast and focus requirements; target 44x44 CSS px touch controls where practical.
- Support keyboard operation, screen readers, text zoom, reduced motion, RTL/LTR, and narrow viewport widths.
- Use the same icon family and visual weight throughout. Do not use emoji as primary action icons.
- Do not introduce decorative 3D effects, bright gradients, excessive rounded cards, or redundant labels.
- Avoid motion for motion's sake; honor prefers-reduced-motion.

## 8. Data and service boundaries

Keep responsibilities explicit and avoid a second parallel implementation:
- Hub UI: rendering and accessible interaction only.
- Hub controller: selected section, loading state, navigation and request cancellation.
- Conversation repository: profile and conversation-scoped metadata reads.
- Media service: category queries, pagination, signed URL batching and preview handling.
- Conversation preferences service: per-user mute, archive, alias and local hide.
- Saved-items service: per-user saved-message references.
- Pin service: conversation-level pin operations matching the actual schema.
- Safety service: block/report and verified security information.
- Existing message and call services remain authoritative for message/call operations.

Do not move business logic into inline HTML handlers. Do not add another global state owner if an existing controller can own the state cleanly. Use request IDs or AbortController-style cancellation where supported so stale requests cannot overwrite a newly selected contact.

## 9. Data model and migration gates

This specification does not authorize a database migration. Before adding columns/tables:
1. Inspect existing schema, indexes, constraints, triggers, RLS, grants, and RPCs.
2. Define exact per-user vs conversation-shared ownership.
3. Add least-privilege RLS policies and negative tests.
4. Add indexes matching actual query and pagination patterns.
5. Provide migration and rollback/recovery strategy.
6. Verify existing data compatibility and concurrent writes.
7. Do not change Supabase dashboard/Auth settings without separate explicit authorization.

Likely future data needs (subject to schema inspection):
- Per-user conversation mute state and expiry.
- Saved-message references scoped to user.
- Possibly a normalized link index only if runtime extraction is insufficient.
- Report records and moderation workflow only after policy and operational design.
Do not add a table merely because a UI category exists. Categories may be derived from existing message attachments.

## 10. Acceptance criteria

### Identity and navigation
- [ ] Hub opens for the correct contact and never leaks the previous contact's information during fast switching.
- [ ] Local alias and global profile identity are distinguishable.
- [ ] Phone, presence and last-seen respect privacy settings.
- [ ] Message action returns to the same conversation, draft and scroll position.
- [ ] Audio/video actions use existing call services and resist double activation.

### Shared content
- [ ] Every category returns only authorized messages and objects.
- [ ] Pagination has no duplicates or skipped rows at timestamp collisions.
- [ ] Signed URL requests are batched and expired URLs recover safely.
- [ ] Empty, loading, partial-error, retry and unavailable-item states work.
- [ ] Search/date filters do not claim complete results unless they are complete.
- [ ] Links navigate to their original message.
- [ ] Saved items are private to the saving user.
- [ ] Pin UI matches the real schema and permissions.

### Preferences and safety
- [ ] Mute is per-user, persists across devices, expires correctly and does not affect the other participant.
- [ ] Archive does not delete messages and has a clear restore path.
- [ ] Local removal accurately describes its scope and behavior.
- [ ] Block is server-enforced and distinct from report.
- [ ] Report discloses submitted data and is not available before its backend is real.
- [ ] No unsupported E2EE or identity-verification claim appears.

### Accessibility and performance
- [ ] Full keyboard and screen-reader operation.
- [ ] Visible focus and focus restoration.
- [ ] WCAG AA contrast and practical touch target sizes.
- [ ] Persian RTL and English LTR verified.
- [ ] 320 CSS px width and text zoom do not cause horizontal overflow.
- [ ] Reduced motion respected.
- [ ] Hub first content appears without waiting for media URLs.
- [ ] Media grid lazy-loads thumbnails and does not fetch full originals unnecessarily.
- [ ] No unhandled rejection or stale-response UI corruption.

### Security tests
- [ ] Two-account tests cover participant and nonparticipant access.
- [ ] Guessed message IDs and Storage paths do not expose data.
- [ ] Blocked pairs cannot bypass restrictions via alternate client paths.
- [ ] Saved-item references cannot be enumerated across users.
- [ ] Mute/archive preferences cannot be modified for another user.
- [ ] Expired/revoked sessions cannot continue protected operations.

## 11. Implementation sequence

1. Map the current modal entry points, DOM ownership, data queries, handlers, and CSS; identify the single authoritative owner.
2. Implement the new hub shell and identity/actions using existing verified data and services only.
3. Replace the mixed recent-media list with paginated category views and batched signed URLs.
4. Add saved and pinned collections only after schema/permission behavior is verified.
5. Add mute/archive preferences through reviewed migrations if required.
6. Add safety/reporting only when backend workflow and policy are complete.
7. Remove superseded modal markup, handlers, CSS and duplicate event wiring after parity checks.
8. Run automated tests, two-account authorization tests, Safari/PWA tests, RTL/LTR and accessibility checks.
9. Deploy only after the latest main commit has a verified production deployment; do not use an older deployment as proof.

## 12. Non-goals and explicit exclusions

This hub project does not, by itself:
- Implement end-to-end encryption.
- Implement a secure encrypted local vault.
- Guarantee background notifications or background outbox delivery.
- Add cross-device draft synchronization.
- Change group/space ownership or group administration.
- Change account deletion semantics.
- Change Supabase Auth/dashboard settings.
- Promise that reporting or moderation exists before its backend is implemented.

## 13. Change control

All work must be committed directly to `main`. No branches, pull requests, staging copies, or parallel implementations. Preserve one authoritative implementation for the hub and one authoritative stylesheet. Existing code may be replaced when the new implementation is proven, but data/security invariants and existing call/message service contracts must be preserved unless a separately reviewed migration explicitly changes them.
