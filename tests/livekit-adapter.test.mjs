import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync("js/livekit-calls.js", "utf8");
const validSpaceId = "a12f3456-7890-4123-8123-123456789abc";
const validCallSessionId = "b12f3456-7890-4123-8123-123456789abc";

function loadAdapter({ sdk = true } = {}) {
  const context = {
    console,
    navigator: { mediaDevices: { getUserMedia: async () => ({}) } },
    setTimeout,
    clearTimeout,
    Promise
  };
  context.window = context;
  context.globalThis = context;

  const roomInstances = [];
  if (sdk) {
    class FakeRoom {
      constructor(options) {
        this.options = options;
        this.handlers = new Map();
        this.remoteParticipants = new Map();
        this.canPlaybackAudio = true;
        this.localParticipant = {
          setMicrophoneEnabled: async enabled => { this.microphoneEnabled = enabled; },
          setCameraEnabled: async enabled => { this.cameraEnabled = enabled; }
        };
        this.connected = false;
        this.disconnected = false;
        roomInstances.push(this);
      }
      on(name, handler) { this.handlers.set(name, handler); return this; }
      async connect(url, token) { this.url = url; this.token = token; this.connected = true; }
      async disconnect(stopTracks) { this.stopTracks = stopTracks; this.disconnected = true; this.connected = false; }
      async startAudio() { this.canPlaybackAudio = true; }
    }
    context.LivekitClient = {
      Room: FakeRoom,
      Track: { Kind: { Audio: "audio", Video: "video" } },
      RoomEvent: {
        TrackSubscribed: "track-subscribed",
        TrackUnsubscribed: "track-unsubscribed",
        ParticipantConnected: "participant-connected",
        ParticipantDisconnected: "participant-disconnected",
        Reconnecting: "reconnecting",
        Reconnected: "reconnected",
        Disconnected: "disconnected",
        AudioPlaybackStatusChanged: "audio-playback-status",
        MediaDevicesError: "media-device-error"
      }
    };
  }
  vm.runInNewContext(source, context, { filename: "js/livekit-calls.js" });
  return { context, roomInstances };
}

function makeSupabase({ session = true, responseCallType = null } = {}) {
  const calls = [];
  return {
    calls,
    auth: {
      getSession: async () => ({
        data: { session: session ? { access_token: "test-access-token" } : null },
        error: null
      })
    },
    functions: {
      invoke: async (name, options) => {
        calls.push({ name, options });
        return {
          data: {
            token: "short-lived-test-token",
            serverUrl: "wss://calls.example.test",
            roomName: options.body.callSessionId ? "farnaz-direct-" + options.body.callSessionId : "farnaz-group-" + validSpaceId,
            callType: responseCallType || options.body.callType
          },
          error: null
        };
      }
    }
  };
}

test("connects audio call with authenticated token endpoint and adaptive options", async () => {
  const { context, roomInstances } = loadAdapter();
  const supabase = makeSupabase();
  const events = [];
  const call = context.FarnazLiveKitCalls.create({
    supabase, spaceId: validSpaceId, callType: "audio",
    onEvent: event => events.push(event.type)
  });

  await call.connect();
  assert.equal(supabase.calls.length, 1);
  assert.equal(supabase.calls[0].name, "livekit-token");
  assert.deepEqual(JSON.parse(JSON.stringify(supabase.calls[0].options.body)), { spaceId: validSpaceId, callType: "audio" });
  assert.equal(roomInstances.length, 1);
  assert.equal(roomInstances[0].options.adaptiveStream, true);
  assert.equal(roomInstances[0].options.dynacast, true);
  assert.equal(roomInstances[0].microphoneEnabled, true);
  assert.equal(roomInstances[0].cameraEnabled, undefined);
  assert.equal(call.getState().connected, true);
  assert.ok(events.includes("connected"));

  await call.setMicrophoneEnabled(false);
  assert.equal(roomInstances[0].microphoneEnabled, false);
  await call.disconnect();
  assert.equal(roomInstances[0].disconnected, true);
  assert.equal(roomInstances[0].stopTracks, true);
  assert.equal(call.getState().disposed, true);
});

