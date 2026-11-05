import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync("js/livekit-call-sessions.js", "utf8");
const callerId = "a12f3456-7890-4123-8123-123456789abc";
const receiverId = "b12f3456-7890-4123-8123-123456789abc";
const callId = "c12f3456-7890-4123-8123-123456789abc";

function createHarness(userId) {
  const rows = new Map();
  const channels = [];
  let sequence = 0;

  function notify(table, event, row) {
    for (const channel of channels) {
      for (const listener of channel.listeners) {
        if (listener.config.table !== table) continue;
        if (listener.config.event !== event) continue;
        const filter = listener.config.filter || "";
        const match = filter.match(/^([a-z_]+)=eq\.(.+)$/);
        if (match && String(row[match[1]]) !== match[2]) continue;
        listener.callback({ eventType: event, new: { ...row } });
      }
    }
  }

  class FakeChannel {
    constructor(name) {
      this.name = name;
      this.listeners = [];
      this.subscribed = false;
      this.removed = false;
      channels.push(this);
    }
    on(type, config, callback) {
      assert.equal(type, "postgres_changes");
      this.listeners.push({ config, callback });
      return this;
    }
    subscribe(callback) {
      assert.equal(this.subscribed, false, "a Realtime channel must only be subscribed once");
      this.subscribed = true;
      if (callback) callback("SUBSCRIBED");
      return this;
    }
  }

  class Query {
    constructor(table) {
      this.table = table;
      this.operation = "select";
      this.values = null;
      this.filters = [];
      this.limitValue = null;
    }
    insert(values) { this.operation = "insert"; this.values = values; return this; }
    update(values) { this.operation = "update"; this.values = values; return this; }
    select() { return this; }
    eq(column, value) { this.filters.push(row => String(row[column]) === String(value)); return this; }
    in(column, values) { this.filters.push(row => values.includes(row[column])); return this; }
    gte(column, value) { this.filters.push(row => String(row[column]) >= String(value)); return this; }
    order() { return this; }
    limit(value) { this.limitValue = value; return this; }
    single() { return this.execute(true, false); }
    maybeSingle() { return this.execute(false, true); }
    then(resolve, reject) { return this.execute(false, false).then(resolve, reject); }
    async execute(requireOne, allowNone) {
      if (this.table !== "call_sessions") return { data: null, error: new Error("Unexpected table") };
      if (this.operation === "insert") {
        const row = {
          id: callId,
          caller_id: this.values.caller_id,
          receiver_id: this.values.receiver_id,
          call_type: this.values.call_type,
          status: this.values.status,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        rows.set(row.id, row);
        notify(this.table, "INSERT", row);
        return { data: { ...row }, error: null };
      }
      let selected = [...rows.values()].filter(row => this.filters.every(filter => filter(row)));
      if (this.operation === "update") {
        selected = selected.map(row => {
          const previous = row.status;
          const next = this.values.status;
          if (next !== previous) {
            const allowed = previous === "ringing" &&
              ((next === "active" && userId === row.receiver_id) ||
               (next === "rejected" && userId === row.receiver_id) ||
               ((next === "ended" || next === "missed") && [row.caller_id, row.receiver_id].includes(userId))) ||
              (previous === "active" && next === "ended" && [row.caller_id, row.receiver_id].includes(userId));
            if (!allowed) return null;
          }
          Object.assign(row, this.values, { updated_at: new Date().toISOString() });
          notify(this.table, "UPDATE", row);
          return row;
        }).filter(Boolean);
      }
      if (this.limitValue !== null) selected = selected.slice(0, this.limitValue);
      if (requireOne && selected.length !== 1) return { data: null, error: new Error("Expected one row") };
      if (allowNone) return { data: selected[0] ? { ...selected[0] } : null, error: null };
      return { data: selected.map(row => ({ ...row })), error: null };
    }
  }

  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from: table => new Query(table),
    channel: name => new FakeChannel(name),
    removeChannel: async channel => { channel.removed = true; return "ok"; },
    seedCall(row) { rows.set(row.id, { ...row }); notify("call_sessions", "INSERT", row); },
    rows,
    channels
  };
  const context = { console, Promise, setTimeout, clearTimeout, Date };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "js/livekit-call-sessions.js" });
  return { supabase, api: context.FarnazCallSessions };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test("starts a direct audio invitation and ends it without touching legacy calls", async () => {
  const { supabase, api } = createHarness(callerId);
  const events = [];
  const manager = api.create({ supabase, userId: callerId, onEvent: event => events.push(event.type) });
  const session = await manager.start({ peerId: receiverId, callType: "audio" });

  assert.equal(session.id, callId);
  assert.equal(session.call_type, "audio");
  assert.equal(manager.getState().role, "caller");
  assert.equal(manager.getState().status, "ringing");
  assert.ok(events.includes("outgoing"));
  assert.equal(supabase.channels.filter(channel => channel.subscribed).length, 1);

  await manager.end();
  assert.equal(supabase.rows.get(callId).status, "ended");
  assert.equal(manager.getState().status, "idle");
  await manager.close();
});

