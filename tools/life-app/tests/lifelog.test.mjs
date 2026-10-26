// Life write-back writer + pill bridge, against a fake GitHub contents API.
// Run: node --test tools/life-app/tests/   (no network, no token)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLifeLog, fakeGithub, eventPath, isoLocal, backoffMs, QUEUE_KEY, STATE_KEY } from "../src/lifelog.mjs";
import { diffPills, installPillBridge, PILL_ITEM } from "../src/pill-bridge.mjs";

class Mem { constructor() { this.m = new Map(); } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } removeItem(k) { this.m.delete(k); } }
function clock(start = Date.parse("2026-10-25T14:05:12Z")) {
  let t = start; const timers = [];
  return { now: () => new Date(t), setTimeout: (fn, ms) => { const h = { at: t + ms, fn }; timers.push(h); return h; },
    clearTimeout: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); }, advance(ms) { t += ms; }, timers };
}
const mk = (over = {}) => { const S = new Mem(), gh = fakeGithub(), c = clock();
  const L = createLifeLog({ storage: S, fetch: gh.fetch, now: c.now, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, rnd: () => 0.5,
    config: { repo: "example-user/life-log", branch: "main", token: "TEST", build: "b1" }, device: "test-dev", ...over });
  return { S, gh, c, L }; };

test("event shape and path", () => {
  const { L } = mk();
  const ev = L.emit("pill.taken", { slot: "morning", date: "2026-10-25" });
  assert.match(ev.id, /^[0-9a-f-]{36}$/);
  assert.match(ev.ts, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}[+-]\d\d:\d\d$/);
  assert.deepEqual(Object.keys(ev).sort(), ["app_version", "device", "id", "payload", "ts", "type"]);
  assert.equal(ev.app_version, "b1"); assert.equal(ev.device, "test-dev");
  assert.equal(eventPath({ id: "abc", ts: "2026-10-25T15:05:12.345+01:00" }), "events/2026/10/25/20261025T150512345+0100-abc.json");
  assert.equal(eventPath({ id: "abc", ts: "2026-10-25T15:05:12+01:00" }), "events/2026/10/25/20261025T150512000+0100-abc.json");
  assert.equal(eventPath({ id: "x", ts: "2026-03-01T00:00:00-05:30" }), "events/2026/03/01/20260301T000000000-0530-x.json");
});

test("isoLocal carries the offset", () => { assert.match(isoLocal(new Date()), /[+-]\d\d:\d\d$/); });

test("emit is optimistic: queued first, then written as its own file, queue emptied", async () => {
  const { S, gh, L } = mk();
  const a = L.emit("pill.taken", { slot: "morning", date: "2026-10-25" });
  const b = L.emit("pill.untaken", { slot: "morning", date: "2026-10-25", was: "taken" });
  assert.equal(JSON.parse(S.getItem(QUEUE_KEY)).length, 2);     // sync, before any network
  const r = await L.flush();
  assert.equal(r.sent, 2); assert.equal(r.left, 0);
  assert.equal(gh.files.size, 2);
  assert.deepEqual(gh.files.get(eventPath(a)), a); assert.deepEqual(gh.files.get(eventPath(b)), b);
  assert.ok(gh.calls.every((x) => x.method === "PUT"));
});

test("offline: stays queued, retries with backoff, then sends in order", async () => {
  const { gh, c, L } = mk();
  gh.fail(1);                                     // network down once
  L.emit("pill.taken", { slot: "evening", date: "2026-10-24" });
  L.emit("pill.missed", { date: "2026-10-23" });
  let r = await L.flush();
  assert.equal(r.status, "retry"); assert.equal(r.left, 2); assert.equal(gh.files.size, 0);
  const q = L.queue(); assert.equal(q[0].tries, 1); assert.ok(q[0].next > c.now().getTime());
  r = await L.flush(); assert.equal(r.status, "waiting"); assert.equal(gh.calls.length, 1);   // not due yet: no call
  c.advance(backoffMs(1, () => 0.5) + 1);
  r = await L.flush(); assert.equal(r.sent, 2); assert.equal(gh.files.size, 2);
});

test("backoff grows and is capped at 10 min", () => {
  assert.equal(backoffMs(1, () => 0.5), 2000); assert.equal(backoffMs(2, () => 0.5), 4000);
  assert.equal(backoffMs(30, () => 0.5), 600000);
});

test("5xx and 429 retry; 422 (already written) counts as done", async () => {
  const { gh, c, L } = mk();
  gh.fail(1, 503); L.emit("pill.taken", { slot: "morning", date: "2026-10-25" });
  assert.equal((await L.flush()).status, "retry");
  c.advance(700000); gh.fail(1, 429); assert.equal((await L.flush()).status, "retry");
  c.advance(700000); assert.equal((await L.flush()).sent, 1);
  const ev = L.emit("pill.taken", { slot: "morning", date: "2026-10-25" });
  gh.files.set(eventPath(ev), ev);                // already there (sent by another tab)
  const r = await L.flush(); assert.equal(r.sent, 1); assert.equal(r.left, 0);
});

test("422 other than 'already exists' keeps the event", async () => {
  const S = new Mem(); let n = 0;
  const f = async () => { n++; return n === 1 ? { ok: false, status: 422, json: async () => ({ message: "Branch main not found" }) } : { ok: true, status: 201, json: async () => ({}) }; };
  const L = createLifeLog({ storage: S, fetch: f, config: { repo: "a/b", token: "T" }, device: "d", setTimeout: () => 0, clearTimeout: () => {} });
  L.emit("pill.taken", { slot: "morning", date: "2026-10-25" });
  assert.equal((await L.flush()).status, "auth"); assert.equal(L.queue().length, 1);
  assert.equal((await L.kick()).sent, 1);
});

