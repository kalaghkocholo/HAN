# Farnaz call infrastructure test matrix

Do not mark a test as passed until it has been run and its result recorded. Local/LAN success is not evidence of reachability from Iran or from restrictive mobile networks.

| ID | Scenario | What to record | Pass condition |
|---|---|---|---|
| L-01 | LiveKit starts locally | OS, server version, startup logs | Starts without configuration or port errors |
| L-02 | Two browsers on one device/network | Browser versions, connect and disconnect | Both participants join and leave cleanly |
| L-03 | Two devices on same Wi-Fi | Device/browser, media path | Bidirectional audio; video when enabled |
| L-04 | Microphone/camera permission denied | Browser and permission state | Clear user-facing error; no stuck call state |
| L-05 | Caller cancels during permission prompt | Timing and resource state | Tracks stop; later permission grant cannot resurrect call |
| L-06 | Bandwidth constrained | Approximate bandwidth, RTT, loss, audio/video behavior | Audio remains intelligible; video quality degrades gracefully |
| L-07 | Wi-Fi to mobile data handover | Network, outage duration, reconnect time | Reconnects or reports a clear failure; no leaked microphone/camera |
| L-08 | UDP unavailable, TCP/TURN fallback | Firewall rules and ICE/connection logs | Call connects through a supported fallback |
| L-09 | Unauthorized room join attempt | User role, room, response | Token issuance is denied server-side |
| L-10 | User not in a group requests group token | Membership fixture and response | Request is denied; no token is returned |
| L-11 | Sign out during a call | UI and media-track state | Media stops and room session is disconnected |
| L-12 | Iranian mobile/fixed-line networks | Operator, access technology, region, date, RTT/jitter/loss | Results recorded per network; no generalized reachability claim from a single test |
| L-13 | Direct-call invitation and answer lifecycle | Caller/receiver IDs, session status sequence, realtime events | Caller creates ringing session; receiver alone can answer/reject; both participants can end |
| L-14 | Missed-call timeout and reconnect recovery | Ring duration, app suspension/reopen timing, final DB status | Unanswered call becomes missed; recent ringing invitations are recovered without duplicate incoming UI |
| L-15 | Direct-call token authorization | Caller, receiver, nonparticipant, ended session, mismatched call type | Only a participant in a ringing/active matching session receives a room-scoped token |
| L-16 | Audio-first publish sequence | Caller/receiver event order and microphone state | Caller joins muted while ringing; receiver publishes on answer; caller publishes only after acceptance |
| A-01 | Isolated lifecycle/controller/adapter/SDK-loader unit tests | GitHub Actions run URL and commit SHA | Session, controller, adapter, and loader tests pass for outgoing, incoming, recovery, answer, reject, end, identity mismatch, timeout, and muted-room join |
| A-02 | Feature-gated call UI lifecycle | GitHub Actions run URL and commit SHA | UI creates one incoming-call controller per signed-in user and closes it on sign-out; pilot flag remains off by default |

For quality runs, record at minimum setup time, round-trip time (where measurable), jitter, packet loss, reconnect duration, device model, browser version, and whether audio/video remained usable. Do not collect message content or record calls for routine diagnostics.

## Test status

Automated unit/validation checks are running in GitHub Actions; run #1206 passed 27 tests and static/security validation on commit 823e9f7. This does not mark any device/network scenario above as passed. Real-device tests still require a deployed token function, a LiveKit server, and joining from the listed devices and networks.
