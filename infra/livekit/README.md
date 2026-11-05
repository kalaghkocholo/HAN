# Farnaz Call Infrastructure — Local Pilot

This directory is a **development-only starting point** for evaluating self-hosted LiveKit. It does not change the current production call flow and is not a production deployment.

## Why this is separate

The current PWA has a one-to-one WebRTC path using Supabase Realtime signaling. LiveKit is being evaluated as an isolated SFU path for group calls and more controllable media adaptation. Do not remove or redirect the existing call path until the new path passes the acceptance tests in `docs/call-infrastructure-plan.md`.

## Zero-cost local smoke test

Prerequisites: a supported computer with the LiveKit server binary installed. Follow the official [local self-hosting guide](https://docs.livekit.io/transport/self-hosting/local/) for installation.

Run the server in development mode:

```sh
livekit-server --dev --bind 0.0.0.0
```

Development credentials printed/documented by LiveKit are intentionally predictable. They are for local development only. **Never expose this development server to the public internet, never use these credentials in Farnaz production, and never commit real API secrets.**

For a same-computer smoke test, use the local endpoint shown by the server. For another device on the same Wi-Fi, use the host computer's LAN address and confirm the operating-system firewall permits the required LiveKit signaling and media ports. A successful LAN test does not prove that calls work across mobile carriers or restrictive networks.

## Production deployment is a separate step

Do not hand-build a public deployment from this local configuration. Once a host and domain have been selected, use LiveKit's official [VM deployment guide](https://docs.livekit.io/transport/self-hosting/vm/) and its configuration generator. Keep generated secrets and private deployment files on the server or in a secure secret store; commit only sanitized templates.

Before exposing a pilot, verify:
- a domain and publicly trusted TLS certificates;
- public inbound UDP media reachability and the configured TCP fallback;
- TURN/TLS reachability on the configured port (often 443 when no layer-4 load balancer is used);
- provider terms, bandwidth/egress pricing, and any UDP restrictions;
- health checks, log retention, and a process to rotate credentials.

The exact ports depend on the final LiveKit configuration. Use the official [ports and firewall reference](https://docs.livekit.io/transport/self-hosting/ports-firewall/) rather than opening broad port ranges without a reason.

## Security boundary

- LiveKit API secrets belong only on a trusted server.
- The PWA must request short-lived, room-scoped participant tokens from a server endpoint.
- The token endpoint must validate the Supabase user and independently authorize the requested room. A client-supplied room ID or editable profile metadata is not proof of group membership.
- Do not place the Supabase service-role key in browser code.
- Do not issue tokens until the actual group membership schema and authorization policy have been inspected and tested.

## Pinned browser SDK

The self-hosted browser bundle is pinned to `livekit-client@2.23.0` at `vendor/livekit/livekit-client-2.23.0.umd.js`. The bundle was retrieved from the exact npm release, checked against npm's published SHA-512 package integrity, and checked against the independently recorded UMD SHA-256 before being committed. The accompanying `vendor/livekit/LICENSE` and `vendor/livekit/README.md` preserve the package licensing and provenance. Do not replace the bundle without repeating both integrity checks and reviewing the release version.

## Current status

- [x] Architecture and baseline documented.
- [x] Local-only setup and production safety boundary documented.
- [x] Pinned browser SDK bundle retrieved and integrity-verified.
- [ ] Local LiveKit server smoke test run on a developer machine.
- [x] Token endpoint implemented and statically validated (not deployed).
- [x] PWA adapter, call-session controller, and minimal call UI integrated behind a disabled-by-default feature flag.
- [ ] iOS Safari/PWA and multi-network tests passed.
- [ ] Production pilot deployed and reviewed.

This repository-only preparation is free. Running a public media server and moving media traffic can incur hosting and bandwidth costs.
