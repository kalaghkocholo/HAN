import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../js/chat-menu-v5.js", import.meta.url), "utf8");
const start = source.indexOf("let privateOutboxFlushPromise=null;");
const endMarker = "window.FarnazFlushPrivateOutbox=flushPrivateOutbox;";
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error("Could not locate the production outbox implementation");
const productionOutbox = source.slice(start, end + endMarker.length);

function makeRecord(id, overrides = {}) {
  return {
    id,
    userId: "user-a",
    receiver_id: "contact-a",
    body: "hello",
    message_type: "text",
    attachment_name: null,
    attachment_mime: null,
    attachment_size: null,
    reply_to_id: null,
    createdAt: 1000,
    file: null,
    ...overrides
  };
}

function harness(options = {}) {
  const records = (options.records || [makeRecord("message-1")]).map(record => ({ ...record }));
  const database = [];
  const events = [];
  let currentUser = { id: "user-a" };
  let online = options.online !== false;
  let uploadBehavior = options.upload || (async () => ({ error: null }));
  let insertBehavior = options.insert || (async row => {
    database.push({ ...row, created_at: new Date(2000).toISOString(), edited_at: null });
    return { data: database[database.length - 1], error: null };
  });
  const store = {
    async getOutbox(userId) {
      return records.filter(record => String(record.userId) === String(userId)).sort((a,b) => a.createdAt-b.createdAt);
    },
    async removeOutbox(userId, id) {
      const index = records.findIndex(record => String(record.userId) === String(userId) && record.id === id);
      if (index >= 0) records.splice(index, 1);
      events.push(["remove", userId, id]);
      return index >= 0;
    },
    async getMessages() { return []; },
    async saveMessages(userId, receiverId, messages) { events.push(["cache", userId, receiverId, messages.length]); return true; }
  };
  const list = {
    scrollTop: 0,
    scrollHeight: 10,
    querySelector() { return null; },
    appendChild() {},
  };
  const client = {
    auth: { async getSession() { return { data: { session: { user: { id: "user-a" } } }, error: null }; } },
    from(table) {
      if (table === "blocked_contacts") {
        const query = { receiver: null, eq(field, value) { if (field === "blocked_user_id") this.receiver = value; return this; },
          async maybeSingle() { return { data: (options.blocked || []).includes(this.receiver) ? { blocked_user_id: this.receiver } : null, error: null }; } };
        return { select() { return query; }, ...query };
      }
      if (table === "messages") {
        return {
          insert(row) {
            events.push(["insert", row.id]);
            return { select() { return { async single() { return insertBehavior(row, database, events); } }; } };
          },
          select() {
            let id = null;
            const query = { eq(field, value) { if (field === "id") id = value; return query; },
              async maybeSingle() { return { data: database.find(row => row.id === id) || null, error: null }; } };
            return query;
          }
        };
      }
      throw new Error("Unexpected table " + table);
    },
    storage: { from() { return { async upload(path, file) { events.push(["upload", path, file.size]); return uploadBehavior(path, file, events); } }; } }
  };
  const sandbox = {
    window: { FarnazLocalStore: store },
    navigator: { get onLine() { return online; } },
    currentUser,
    currentChatUser: { user_id: "contact-a" },
    english: true,
    getClient: () => client,
    setStatus() {},
    refreshConversationList() {},
    makeMessageElement: async message => ({ id: message.id }),
    $: id => id === "messageList" ? list : null,
    console: { warn() {} },
    Date,
    String,
    JSON,
    Error,
  };
  vm.createContext(sandbox);
  vm.runInContext(productionOutbox + "\nglobalThis.__flush=flushPrivateOutbox;", sandbox);
  return {
    records, database, events, store, sandbox,
    flush: () => sandbox.__flush(),
    setOnline(value) { online = value; },
    setUpload(fn) { uploadBehavior = fn; },
    setInsert(fn) { insertBehavior = fn; },
    setCurrentUser(user) { currentUser = user; sandbox.currentUser = user; },
  };
}

test("offline queue is left untouched until the browser is online", async () => {
  const app = harness({ online: false });
  assert.equal(await app.flush(), false);
  assert.equal(app.events.length, 0);
  assert.equal(app.records.length, 1);
});