test("connects a one-to-one audio call using only its call session ID", async () => {
  const { context, roomInstances } = loadAdapter();
  const supabase = makeSupabase();
  const call = context.FarnazLiveKitCalls.create({
    supabase, callSessionId: validCallSessionId, callType: "audio"
  });

  await call.connect();
  assert.deepEqual(
    JSON.parse(JSON.stringify(supabase.calls[0].options.body)),
    { callSessionId: validCallSessionId, callType: "audio" }
  );
  assert.equal(roomInstances[0].token, "short-lived-test-token");
  assert.equal(call.getState().callSessionId, validCallSessionId);
  assert.equal(call.getState().spaceId, null);
  await call.disconnect();
});

test("joins a room silently and enables the microphone only after acceptance", async () => {
  const { context, roomInstances } = loadAdapter();
  const call = context.FarnazLiveKitCalls.create({
    supabase: makeSupabase(),
    spaceId: validSpaceId,
    callType: "audio",
    publishMicrophoneOnConnect: false
  });

  await call.connect();
  assert.equal(roomInstances[0].microphoneEnabled, undefined);
  assert.equal(call.getState().localMediaEnabled, false);
  assert.equal(call.getState().microphoneEnabled, false);

  await call.setMicrophoneEnabled(true);
  assert.equal(roomInstances[0].microphoneEnabled, true);
  assert.equal(call.getState().localMediaEnabled, true);
  assert.equal(call.getState().microphoneEnabled, true);
  await call.disconnect();
});

test("enables camera only for a video call", async () => {
  const { context, roomInstances } = loadAdapter();
  const call = context.FarnazLiveKitCalls.create({
    supabase: makeSupabase(), spaceId: validSpaceId, callType: "video"
  });
  await call.connect();
  assert.equal(roomInstances[0].microphoneEnabled, true);
  assert.equal(roomInstances[0].cameraEnabled, true);
  await call.disconnect();
});

test("refuses to connect without a signed-in session", async () => {
  const { context, roomInstances } = loadAdapter();
  const call = context.FarnazLiveKitCalls.create({
    supabase: makeSupabase({ session: false }), spaceId: validSpaceId
  });
  await assert.rejects(call.connect(), /Sign in before joining/);
  assert.equal(roomInstances.length, 0);
});

test("rejects malformed group IDs before requesting a token", async () => {
  const { context, roomInstances } = loadAdapter();
  const supabase = makeSupabase();
  const call = context.FarnazLiveKitCalls.create({ supabase, spaceId: "not-a-uuid" });
  await assert.rejects(call.connect(), /valid call target identifier/);
  assert.equal(supabase.calls.length, 0);
  assert.equal(roomInstances.length, 0);
});

test("rejects ambiguous target IDs before requesting a token", async () => {
  const { context, roomInstances } = loadAdapter();
  const supabase = makeSupabase();
  const call = context.FarnazLiveKitCalls.create({
    supabase, spaceId: validSpaceId, callSessionId: validCallSessionId
  });
  await assert.rejects(call.connect(), /exactly one group ID or direct call session ID/);
  assert.equal(supabase.calls.length, 0);
  assert.equal(roomInstances.length, 0);
});

test("rejects a server response with a mismatched call type", async () => {
  const { context, roomInstances } = loadAdapter();
  const call = context.FarnazLiveKitCalls.create({
    supabase: makeSupabase({ responseCallType: "video" }),
    callSessionId: validCallSessionId,
    callType: "audio"
  });
  await assert.rejects(call.connect(), /invalid or mismatched response/);
  assert.equal(roomInstances.length, 0);
});

test("does not attempt to load an external SDK when the SDK is missing", async () => {
  const { context } = loadAdapter({ sdk: false });
  const call = context.FarnazLiveKitCalls.create({ supabase: makeSupabase(), spaceId: validSpaceId });
  await assert.rejects(call.connect(), /SDK is not loaded/);
});
