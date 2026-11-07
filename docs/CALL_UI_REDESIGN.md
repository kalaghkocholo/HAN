# HAN Voice and Video Call UI

## Status

The redesigned LiveKit call surface is implemented on `main` and remains behind the explicit `?livekitPilot=1` rollout flag. The legacy call path remains the default until real-device acceptance tests pass. Do not remove the pilot gate or switch the default call path based only on unit tests.

## Product goals

- Keep voice quality and call continuity ahead of visual effects.
- Use one visual system for voice and video calls.
- Keep the call screen focused, calm, and usable one-handed.
- Never display a control as successful unless the underlying browser/SDK operation succeeds.
- Keep the interface truthful about browser and iOS limitations.

## Screen structure

### Shared shell

- Full-screen call surface with safe-area-aware top and bottom spacing.
- Compact header with contact name and live call state.
- Dedicated media stage.
- Separate accessible status announcements.
- Fixed control area with large touch targets.
- Reduced-motion support and visible keyboard focus.

### Voice call

- Contact profile photo or initials fallback.
- Connection state and elapsed call duration.
- Microphone control.
- Audio-output control.
- One distinct end-call action.

### Video call

- Remote participant video occupies the main stage.
- Local camera preview is shown as a movable-style picture-in-picture surface (currently fixed to the upper corner).
- Camera on/off and front/back camera controls.
- Microphone, audio-output, and end-call controls.
- Remote video and local preview are independently attached and released.

## Media behavior

- LiveKit remains the media transport for the pilot.
- The adapter keeps the outgoing microphone disabled until the receiver accepts.
- The media adapter exposes the real local camera track and uses LiveKit's active-device switching for camera changes and supported audio-output changes.
- LiveKit adaptive stream and dynacast options remain enabled.
- Connection quality changes and reconnecting/reconnected events are surfaced in the UI.
- Audio session type is set to `play-and-record` when microphone capture begins and reset when the call ends.

## iOS audio-output limitation

Safari on iOS does not provide a consistently reliable web API for forcing the receiver/speaker route. WebKit has had cases where `setSinkId()` resolves successfully while a single-track WebRTC audio stream remains on the previous output. The UI therefore does not claim that the speaker was switched on iPhone; it directs the user to the iOS system audio route controls. On browsers that expose a supported output-selection API, the UI requests the change through LiveKit and only reports success after the operation resolves.

This is an explicit compatibility safeguard, not a missing visual button.

## Security and privacy

- No call recording is added.
- The browser never receives LiveKit API secrets; it requests short-lived participant tokens from the authenticated Supabase Edge Function.
- Call controls do not claim end-to-end encryption unless the media encryption/key-verification design is separately implemented and audited.
- The pilot continues to use the existing direct-call session authorization and block checks.
- No Supabase settings or schema were changed as part of this UI work.

## Current scope and limitations

- Direct one-to-one calls only.
- Group calls, screen sharing, captions, background effects, and call handoff are not part of this UI phase.
- Picture-in-picture is currently an in-call local preview; native iOS system Picture in Picture is not claimed.
- Background incoming-call reliability on iOS PWA is not claimed; this needs a separate push/background capability review.
- The pilot flag remains enabled only by URL query parameter until real-device tests pass.

## Automated verification

The GitHub Actions validation run for commit `0a668c5ebd0c87edb4772138f2c471c53318a06d` completed successfully, including:
- JavaScript syntax and application-structure validation.
- Call-infrastructure security invariants and token endpoint type-check.
- LiveKit adapter tests, including camera switching and audio-output routing.
- Call-session and controller tests.
- Existing viewport, private-chat, and outbox test suites.

Automated tests do not prove real iPhone audio routing, camera permissions, two-account call delivery, or weak-network quality.

## Real-device acceptance checklist

1. Two signed-in accounts on two physical devices can call each other in both directions.
2. Incoming call can be answered and declined; unanswered calls time out correctly.
3. Voice call audio is intelligible on speaker, receiver, wired headset, and Bluetooth where available.
4. iPhone audio-route behavior is checked manually in Safari and installed PWA; no false speaker-success state is accepted.
5. Microphone mute/unmute takes effect on the remote device.
6. Video call shows remote video and local preview; camera mute and front/back switching work.
7. Permission denial, camera unavailable, and microphone unavailable produce recoverable errors.
8. Wi-Fi to cellular handoff, short network loss, high latency, jitter, and packet loss are tested.
9. End call, sign-out, and remote hangup release microphone/camera tracks and close the room.
10. Safari browser and Home Screen PWA are tested separately.

## Release gate

Keep `livekitPilot=1` required until the real-device checklist is completed and any issues are fixed. Vercel deployment must also be confirmed against the exact main commit before treating this as the live production call UI.
