import { readFileSync, existsSync } from "node:fs";

const errors = [];
const read = (path) => {
  if (!existsSync(path)) {
    errors.push("Missing required infrastructure file: " + path);
    return "";
  }
  return readFileSync(path, "utf8");
};
const requireCheck = (condition, message) => {
  if (!condition) errors.push(message);
};

const fn = read("supabase/functions/livekit-token/index.ts");
const config = read("supabase/config.toml");
const envExample = read("infra/livekit/.env.example");
const plan = read("docs/call-infrastructure-plan.md");
const tokenDocs = read("infra/livekit/TOKEN-ENDPOINT.md");
const adapter = read("js/livekit-calls.js");
const sessions = read("js/livekit-call-sessions.js");
const controller = read("js/livekit-call-controller.js");
const callUi = read("js/livekit-call-ui.js");
const calls = read("js/calls.js");
const appHtml = read("index.html");
const adapterDocs = read("infra/livekit/CLIENT-ADAPTER.md");
const sessionDocs = read("infra/livekit/CALL-SESSION-LIFECYCLE.md");
const controllerDocs = read("infra/livekit/CALL-CONTROLLER.md");

requireCheck(fn.includes("supabase.auth.getUser(userJwt)"),
  "Token endpoint must validate the caller's JWT with Supabase Auth.");
requireCheck(fn.includes('.from("space_members")') &&
  fn.includes('.eq("space_id", spaceId)') &&
  fn.includes('.eq("user_id", userId)'),
  "Token endpoint must check the authenticated user's actual group membership.");
requireCheck(fn.includes('space.type !== "group"'),
  "Token endpoint must reject channels and non-group spaces.");
requireCheck(fn.includes('.from("call_sessions")') &&
  fn.includes('.eq("id", callSessionId)') &&
  fn.includes('callSession.status !== "ringing"') &&
  fn.includes('callSession.status !== "active"') &&
  fn.includes('callSession.caller_id !== userId') &&
  fn.includes('callSession.receiver_id !== userId'),
  "Token endpoint must authorize direct calls only for a participant in a live call session.");
requireCheck(fn.includes('ttl: "5m"') && fn.includes("roomJoin: true") &&
  fn.includes("room: roomName"),
  "Tokens must be short-lived and restricted to one named room.");
requireCheck(!/roomAdmin\s*:\s*true/.test(fn),
  "Unexpected privileged LiveKit grant found.");
requireCheck(fn.includes('"Cache-Control": "no-store"'),
  "Token responses must not be cacheable.");
requireCheck(fn.includes("FARNAZ_ALLOWED_ORIGINS") &&
  fn.includes("DEFAULT_ALLOWED_ORIGINS"),
  "Token endpoint must maintain an explicit browser-origin allowlist.");
requireCheck(config.includes('[functions.livekit-token]') &&
  config.includes("verify_jwt = false") &&
  fn.includes("supabase.auth.getUser(userJwt)"),
  "If gateway JWT verification is disabled, the function itself must validate the bearer JWT.");
requireCheck(envExample.includes("replace_with_server_side_api_key") &&
  envExample.includes("replace_with_long_random_server_side_secret"),
  "Environment template must contain placeholders, not real credentials.");
requireCheck(!/sb_secret_[A-Za-z0-9_-]{16,}/i.test(fn + envExample) &&
  !/sk_live_[A-Za-z0-9_-]{16,}/i.test(fn + envExample),
  "Possible real API credential found in infrastructure source/template.");
requireCheck(plan.includes("No architecture can guarantee calls") &&
  tokenDocs.includes("not deployed by committing this file"),
  "Documentation must state reachability limits and that code commit is not deployment.");

requireCheck(adapter.includes('root.FarnazLiveKitCalls') &&
  adapter.includes('root.LivekitClient') &&
  adapter.includes('supabase.functions.invoke("livekit-token"') &&
  adapter.includes("adaptiveStream: true") &&
  adapter.includes("dynacast: true") &&
  adapter.includes("publishMicrophoneOnConnect"),
  "LiveKit adapter must be isolated, authenticate through Supabase, and enable adaptive media options.");
requireCheck(adapter.includes('integrationStatus: "isolated-adapter-not-enabled"') &&
  adapterDocs.includes("not loaded during the default app startup"),
  "The new adapter must remain disabled until the local SDK and UI are tested.");
