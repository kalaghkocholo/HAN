import assert from "node:assert/strict";
import test from "node:test";
import {
  compareMessagesNewestFirst,
  compareMessagesOldestFirst,
  mergeMessagesNewestFirst,
  olderCursorFilter,
  selectConversationPage
} from "../js/private-chat-model.js";

const base="2026-11-07T10:00:00.000Z";
const older="2026-11-07T09:59:59.999Z";
const ids={
  a:"a0000000-0000-4000-8000-000000000001",
  b:"b0000000-0000-4000-8000-000000000002",
  c:"c0000000-0000-4000-8000-000000000003",
  d:"d0000000-0000-4000-8000-000000000004"
};
const message=(id,created_at=base,extra={})=>({id:ids[id]||id,created_at,...extra});

test("orders equal-timestamp messages deterministically by UUID",()=>{
  const values=[message("b"),message("a"),message("d"),message("c")];
  assert.deepEqual(values.sort(compareMessagesNewestFirst).map(x=>x.id),[ids.d,ids.c,ids.b,ids.a]);
  assert.deepEqual(values.sort(compareMessagesOldestFirst).map(x=>x.id),[ids.a,ids.b,ids.c,ids.d]);
});

test("merges both directions, removes duplicate message IDs and retains newest copy",()=>{
  const first=message("a",base,{body:"first"});
  const duplicate=message("a",base,{body:"updated"});
  const merged=mergeMessagesNewestFirst([first,message("b",older)],[duplicate,message("c",base)]);
  assert.equal(merged.length,3);
  assert.equal(merged.find(x=>x.id===ids.a).body,"updated");
  assert.deepEqual(merged.map(x=>x.id),[ids.c,ids.a,ids.b]);
});

test("builds a compound keyset cursor for timestamp collisions",()=>{
  assert.equal(
    olderCursorFilter(message("b")),
    "created_at.lt."+base+",and(created_at.eq."+base+",id.lt."+ids.b+")"
  );
});

test("rejects incomplete or malformed cursors rather than silently skipping history",()=>{
  assert.throws(()=>olderCursorFilter({created_at:base}),/UUID/);
  assert.throws(()=>olderCursorFilter({id:ids.a,created_at:"not-a-date"}),/timestamp/);
  assert.throws(()=>olderCursorFilter({id:"message-1",created_at:base}),/UUID/);
});

test("selects a stable oldest-to-newest page and reports whether another page exists",()=>{
  const rows=[
    message("a",older),
    message("b",base),
    message("c",base),
    message("d",base)
  ];
  const page=selectConversationPage([rows.slice(0,2),rows.slice(2)],3);
  assert.deepEqual(page.messages.map(x=>x.id),[ids.b,ids.c,ids.d]);
  assert.equal(page.hasMore,true);
  assert.equal(page.totalFetched,4);
});

test("a complete page does not advertise older history",()=>{
  const page=selectConversationPage([[message("a"),message("b",older)]],2);
  assert.equal(page.messages.length,2);
  assert.equal(page.hasMore,false);
});