test("receiver recovers an incoming invitation, answers, and ends it", async () => {
  const { supabase, api } = createHarness(receiverId);
  const events = [];
  const manager = api.create({ supabase, userId: receiverId, onEvent: event => events.push(event.type) });
  await manager.watchIncoming();

  supabase.seedCall({
    id: callId, caller_id: callerId, receiver_id: receiverId,
    call_type: "audio", status: "ringing",
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  });
  await tick();
  await tick();

  assert.equal(manager.getState().role, "receiver");
  assert.equal(manager.getState().status, "ringing");
  assert.ok(events.includes("incoming"));

  await manager.answer();
  assert.equal(supabase.rows.get(callId).status, "active");
  assert.ok(events.includes("accepted"));

  await manager.end();
  assert.equal(supabase.rows.get(callId).status, "ended");
  assert.equal(manager.getState().status, "idle");
  await manager.close();
});

test("recovers a ringing invitation that arrived before the inbox subscription", async () => {
  const { supabase, api } = createHarness(receiverId);
  supabase.seedCall({
    id: callId, caller_id: callerId, receiver_id: receiverId,
    call_type: "audio", status: "ringing",
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  });
  const events = [];
  const manager = api.create({ supabase, userId: receiverId, onEvent: event => events.push(event.type) });
  await manager.watchIncoming();

  assert.equal(manager.getState().role, "receiver");
  assert.equal(manager.getState().session.id, callId);
  assert.ok(events.includes("incoming"));
  await manager.reject();
  assert.equal(supabase.rows.get(callId).status, "rejected");
  await manager.close();
});

test("marks an unanswered outgoing invitation as missed after the timeout", async () => {
  const { supabase, api } = createHarness(callerId);
  const events = [];
  const manager = api.create({
    supabase, userId: callerId, ringingTimeoutMs: 1000,
    onEvent: event => events.push(event.type)
  });
  await manager.start({ peerId: receiverId, callType: "audio" });
  await new Promise(resolve => setTimeout(resolve, 1100));

  assert.equal(supabase.rows.get(callId).status, "missed");
  assert.equal(manager.getState().status, "idle");
  assert.ok(events.includes("finished"));
  await manager.close();
});

test("only the receiver can answer or reject a ringing invitation", async () => {
  const { supabase, api } = createHarness(callerId);
  const manager = api.create({ supabase, userId: callerId });
  await manager.start({ peerId: receiverId, callType: "audio" });

  await assert.rejects(manager.answer(), /Only the receiver/);
  await assert.rejects(manager.reject(), /Only the receiver/);
  assert.equal(supabase.rows.get(callId).status, "ringing");

  await manager.end();
  await manager.close();
});

test("rejects stale identity and self-calls before creating a row", async () => {
  const { supabase, api } = createHarness(receiverId);
  const manager = api.create({ supabase, userId: callerId });
  await assert.rejects(manager.start({ peerId: receiverId, callType: "audio" }), /account changed/);
  assert.equal(supabase.rows.size, 0);
  await manager.close();

  const sameUser = createHarness(callerId);
  const sameManager = sameUser.api.create({ supabase: sameUser.supabase, userId: callerId });
  await assert.rejects(sameManager.start({ peerId: callerId, callType: "audio" }), /different contact/);
  assert.equal(sameUser.supabase.rows.size, 0);
  await sameManager.close();
});
