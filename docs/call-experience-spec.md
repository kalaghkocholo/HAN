# Farnaz Call Experience and Audio-First Engineering Spec

Status: approved direction; implementation remains experimental until the pilot passes real-device tests.
Date: 2026-10-30

## Product decision

Farnaz calls are an independent product module, not an extension of the messaging page's internal state. The first quality objective is clear, stable, two-way voice. Video is secondary and must never be allowed to make voice unusable.

The rollout order is:
1. One-to-one audio calls.
2. One-to-one video calls and audio/video upgrade.
3. Group audio calls.
4. Group video calls.
5. Incoming-call delivery and background behavior, subject to browser/PWA platform limits.

## Non-negotiable boundaries

- Keep the current `js/calls.js` path intact until the new path has passed the same-device, two-device, iOS Safari/PWA, desktop, reconnect, and weak-network tests.
- New code must live in a separate call module and use a separate namespace/API. It must not overwrite existing globals, patch chat navigation, or add call-specific CSS overrides to the general stylesheet.
- Do not load the LiveKit SDK during normal app startup. Load the pinned same-origin SDK only after a user explicitly starts or accepts a call.
- Do not add a CDN fallback. If the local SDK artifact is absent or fails verification, keep the feature disabled and show a clear recoverable error.
- Keep call UI, call state, media transport, signaling/token issuance, and quality telemetry as separate responsibilities.
- No schema, RLS, production deployment, secret, or `main` branch change is implied by this specification.

## Call experience

### Entry points

- Private conversation: audio and video actions in the conversation header.
- Group: audio and video actions in the group header after group calling is enabled.
- Channel: no call action in the initial release.
- Incoming call: dedicated incoming-call surface with caller identity, call type, answer, and decline.
- Active call while navigating: a compact persistent call strip returns the user to the active call. Leaving the conversation must not itself end the call.
- Missed call: a call event in the relevant conversation/history, without creating a fake chat message.

### Audio call screen

- Minimal screen with participant avatar, display name, clear call state, and elapsed time only after connection.
- Primary controls: mute/unmute, speaker/audio route, and end call.
- Video upgrade is a secondary action, not a competing primary control.
- Show understandable states: calling, ringing, connecting, connected, reconnecting, ended, declined, missed, permission denied, and failed.
- On iOS Safari, audio playback recovery must be user-actionable when browser autoplay rules require a gesture.

### Video call screen

- Remote video is primary; local preview is a small movable picture-in-picture surface.
- Controls: microphone, camera, switch camera where supported, audio route, and end call.
- Audio remains available if video is paused, disabled, or degraded.
- If the network deteriorates, reduce/stop video before sacrificing intelligible audio.

### Group call screen

- Audio-only group calls show participant avatars and a clear active-speaker indicator.
- Video layout adapts to participant count; active speaker can be emphasized.
- Show participant count and per-participant microphone state.
- Do not implement group UI until authorization, room lifecycle, and two-or-more-device tests are complete.

## Audio-first quality policy

1. Use Opus for voice media.
2. Start with audio-only publication/subscription; do not capture or transmit camera media in an audio call.
3. Prefer stable voice over video resolution, frame rate, or visual smoothness.
4. On constrained networks, reduce video bitrate/resolution/frame rate and unsubscribe from nonessential video before changing audio behavior.
5. Avoid unnecessary background work, repeated polling, and chat-list refreshes during a call.
6. Keep microphone capture and audio playback lifecycle explicit; every hangup, rejection, sign-out, failed connection, or cancelled permission prompt must release local tracks.
7. Collect only privacy-conscious technical metrics: setup duration, reconnect duration, RTT, jitter, packet loss, selected ICE/TURN path, and browser/device/network category. Never collect call content or record calls for routine diagnostics.

### Measurement bands for pilot evaluation

These are engineering evaluation bands, not guarantees or claims about every network:

| Metric | Good target | Degraded | Poor / investigate |
|---|---:|---:|---:|
| Round-trip time | under 150 ms | 150–300 ms | over 300 ms |
| Jitter | under 30 ms | 30–50 ms | over 50 ms |
| Packet loss | under 2% | 2–5% | over 5% |
| Call setup | under 5 s | 5–10 s | over 10 s |

Record real observations rather than marking a test successful from a single call. A call passes only when both participants can understand speech continuously, not merely when the room reports connected.

## Technical module boundaries

The intended client-side separation is:

- `call-ui`: renders audio/video/incoming-call surfaces and forwards user actions.
- `call-session`: owns one call lifecycle and its state transitions.
- `call-transport-livekit`: wraps the pinned LiveKit SDK; no UI or chat navigation logic.
- `call-quality`: reads supported WebRTC/LiveKit statistics and emits coarse quality states.
- `call-notifications`: handles foreground incoming-call signals and supported notification flows; must not promise reliable iOS background ringing until proven.
- Existing chat code: provides only the authenticated user, selected peer/group identity, and entry-point action. It does not own media tracks or the LiveKit room.

The public integration surface should be small and versioned, for example a single `FarnazCall.createSession(...)` factory returning explicit `connect`, `disconnect`, mute, camera, and state methods. Do not expose raw SDK objects to chat code.

