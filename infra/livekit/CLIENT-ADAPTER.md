# Isolated LiveKit client adapter

File: `js/livekit-calls.js`

## Purpose

This adapter is intentionally separate from `js/calls.js`. It does not change or replace the current private WebRTC call flow and is not loaded during the default app startup. Its SDK, adapter, session manager, controller, and call UI load only when the explicit pilot flag is enabled; that flag is currently `false`.

It expects:
- the existing authenticated Supabase client;
- the existing `livekit-token` Edge Function;
- the pinned LiveKit JavaScript client SDK version 2.23.0, served from a same-origin local asset;
- a user-initiated action to call `connect()`, so iOS Safari can show microphone/camera permission prompts.

The adapter does not download third-party scripts automatically. This avoids adding a new CDN dependency to every Farnaz startup and avoids silently depending on CDN reachability in restrictive networks. The lazy loader is implemented in `js/livekit-sdk-loader.js` and only requests `./vendor/livekit/livekit-client-2.23.0.umd.js` after an explicit call to `FarnazLiveKitSdk.load()`. It is not included in the default startup path; it is loaded only behind the disabled pilot flag. The Apache-2.0 license notice is committed under `vendor/livekit/LICENSE`. The executable vendor bundle is committed at the exact path and its npm integrity and SHA-256 were verified. Do not enable the feature until the token endpoint and LiveKit host are deployed in a controlled pilot and real-device tests pass.

## Example integration contract

```js
const session = window.FarnazLiveKitCalls.create({
  supabase: getClient(),
  callSessionId: activeDirectCallSessionId, // direct calls; use spaceId for group calls
  callType: "audio", // or "video"
  onEvent(event) {
    // Connect these events to a dedicated call UI only after UI review.
    console.log("call event", event.type);
  }
});

await session.connect(); // call from a user tap/click handler
// Optional controls:
await session.setMicrophoneEnabled(false);
await session.setCameraEnabled(false); // video sessions only
await session.startAudioPlayback(); // if Safari requires a user gesture
await session.disconnect();
```

The existing call buttons route to the new UI only when `window.FARNAZ_LIVEKIT_CALLS_ENABLED` is explicitly changed to `true`. It is currently `false`, so the legacy WebRTC path remains active.

## Current capabilities

- Authenticates through the current Supabase session and calls `livekit-token`.
- Never stores participant tokens in local storage or IndexedDB.
- Joins only the server-authorized room returned by the token endpoint.
- Enables adaptive stream and dynacast.
- Exposes track, participant, reconnect, audio-playback and device-error events.
- Explicitly disconnects and releases room media on teardown.

## Remaining work before activation

1. Complete mocked UI/controller tests and review the full diff for lifecycle edge cases.
2. Deploy the Edge Function to a non-production configuration and configure server-only LiveKit secrets.
3. Provision a private pilot LiveKit host with TLS, TURN/TLS, firewall rules, and monitoring.
4. Run tests on iOS Safari/PWA, desktop, two devices, weak bandwidth and target mobile networks.
5. Only then consider enabling the pilot flag for a small test group. Keep the legacy one-to-one path available until the new path passes acceptance tests.


## SDK pin and loader status

- Upstream package: [`livekit-client`](https://www.npmjs.com/package/livekit-client), exact version `2.23.0` (Apache-2.0).
- Browser bundle format: UMD; upstream documentation states it exposes `LivekitClient` globally.
- Loader: `js/livekit-sdk-loader.js`; explicit lazy load only, same-origin relative path, no CDN fallback, request de-duplication, bounded timeout, API-shape validation.
- Required asset path: `vendor/livekit/livekit-client-2.23.0.umd.js`.
- Asset status: **committed and integrity-verified**. The SDK remains lazy-loaded only after the pilot flag is enabled and a user starts or answers a call.
- Before committing the bundle, verify its SHA-256 against the official package artifact, retain the Apache-2.0 license text, measure compressed/uncompressed size, and test service-worker offline caching.