test("an interrupted attachment upload keeps the record and retries with the same deterministic path", async () => {
  const file = new Blob(["voice-data"], { type: "audio/webm" });
  const app = harness({ records: [makeRecord("file-1", { file, attachment_name: "voice.webm", attachment_mime: "audio/webm", attachment_size: file.size, message_type: "file" })] });
  let attempts = 0;
  app.setUpload(async path => {
    attempts += 1;
    if (attempts === 1) return { error: Object.assign(new Error("network interrupted"), { statusCode: "503" }) };
    return { error: null };
  });
  await app.flush();
  assert.equal(app.records.length, 1);
  assert.equal(app.database.length, 0);
  await app.flush();
  assert.equal(app.records.length, 0);
  assert.equal(app.database.length, 1);
  assert.equal(app.database[0].attachment_path, "user-a/file-1.webm");
  assert.equal(app.events.filter(event => event[0] === "upload").length, 2);
});

test("a stored attachment conflict after a prior successful upload is safe to reconcile", async () => {
  const file = new Blob(["photo"], { type: "image/jpeg" });
  const app = harness({ records: [makeRecord("file-2", { file, attachment_name: "photo.jpg", attachment_mime: "image/jpeg", attachment_size: file.size, message_type: "image" })] });
  let uploads = 0;
  app.setUpload(async () => {
    uploads += 1;
    return uploads === 1
      ? { error: Object.assign(new Error("database interrupted before message insert"), { statusCode: "503" }) }
      : { error: Object.assign(new Error("already exists"), { statusCode: "409" }) };
  });
  app.setInsert(async () => ({ data: null, error: new Error("not reached") }));
  await app.flush();
  assert.equal(app.records.length, 1);
  assert.equal(app.database.length, 0);
  app.setInsert(async row => {
    app.database.push({ ...row, created_at: new Date(2000).toISOString(), edited_at: null });
    return { data: app.database.at(-1), error: null };
  });
  await app.flush();
  assert.equal(uploads, 2);
  assert.equal(app.database.length, 1);
  assert.equal(app.records.length, 0);
});

test("an ambiguous committed insert is reconciled by the stable message UUID without a second insert", async () => {
  const app = harness();
  let insertCalls = 0;
  app.setInsert(async row => {
    insertCalls += 1;
    app.database.push({ ...row, created_at: new Date(2000).toISOString(), edited_at: null });
    return { data: null, error: new Error("response lost after server commit") };
  });
  await app.flush();
  assert.equal(insertCalls, 1);
  assert.equal(app.database.length, 1);
  assert.equal(app.records.length, 0);
  await app.flush();
  assert.equal(insertCalls, 1);
});

test("a failed insert that did not commit remains queued and succeeds on retry", async () => {
  const app = harness();
  let insertCalls = 0;
  app.setInsert(async (row, database) => {
    insertCalls += 1;
    if (insertCalls === 1) return { data: null, error: new Error("connection lost before commit") };
    database.push({ ...row, created_at: new Date(2000).toISOString(), edited_at: null });
    return { data: database.at(-1), error: null };
  });
  await app.flush();
  assert.equal(app.records.length, 1);
  assert.equal(app.database.length, 0);
  await app.flush();
  assert.equal(app.records.length, 0);
  assert.equal(app.database.length, 1);
  assert.equal(insertCalls, 2);
});

test("blocked recipient messages remain queued without blocking other recipients", async () => {
  const app = harness({
    records: [
      makeRecord("blocked-1", { receiver_id: "blocked-contact" }),
      makeRecord("send-2", { receiver_id: "contact-b" })
    ],
    blocked: ["blocked-contact"]
  });
  await app.flush();
  assert.deepEqual(app.records.map(record => record.id), ["blocked-1"]);
  assert.deepEqual(app.database.map(row => row.id), ["send-2"]);
});

test("two intentional identical messages with distinct UUIDs are both delivered", async () => {
  const app = harness({
    records: [
      makeRecord("same-text-1", { body: "OK" }),
      makeRecord("same-text-2", { body: "OK", createdAt: 1001 })
    ]
  });
  await app.flush();
  assert.equal(app.database.length, 2);
  assert.deepEqual(app.database.map(row => row.id), ["same-text-1", "same-text-2"]);
  assert.equal(app.records.length, 0);
});

test("account switching during attachment upload prevents the queued message insert", async () => {
  const file = new Blob(["x"], { type: "image/png" });
  const app = harness({ records: [makeRecord("switch-1", { file, attachment_name: "x.png", attachment_mime: "image/png", attachment_size: 1 })] });
  app.setUpload(async () => {
    app.setCurrentUser({ id: "user-b" });
    return { error: null };
  });
  await app.flush();
  assert.equal(app.database.length, 0);
  assert.equal(app.records.length, 1);
});
