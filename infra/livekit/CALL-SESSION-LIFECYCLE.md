# Isolated call-session lifecycle

Status: experimental and not loaded by the PWA.

`js/livekit-call-sessions.js` owns the invitation lifecycle only. It does not capture media, create SDP/ICE offers, connect to LiveKit, render UI, or modify the existing `js/calls.js` path.

## Public API

Create a manager with the authenticated Supabase client and the current account ID:

```js
const sessions = window.FarnazCallSessions.create({
  supabase,
  userId: currentUser.id,
  onEvent(event) {
    // Handle: inbox-ready, incoming, outgoing, accepted,
    // incoming-while-busy, finished, error, closed.
  }
});

await sessions.watchIncoming();
const session = await sessions.start({
  peerId: contactUserId,
  callType: "audio"
});

// Receiver actions:
await sessions.answer();
await sessions.reject();

// Either participant:
await sessions.end();

// On sign-out, first end an active session if appropriate, disconnect the media adapter, then dispose subscriptions:
await sessions.close();
```

The manager re-validates the signed-in account through `supabase.auth.getUser()` before sensitive operations. It writes only the existing `call_sessions` table and relies on the existing RLS policies and database transition triggers. It never writes `call_signals`, SDP, ICE candidates, or LiveKit tokens.

## Lifecycle rules

- Only the caller creates a `ringing` row.
- Only the receiver may change `ringing` to `active` or `rejected`.
- Either participant may change `ringing` or `active` to `ended`.
- The caller may mark a still-ringing invitation `missed` after the ringing timeout.
- Participant IDs and call type are read from the server-returned row; the manager does not accept a client-selected room name.
- The manager subscribes to the call row before reconciling its current database state, avoiding the gap between row creation and Realtime subscription.
- Incoming invitations are recovered after reconnect from recent ringing rows, within a bounded recovery window.
- The module is isolated and is not referenced by `index.html`; it cannot affect normal app startup.

## Important boundary

This module is not yet connected to the LiveKit media adapter or to the visible call UI. The next integration step must create one orchestration layer that:

1. Starts or accepts the session with this manager.
2. Passes the returned `callSessionId` to `FarnazLiveKitCalls.create({ callSessionId, callType, ... })`.
3. Connects both participants to the same server-derived room.
4. Calls `disconnect()` on the media adapter before ending/closing the call session.
5. Releases media and removes subscriptions on every terminal path.

Do not use this new manager together with the legacy `window.startCall` path for the same call. The old path remains active until a feature-flagged end-to-end pilot has passed.
