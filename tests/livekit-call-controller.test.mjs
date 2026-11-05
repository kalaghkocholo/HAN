import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync("js/livekit-call-controller.js", "utf8");
const callSession = {
  id: "c12f3456-7890-4123-8123-123456789abc",
  caller_id: "a12f3456-7890-4123-8123-123456789abc",
  receiver_id: "b12f3456-7890-4123-8123-123456789abc",
  call_type: "audio",
  status: "ringing"
};

function setup({ role = "caller", acceptedDuringConnect = false, disconnectDelayMs = 0, callType = "audio" } = {}) {
  const context = { console, Promise, setTimeout, clearTimeout };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "js/livekit-call-controller.js" });

  let sessionEvent = null;
  const testSession = { ...callSession, call_type: callType };
  let managerState = {
    role,
    status: "ringing",
    session: { ...testSession }
  };
  const order = [];
  const mediaOptions = [];
  const mediaInstances = [];

  const sessionManager = {
    async start() {
      order.push("session-start");
      return { ...testSession };
    },
    async watchIncoming() { order.push("watch-incoming"); return true; },
    async answer() {
      order.push("session-answer");
      managerState = { ...managerState, status: "active", session: { ...managerState.session, status: "active" } };
      sessionEvent({ type: "accepted", role: "receiver", session: managerState.session });
      return managerState.session;
    },
    async reject() {
      order.push("session-reject");
      managerState = { status: "idle", role: null, session: null };
      sessionEvent({ type: "finished", status: "rejected", session: testSession, role: "receiver" });
    },
    async end() {
      order.push("session-end");
      const previous = managerState;
      managerState = { status: "idle", role: null, session: null };
      sessionEvent({ type: "finished", status: "ended", session: previous.session, role: previous.role });
    },
    async close() { order.push("session-close"); managerState = { status: "idle", role: null, session: null }; },
    getState() { return { ...managerState }; }
  };

  const controller = context.FarnazCallController.create({
    supabase: {},
    userId: callSession.caller_id,
    loadSdk: async () => ({ Room: function FakeRoom() {} }),
    sessionFactory: options => { sessionEvent = options.onEvent; return sessionManager; },
    mediaFactory: options => {
      mediaOptions.push(options);
      const state = { connected: false, microphoneEnabled: false, cameraEnabled: false, disposed: false };
      const instance = {
        async connect() {
          order.push("media-connect");
          if (acceptedDuringConnect) {
            managerState = { ...managerState, status: "active", session: { ...managerState.session, status: "active" } };
            sessionEvent({ type: "accepted", role: "caller", session: managerState.session });
          }
          state.connected = true;
          state.microphoneEnabled = Boolean(options.publishMicrophoneOnConnect);
          state.cameraEnabled = Boolean(options.publishCameraOnConnect);
        },
        async setMicrophoneEnabled(enabled) {
          order.push("microphone-" + enabled);
          state.microphoneEnabled = Boolean(enabled);
        },
        async setCameraEnabled(enabled) {
          order.push("camera-" + enabled);
          state.cameraEnabled = Boolean(enabled);
        },
        async startAudioPlayback() { return true; },
        async disconnect() {
          order.push("media-disconnect");
          if (disconnectDelayMs) await new Promise(resolve => setTimeout(resolve, disconnectDelayMs));
          state.connected = false;
          state.disposed = true;
        },
        getState() { return { ...state }; }
      };
      mediaInstances.push(instance);
      return instance;
    }
  });

  return { controller, sessionManager, mediaOptions, mediaInstances, order, fire: event => sessionEvent(event) };
}

test("outgoing caller joins silently and publishes microphone only after acceptance", async () => {
  const h = setup({ role: "caller", acceptedDuringConnect: true });
  await h.controller.start({ peerId: callSession.receiver_id, callType: "audio" });

  assert.equal(h.mediaOptions[0].publishMicrophoneOnConnect, false);
  assert.equal(h.mediaInstances[0].getState().connected, true);
  assert.equal(h.mediaInstances[0].getState().microphoneEnabled, true);
  assert.ok(h.order.indexOf("media-connect") < h.order.indexOf("microphone-true"));
  assert.equal(h.controller.getState().status, "active");
  await h.controller.close();
});

test("outgoing video caller enables microphone and camera after acceptance during connection", async () => {
  const h = setup({ role: "caller", acceptedDuringConnect: true, callType: "video" });
  await h.controller.start({ peerId: callSession.receiver_id, callType: "video" });

  assert.equal(h.mediaOptions[0].publishMicrophoneOnConnect, false);
  assert.equal(h.mediaOptions[0].publishCameraOnConnect, false);
  assert.equal(h.mediaInstances[0].getState().microphoneEnabled, true);
  assert.equal(h.mediaInstances[0].getState().cameraEnabled, true);
  assert.ok(h.order.indexOf("media-connect") < h.order.indexOf("microphone-true"));
  assert.ok(h.order.indexOf("microphone-true") < h.order.indexOf("camera-true"));
  await h.controller.close();
});

test("outgoing video caller enables camera when acceptance arrives after connection", async () => {
  const h = setup({ role: "caller", callType: "video" });
  await h.controller.start({ peerId: callSession.receiver_id, callType: "video" });
  await h.fire({ type: "accepted", role: "caller", session: { ...callSession, call_type: "video", status: "active" } });

  assert.equal(h.mediaInstances[0].getState().microphoneEnabled, true);
  assert.equal(h.mediaInstances[0].getState().cameraEnabled, true);
  await h.controller.close();
});

test("receiver connects microphone from answer action before changing session to active", async () => {
  const h = setup({ role: "receiver" });
  await h.controller.answer();

  assert.equal(h.mediaOptions[0].publishMicrophoneOnConnect, true);
  assert.equal(h.mediaInstances[0].getState().microphoneEnabled, true);
  assert.ok(h.order.indexOf("media-connect") < h.order.indexOf("session-answer"));
  assert.equal(h.controller.getState().status, "active");
  await h.controller.close();
});

test("remote call completion releases the local media room", async () => {
  const h = setup({ role: "caller" });
  await h.controller.start({ peerId: callSession.receiver_id, callType: "audio" });
  h.fire({ type: "finished", status: "ended", session: callSession, role: "caller" });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(h.mediaInstances[0].getState().connected, false);
  assert.equal(h.mediaInstances[0].getState().disposed, true);
  await h.controller.close();
});

test("ignores a late terminal event from a different call session", async () => {
  const h = setup({ role: "caller" });
  await h.controller.start({ peerId: callSession.receiver_id, callType: "audio" });
  h.fire({
    type: "finished",
    status: "ended",
    role: "caller",
    session: { ...callSession, id: "d12f3456-7890-4123-8123-123456789abc" }
  });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(h.mediaInstances[0].getState().connected, true);
  await h.controller.end();
  await h.controller.close();
});

test("explicit end closes media and session lifecycle", async () => {
  const h = setup({ role: "caller", disconnectDelayMs: 25 });
  await h.controller.start({ peerId: callSession.receiver_id, callType: "audio" });
  await h.controller.end();

  assert.equal(h.mediaInstances[0].getState().connected, false);
  assert.equal(h.mediaInstances[0].getState().disposed, true);
  assert.ok(h.order.includes("session-end"));
  assert.ok(h.order.includes("media-disconnect"));
  await h.controller.close();
});
