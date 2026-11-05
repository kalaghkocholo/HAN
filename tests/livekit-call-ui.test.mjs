import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../js/livekit-call-ui.js", import.meta.url), "utf8");

function createHarness() {
  const events = [];
  const controller = {
    async watchIncoming() { events.push("watchIncoming"); },
    async close() { events.push("close"); }
  };
  const window = {
    document: { getElementById() { return null; } },
    FarnazCallController: {
      create(options) {
        events.push({ type: "create", userId: options.userId, hasEventHandler: typeof options.onEvent === "function" });
        return controller;
      }
    }
  };
  const context = {
    window,
    getClient() { return { auth: {} }; },
    currentUser: { id: "user-a" },
    currentChatUser: { user_id: "user-b" },
    english: false,
    console
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "livekit-call-ui.js" });
  return { ui: window.FarnazLiveKitCallUI, events };
}

test("creates one incoming-call controller and watches invitations for the signed-in user", async () => {
  const { ui, events } = createHarness();
  await ui.setUser("user-a");
  assert.deepEqual(events, [
    { type: "create", userId: "user-a", hasEventHandler: true },
    "watchIncoming"
  ]);
  await ui.setUser("user-a");
  assert.equal(events.filter(event => typeof event === "object").length, 1);
});

test("closes the previous call controller on sign-out", async () => {
  const { ui, events } = createHarness();
  await ui.setUser("user-a");
  await ui.setUser(null);
  assert.equal(events.at(-1), "close");
});