## Server-side authorization

- Supabase Auth identifies the user; the server independently validates the user JWT.
- For a one-to-one call, the token request must carry an existing `callSessionId`. The server must load that `call_sessions` row through the authenticated user's Supabase context and verify the caller is exactly `caller_id` or `receiver_id`, the session is in an allowed live state (`ringing` or `active`), and the room name is derived server-side from that session ID. The client must never choose the room name.
- For a group call, a token may be issued only when the requested `spaces.id` exists, `spaces.type = 'group'`, and `space_members` contains the authenticated user for that group.
- Never trust a client-supplied room name, profile metadata, or client-side group roster as authorization. Keep the direct-call and group-call authorization branches explicit and mutually exclusive.
- LiveKit API credentials remain server-side. Participant tokens are short-lived, room-scoped, and never persisted in local storage or IndexedDB.
- Re-check actual schema and RLS before deployment. Do not add broad RLS policies to make the call feature work.

### Known implementation gap

The experimental `livekit-token` function and `js/livekit-calls.js` adapter now accept either a direct `callSessionId` or a group `spaceId`, never both. Direct-call token authorization checks the authenticated participant, live session status, and matching call type; the room name is derived server-side. Adapter tests cover direct audio requests, ambiguous targets, and response call-type mismatch. The function is still not deployed, and its authorization path has not yet been exercised through live Supabase requests.

The media adapter is separate from the invitation/ringing system. A new experimental `js/livekit-call-sessions.js` module owns creation, incoming-call recovery, answer, reject, missed timeout, and hangup transitions against the existing `call_sessions` table. It revalidates the authenticated user, uses the existing RLS and database transition triggers, and reconciles the row after subscribing to Realtime to close the subscribe race. A separate `js/livekit-call-controller.js` now orchestrates the session manager and media adapter: outgoing callers join silently with microphone publication disabled, the receiver connects from the answer action, and the caller publishes audio only after acceptance. Both modules have dedicated tests and remain unloaded by the PWA. They do not reuse the legacy SDP/ICE flow. The remaining work is to complete the SDK artifact verification, deploy/test the token service and LiveKit host, and then build the feature-flagged call UI. The legacy path remains untouched and active.

## Connectivity and deployment

- Pilot one self-hosted LiveKit region first; add regions only when measurements justify the added complexity.
- Test UDP media and a supported TURN/TLS TCP fallback. TURN is a connectivity fallback, not a promise that every restrictive network can connect.
- Verify domain, TLS, ports, provider UDP support, bandwidth/egress costs, health checks, capacity, credential rotation, and log retention before public exposure.
- No production host has been selected or deployed yet.
- Reachability from Iran must be tested on actual Iranian mobile and fixed-line operators. Do not infer reachability from a server's geographic region or a successful European test.

## Acceptance gates

### Gate A — one-to-one audio
- Two-way voice on iOS Safari/PWA and desktop.
- Clear permission-denied and autoplay-recovery behavior.
- No stuck microphone after cancel, decline, hangup, sign-out, tab close, or connection failure.
- Reconnect and network handover behavior documented.
- Weak-network tests demonstrate intelligible voice with measured RTT, jitter, and loss.
- UDP and TURN/TLS fallback are separately observed where available.

### Gate B — one-to-one video
- Video can be upgraded from an active audio call without losing the audio session.
- Video degrades before audio under constrained bandwidth.
- Camera permission, camera switch, and camera-off behavior are tested.

### Gate C — group audio/video
- Only authorized group members can obtain room tokens.
- Room lifecycle handles simultaneous join/leave, participant disconnect, and owner/member permissions.
- Multi-participant audio remains intelligible under realistic load.
- Group video adapts to participant count and network capacity.

### Gate D — rollout
- Service worker caches the optional SDK without moving it onto the critical startup path.
- Full regression tests pass for login, chat navigation, private calls, and group/channel pages.
- Feature flag remains off by default until pilot sign-off.
- Merge to `main` requires explicit review and user approval.

## Current audit baseline (2026-10-30)

- The current production `js/calls.js` implements one-to-one WebRTC signaling through `call_sessions` and `call_signals`.
- Its peer connection currently configures public Google STUN servers and no TURN server.
- The database contains `call_sessions` and `call_signals`; both have RLS enabled. Existing policies scope call reads/signals to participants and restrict call initiation to contacts. Two existing `call_sessions` triggers protect participant/type identity and enforce allowed status transitions; these were inspected read-only.
- `spaces` and `space_members` exist with the expected `id/type` and `space_id/user_id` fields. The token function must still be tested against real membership and group/channel cases.
- No Supabase Edge Functions are currently deployed in the connected Farnaz project.
- The LiveKit adapter and lazy loader exist only on `feature/farnaz-call-infrastructure`; neither is loaded by the production app.
- The SDK executable bundle is not yet committed because the npm registry's published integrity value has not yet been independently matched to the inspected tarball.
- CI for commit `05c2375f48d99cbbe5e5cf2fab61e3eff20707fa` completed successfully, including JavaScript syntax, application structure, security invariants, adapter tests, and Deno type-check. This is static validation, not a live call test.
