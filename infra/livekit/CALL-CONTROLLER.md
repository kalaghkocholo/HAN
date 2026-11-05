# Audio-first call controller

Status: experimental; loaded only when `window.FARNAZ_LIVEKIT_CALLS_ENABLED` is explicitly enabled. The flag is currently `false`.

`js/livekit-call-controller.js` is the orchestration layer between the call-session lifecycle and the LiveKit media adapter. The separate `js/livekit-call-ui.js` module renders the pilot call surface. `js/calls.js` delegates to it only when the flag is enabled; otherwise the legacy WebRTC flow remains unchanged.

## Responsibilities

- Lazily loads the pinned same-origin LiveKit SDK through `FarnazLiveKitSdk.load()`.
- Starts or accepts a direct call through `FarnazCallSessions`.
- Creates the LiveKit media adapter with the server-authorized `callSessionId`.
- Keeps the outgoing caller's microphone disabled while the invitation is ringing.
- When the receiver answers, the caller enables the microphone; if acceptance arrives before the caller's room connection finishes, the controller remembers that state and enables the microphone immediately after connection.
- On the receiver, connects the room and requests microphone access from the answer action before changing the session to `active`. This keeps the permission request tied to a user gesture on iOS.
- Disconnects media when a session finishes, is rejected, is missed, or is explicitly ended.
- Keeps all media and session work outside the message/chat navigation code.

## Public API

```js
const call = window.FarnazCallController.create({
  supabase,
  userId: currentUser.id,
  onEvent(event) {
    // event.type examples:
    // session-incoming, session-outgoing, session-accepted,
    // session-finished, media-connected, media-reconnecting,
    // media-error, media-ready, error
  }
});

await call.watchIncoming();
await call.start({ peerId: contactUserId, callType: "audio" });

// Incoming call actions:
await call.answer();
await call.reject();

// Either participant:
await call.end();

// UI controls:
await call.setMicrophoneEnabled(false);
await call.startAudioPlayback();

// Dispose on sign-out after call cleanup:
await call.close();
```

## Audio-first call sequence

Outgoing caller:
1. Create a `ringing` session.
2. Load the local SDK only after the user starts the call.
3. Join the server-derived room with microphone and camera publication disabled.
4. Wait for the receiver to accept.
5. Enable the microphone only after the session changes to `active`.

Receiver:
1. Receive/recover the ringing invitation.
2. On the explicit answer action, load the local SDK and connect with microphone publication enabled.
3. Change the session to `active`.
4. The caller receives the status update and enables their microphone.

If the receiver accepts while the caller is still connecting, the controller preserves the acceptance state and enables the microphone as soon as the caller's room is ready. If media setup fails, the controller attempts to end the invitation and releases the local media room.

## Current boundary

The controller, session manager, and media adapter are all separate source modules with isolated automated tests. The modules are conditionally loaded by `index.html` only when the pilot flag is enabled; with the current `false` default, the legacy call UI and `window.startCall` path remain active. The local SDK bundle is committed and its package integrity and SHA-256 were verified. The token function and a LiveKit server are not deployed, so real calls cannot yet be exercised.

Do not enable the pilot flag until the deployed token function, LiveKit host, TURN fallback, iOS Safari behavior, and two-device audio/video tests are verified.