test("bad token pauses for an hour and keeps the queue; kick retries", async () => {
  const { S, gh, c, L } = mk();
  gh.fail(1, 401); L.emit("pill.taken", { slot: "morning", date: "2026-10-25" });
  assert.equal((await L.flush()).status, "auth"); assert.equal(L.queue().length, 1);
  assert.ok(JSON.parse(S.getItem(STATE_KEY)).pausedUntil > c.now().getTime());
  assert.equal((await L.flush()).status, "paused"); assert.equal(gh.calls.length, 1);
  assert.equal((await L.kick()).sent, 1);
});

test("no token: events queue on the phone only, no network, nothing throws", async () => {
  let called = 0; const S = new Mem();
  const L = createLifeLog({ storage: S, fetch: () => { called++; }, config: { build: "b" }, device: "d" });
  assert.equal(L.live, false);
  L.emit("pill.taken", { slot: "morning", date: "2026-10-25" });
  assert.equal((await L.flush()).status, "off"); assert.equal(called, 0); assert.equal(L.queue().length, 1);
});

test("storage that throws (private mode) never breaks emit", () => {
  const bad = { getItem() { throw new Error("x"); }, setItem() { throw new Error("quota"); } };
  const L = createLifeLog({ storage: bad, fetch: fakeGithub().fetch, config: { mock: true }, device: "d" });
  assert.doesNotThrow(() => L.emit("pill.taken", { slot: "morning", date: "2026-10-25" }));
});

test("pill diff: tap, change slot, missed, undo, graph clear, migration is silent", () => {
  const D = "2026-10-25";
  assert.deepEqual(diffPills(null, JSON.stringify({ [D]: { p: "am", t: "x" } })), [["pill.taken", { date: D, slot: "morning" }]]);
  assert.deepEqual(diffPills(JSON.stringify({ [D]: { p: "am" } }), JSON.stringify({ [D]: { p: "pm" } })), [["pill.taken", { date: D, slot: "evening" }]]);
  assert.deepEqual(diffPills(null, JSON.stringify({ [D]: { p: "no" } })), [["pill.missed", { date: D }]]);
  assert.deepEqual(diffPills(JSON.stringify({ [D]: { p: "pm" } }), JSON.stringify({ [D]: { t: "y" } })), [["pill.untaken", { date: D, slot: "evening", was: "taken" }]]);
  assert.deepEqual(diffPills(JSON.stringify({ [D]: { p: "no" } }), JSON.stringify({ [D]: { t: "y" } })), [["pill.untaken", { date: D, slot: null, was: "missed" }]]);
  // undo of a day known only from the graph (no phone entry before)
  assert.deepEqual(diffPills(null, JSON.stringify({ [D]: { t: "y" } })), [["pill.untaken", { date: D, slot: null, was: null }]]);
  // the component's one-time rewrite of the old {fin, pa, pp} format: same meaning, no events
  assert.deepEqual(diffPills(JSON.stringify({ [D]: { fin: true, pa: true } }), JSON.stringify({ [D]: { p: "am" } })), []);
  assert.deepEqual(diffPills(JSON.stringify({ [D]: { p: "am", t: "1" } }), JSON.stringify({ [D]: { p: "am", t: "1" }, "2026-10-24": { p: "pm" } })),
    [["pill.taken", { date: "2026-10-24", slot: "evening" }]]);
  assert.deepEqual(diffPills("garbage", "{}"), []);
});

test("bridge wraps only the pill key of the given storage, the write always lands", async () => {
  class St extends Mem {}
  const proto = St.prototype; proto.setItem = Mem.prototype.setItem;
  const ls = new St(), other = new St(), got = [];
  installPillBridge(proto, ls, { emit: (t, p) => got.push([t, p]) });
  assert.equal(installPillBridge(proto, ls, { emit() {} }), false);   // idempotent
  ls.setItem("other", "1"); other.setItem(PILL_ITEM, JSON.stringify({ "2026-10-25": { p: "am" } }));
  assert.equal(got.length, 0);
  ls.setItem(PILL_ITEM, JSON.stringify({ "2026-10-25": { p: "am" } }));
  ls.setItem(PILL_ITEM, JSON.stringify({ "2026-10-25": { t: "z" } }));
  assert.deepEqual(got.map((x) => x[0]), ["pill.taken", "pill.untaken"]);
  assert.equal(ls.getItem(PILL_ITEM), JSON.stringify({ "2026-10-25": { t: "z" } }));
  const boom = new St(); installPillBridge(proto, boom, { emit() { throw new Error("x"); } });
  assert.doesNotThrow(() => boom.setItem(PILL_ITEM, JSON.stringify({ "2026-10-25": { p: "am" } })));
});

test("end to end: bridge + writer + fake API", async () => {
  class St extends Mem {} St.prototype.setItem = Mem.prototype.setItem;
  const ls = new St(), gh = fakeGithub();
  const L = createLifeLog({ storage: ls, fetch: gh.fetch, config: { mock: true, repo: "mock/life-log" }, device: "d", setTimeout: () => 0, clearTimeout: () => {} });
  installPillBridge(St.prototype, ls, L);
  ls.setItem(PILL_ITEM, JSON.stringify({ "2026-10-25": { p: "pm" } }));
  await L.flush();
  const files = [...gh.files.values()];
  assert.equal(files.length, 1); assert.equal(files[0].type, "pill.taken"); assert.deepEqual(files[0].payload, { date: "2026-10-25", slot: "evening" });
});
