# Farnaz Call Infrastructure Plan

## Goals
- Reliable one-to-one and group audio/video calls.
- Preserve intelligible audio as network quality degrades.
- Support users inside and outside Iran, subject to real network reachability.
- Keep media infrastructure self-hosted and keep authorization under Farnaz's control.
- Avoid regressions in the existing messaging PWA.

## Current baseline (repository inspection, 2026-10-30)
- The app is a static HTML/CSS/JavaScript PWA using Supabase.
- `js/calls.js` implements one-to-one WebRTC signaling using Supabase Realtime and the `call_sessions` / `call_signals` tables.
- The current peer connection uses public Google STUN servers only; no TURN server is configured.
- Group calls are not implemented.
- The README says the call signaling migrations are not a complete historical migration baseline; do not use the migrations folder alone to bootstrap a new Supabase project.

## Target architecture
- Client: existing Farnaz PWA; integrate through a small, isolated call adapter.
- Identity and authorization: Supabase Auth and server-side token issuance. Never expose a LiveKit API secret or Supabase service-role key in browser code.
- Media: self-hosted LiveKit SFU, initially one region for a measured pilot.
- Connectivity: STUN/TURN with UDP first and TURN/TLS over TCP 443 as a fallback where technically reachable.
- Quality: Opus audio; adaptive bitrate, simulcast and sensible participant/subscription limits for video; audio-first degradation policy.
- Operations: health checks, metrics, logs with privacy-conscious retention, capacity limits, and documented recovery procedures.

## Deployment strategy
1. Audit the existing call schema, RLS policies, Realtime subscriptions, and client lifecycle before changing code.
2. Select one low-cost pilot server only after verifying provider terms, traffic pricing, public IP, required UDP ports, and support for TURN/TLS.
3. Deploy a non-production LiveKit instance and test from multiple networks and devices.
4. Add a server-side authenticated token endpoint. Validate the user's Supabase JWT and group membership on the server before issuing room-scoped, short-lived tokens.
5. Implement one-to-one LiveKit calls behind a feature flag and test against the current WebRTC path.
6. Implement group rooms and participant permissions after the pilot is stable.
7. Add a second region only after measurements show it improves reachability or latency. A second region does not automatically provide seamless room failover; room placement and cross-region behavior must be designed and tested explicitly.

## Acceptance tests
- Audio-only call works on supported iOS Safari/PWA and desktop browsers.
- Video adapts down when bandwidth is constrained; audio remains prioritized.
- Calls work with UDP and with TURN/TLS fallback when the network permits it.
- Call setup, permission denial, reject, hangup, app backgrounding, reconnect, and user sign-out release media resources correctly.
- A user outside a group cannot obtain a token for its call room.
- Two-device and multi-participant tests cover latency, jitter, packet loss, and network switching.
- No secrets are committed to the repository or exposed to the client.

## Important limits
No architecture can guarantee calls when the network is fully disconnected or when every available route is blocked. Reachability from Iran must be tested on real Iranian mobile and fixed-line operators; geographic location alone does not prove a service is unfiltered or reachable.
