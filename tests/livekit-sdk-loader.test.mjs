import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync("js/livekit-sdk-loader.js", "utf8");

function makeEnvironment({ autoLoad = true, exposeSdk = true } = {}) {
  const scripts = [];
  const timers = new Map();
  let timerId = 0;
  const context = {
    Promise,
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    document: {
      createElement() {
        return { dataset: {}, remove() { this.removed = true; } };
      },
      head: {
        appendChild(script) {
          scripts.push(script);
          if (autoLoad) queueMicrotask(() => {
            if (exposeSdk) context.LivekitClient = {
              Room: function Room() {},
              RoomEvent: { Connected: "connected" },
              Track: { Kind: { Audio: "audio" } }
            };
            script.onload?.();
          });
        }
      }
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "js/livekit-sdk-loader.js" });
  return { context, scripts, timers };
}

test("loads only the pinned same-origin SDK asset and reuses concurrent requests", async () => {
  const { context, scripts } = makeEnvironment();
  const first = context.FarnazLiveKitSdk.load();
  const second = context.FarnazLiveKitSdk.load();
  assert.equal(first, second);
  const sdk = await first;
  assert.equal(typeof sdk.Room, "function");
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, "./vendor/livekit/livekit-client-2.23.0.umd.js");
  assert.equal(scripts[0].async, true);
  assert.equal(context.FarnazLiveKitSdk.version, "2.23.0");
  assert.equal(context.FarnazLiveKitSdk.loadStatus, "lazy-local-only");
});

test("rejects a script that loads without the expected LiveKit API", async () => {
  const { context } = makeEnvironment({ exposeSdk: false });
  await assert.rejects(context.FarnazLiveKitSdk.load(), /expected API was not found/);
});

test("does not create a script when the SDK is already available", async () => {
  const { context, scripts } = makeEnvironment();
  context.LivekitClient = { Room: function Room() {}, RoomEvent: {}, Track: {} };
  const sdk = await context.FarnazLiveKitSdk.load();
  assert.equal(sdk, context.LivekitClient);
  assert.equal(scripts.length, 0);
});
