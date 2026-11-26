import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// Runs the real service-worker.js against an in-memory Cache Storage and a scriptable fetch.
const source = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
const ORIGIN = "https://app.example";

function createWorker({ fetchImpl }) {
  const listeners = {};
  const stores = new Map();
  const keyOf = request => (typeof request === "string" ? request : request.url);
  const open = async name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const map = stores.get(name);
    return {
      async match(request) { const hit = map.get(keyOf(request)); return hit ? hit.clone() : undefined; },
      async put(request, response) { map.set(keyOf(request), response); },
      async addAll(requests) { for (const request of requests) map.set(keyOf(request), await fetchImpl(request)); },
    };
  };
  const caches = {
    open,
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async match(request) { for (const map of stores.values()) { const hit = map.get(keyOf(request)); if (hit) return hit.clone(); } return undefined; },
  };
  const calls = { navigationPreloadEnabled: false, opened: [] };
  const self = {
    location: new URL(`${ORIGIN}/app/service-worker.js`),
    registration: { navigationPreload: { enable: async () => { calls.navigationPreloadEnabled = true; } } },
    clients: { claim: async () => {}, matchAll: async () => [], openWindow: async url => { calls.opened.push(url); } },
    skipWaiting: async () => {},
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
  const context = vm.createContext({
    self, caches, fetch: fetchImpl, Request, Response, URL, Promise, setTimeout, clearTimeout, console, Error,
  });
  vm.runInContext(source, context);
  const dispatch = async (type, event) => {
    const waits = [];
    let responded;
    const full = { ...event, waitUntil: p => waits.push(p), respondWith: p => { responded = p; } };
    listeners[type](full);
    await Promise.all(waits);
    return responded === undefined ? undefined : await responded;
  };
  return { dispatch, stores, calls };
}

const html = body => new Response(body, { status: 200, headers: { "content-type": "text/html" } });
const asset = body => { const r = new Response(body, { status: 200 }); Object.defineProperty(r, "type", { value: "basic" }); return r; };

test("install precaches the shell by bypassing the HTTP cache", async () => {
  const seen = [];
  const worker = createWorker({ fetchImpl: async request => { seen.push(request); return asset("x"); } });
  await worker.dispatch("install", {});
  assert.ok(seen.length > 5);
  assert.ok(seen.every(request => request.cache === "reload"), "every shell request must use cache: reload");
});

test("activate removes old shell caches and enables navigation preload", async () => {
  const worker = createWorker({ fetchImpl: async () => asset("x") });
  worker.stores.set("farnaz-shell-v1", new Map());
  worker.stores.set("unrelated-cache", new Map());
  await worker.dispatch("activate", {});
  assert.equal(worker.stores.has("farnaz-shell-v1"), false);
  assert.equal(worker.stores.has("unrelated-cache"), true);
  assert.equal(worker.calls.navigationPreloadEnabled, true);
});

test("navigation uses the network and refreshes the cached page", async () => {
  const worker = createWorker({ fetchImpl: async () => html("fresh") });
  const request = Object.defineProperty(new Request(`${ORIGIN}/app/`), "mode", { value: "navigate" });
  const response = await worker.dispatch("fetch", { request, preloadResponse: Promise.resolve(undefined) });
  assert.equal(await response.text(), "fresh");
});

test("navigation falls back to the cached page when the network is down", async () => {
  let online = true;
  const worker = createWorker({ fetchImpl: async () => { if (!online) throw new TypeError("offline"); return html("cached-page"); } });
  const request = Object.defineProperty(new Request(`${ORIGIN}/app/`), "mode", { value: "navigate" });
  await worker.dispatch("fetch", { request, preloadResponse: Promise.resolve(undefined) });
  online = false;
  const response = await worker.dispatch("fetch", { request, preloadResponse: Promise.resolve(undefined) });
  assert.equal(await response.text(), "cached-page");
});

test("versioned code is served instantly from cache and refreshed in the background", async () => {
  let version = "old";
  const worker = createWorker({ fetchImpl: async () => asset(`code-${version}`) });
  const request = new Request(`${ORIGIN}/app/js/core.js?v=1`);
  const first = await worker.dispatch("fetch", { request });
  assert.equal(await first.text(), "code-old");
  version = "new";
  const second = await worker.dispatch("fetch", { request });
  assert.equal(await second.text(), "code-old", "cached copy is returned without waiting for the network");
  const third = await worker.dispatch("fetch", { request });
  assert.equal(await third.text(), "code-new", "the background refresh healed the cache for the next launch");
});

test("requests for other origins and non-GET methods are left alone", async () => {
  const worker = createWorker({ fetchImpl: async () => asset("x") });
  assert.equal(await worker.dispatch("fetch", { request: new Request("https://evil.example/app/x.js") }), undefined);
  assert.equal(await worker.dispatch("fetch", { request: new Request(`${ORIGIN}/app/x.js`, { method: "POST" }) }), undefined);
});

test("notification clicks never navigate outside the app", async () => {
  const worker = createWorker({ fetchImpl: async () => asset("x") });
  const notification = url => ({ close() {}, data: { url } });
  await worker.dispatch("notificationclick", { notification: notification("https://evil.example/phish") });
  await worker.dispatch("notificationclick", { notification: notification("/somewhere-else") });
  await worker.dispatch("notificationclick", { notification: notification("./?chat=1") });
  assert.deepEqual(worker.calls.opened, [`${ORIGIN}/app/`, `${ORIGIN}/app/`, `${ORIGIN}/app/?chat=1`]);
});