requireCheck(calls.includes("window.FARNAZ_LIVEKIT_CALLS_ENABLED===true") &&
  calls.includes("window.FarnazLiveKitCallUI.start(type)") &&
  calls.includes("window.FarnazLiveKitCallUI.setUser(next)") &&
  calls.includes('rpc("start_farnaz_call"') &&
  calls.includes("p_receiver_id:receiverId") &&
  !calls.includes('.from("call_sessions").insert('),
  "Legacy call entry points must delegate to LiveKit only when the explicit pilot flag is enabled.");
requireCheck(callUi.includes("root.FarnazLiveKitCallUI") &&
  callUi.includes("controller.start({ peerId: peerId, callType: callType })") &&
  callUi.includes("controller.answer()") &&
  callUi.includes("controller.reject()") &&
  callUi.includes("controller.setMicrophoneEnabled") &&
  callUi.includes("controller.setCameraEnabled") &&
  callUi.includes("controller.startAudioPlayback") &&
  callUi.includes("farnazLiveKitAudioRoute") &&
  callUi.includes("setSinkId") &&
  callUi.includes("On iPhone, choose speaker or headphones from the system audio controls.") &&
  appHtml.includes("livekit-call-ui.js") &&
  appHtml.includes('new URLSearchParams(window.location.search).get("livekitPilot") === "1"'),
  "The LiveKit call UI must expose incoming/outgoing, mute, audio playback, and video controls behind the disabled pilot flag.");
requireCheck(!/FARNAZ_LIVEKIT_CALLS_ENABLED\s*=\s*true/.test(appHtml),
  "The LiveKit pilot must not be enabled by default.");

requireCheck(!/LIVEKIT_API_SECRET|LIVEKIT_API_KEY/.test(adapter),
  "LiveKit server credentials must never be referenced in browser adapter code.");
requireCheck(sessions.includes("root.FarnazCallSessions") &&
  sessions.includes("async function start(input)") &&
  sessions.includes("async function watchIncoming()") &&
  sessions.includes('async function answer() { return updateStatus("active"); }') &&
  sessions.includes('async function reject() { return updateStatus("rejected"); }') &&
  sessions.includes('async function end() { return updateStatus("ended"); }') &&
  sessions.includes("supabase.auth.getUser()") &&
  sessionDocs.includes("Only the receiver may change") &&
  sessionDocs.includes("does not capture media") &&
  controllerDocs.includes("microphone disabled while the invitation is ringing") &&
  controllerDocs.includes("answer action"),
  "The isolated call-session lifecycle must verify identity and own invitation, answer, reject, and end transitions.");
requireCheck(sessions.includes('integrationStatus: "isolated-session-lifecycle-not-enabled"') &&
  appHtml.includes('new URLSearchParams(window.location.search).get("livekitPilot") === "1"') &&
  appHtml.includes("if(window.FARNAZ_LIVEKIT_CALLS_ENABLED===true)") &&
  appHtml.includes("livekit-call-sessions.js"),
  "The call-session lifecycle must load only behind an explicit, disabled-by-default pilot flag.");
requireCheck(controller.includes("root.FarnazCallController") &&
  controller.includes("function createMedia(session, publishMicrophone)") &&
  controller.includes("publishMicrophoneOnConnect: publishMicrophone") &&
  controller.includes("connectOutgoingMedia(session)") &&
  controller.includes("createMedia(session, false)") &&
  controller.includes("createMedia(state.session, true)") &&
  controller.includes("await instance.setMicrophoneEnabled(true)") &&
  controller.includes("manager.answer()") &&
  controller.includes("manager.reject()") &&
  controller.includes("manager.end()") &&
  controller.includes("root.FarnazLiveKitSdk") &&
  controller.includes('integrationStatus: "isolated-audio-first-controller-not-enabled"') &&
  appHtml.includes("livekit-call-controller.js"),
  "The audio-first controller must keep outgoing microphones muted until acceptance and load only behind the disabled pilot flag.");

if (errors.length) {
  console.error("Call infrastructure validation failed:");
  for (const error of errors) console.error("- " + error);
  process.exitCode = 1;
} else {
  console.log("Call infrastructure validation passed: token auth, direct-call participant checks, group membership, scoped grants, no-store responses, and isolated call-session/media modules.");
}
