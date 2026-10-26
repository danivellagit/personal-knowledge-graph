// Life write-back: a generic, append-only event writer (rule "memory first, MD first", agents/README.md).
// Every tap that must reach the repo becomes ONE event file in the private write-back repo (life_app.writeback.repo):
//   events/YYYY/MM/DD/<YYYYMMDDTHHMMSSmmm+ZZZZ>-<uuid>.json   (time = the phone's local time, with ms)
//   = { id, ts (ISO with offset), type ("pill.taken" ...), payload, device, app_version }
// written with the GitHub contents API (PUT, new file only: no sha, so never an overwrite and never a conflict).
// The box importer (tools/life_log_import.py) turns events into rows of the data files; the phone only bridges.
//
// Offline first: emit() puts the event in a localStorage queue and returns at once (the UI stays optimistic);
// flush() sends the queue in order, retrying with exponential backoff (2 s .. 10 min, jitter) on network errors,
// 5xx and 429, and pausing 1 h on 401/403/404 (bad or expired token, repo missing). 422 "already exists" counts as
// written (same id sent twice); any other 422 (branch missing) pauses like a config error. Without config (no token in the build) events still queue, capped, and go out
// once a build with a token is installed; nothing in the UI changes.
//
// Config: globalThis.__LIFE_LOG__ = { repo, branch, token, build } | { mock: true, build } | null, written by build.mjs
// ONLY inside the encrypted bundle. Mock mode (and any automated browser, navigator.webdriver) uses an in-memory fake
// GitHub API, exposed as globalThis.__LIFE_LOG_MOCK__, so verify scripts never write to the real log.
// Pure module: storage, fetch, clock and timers are injected, so tests/lifelog.test.mjs runs it in Node.

export const QUEUE_KEY = "life.log.queue.v1";
export const STATE_KEY = "life.log.state.v1";
export const DEVICE_KEY = "life.log.device.v1";
export const QUEUE_CAP = 5000;
const API = "https://api.github.com";

const pad = (n, w = 2) => String(n).padStart(w, "0");
// ISO 8601 local time with milliseconds and offset, e.g. 2026-10-25T15:05:12.345+01:00 (ms: a tap and its undo
// in the same second still sort right)
export function isoLocal(d) {
  const o = -d.getTimezoneOffset(), s = o >= 0 ? "+" : "-", a = Math.abs(o);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}${s}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}
export function uuid(rnd) {
  if (!rnd && typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  const r = rnd || Math.random;
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const v = Math.floor(r() * 16); return (c === "x" ? v : (v & 3) | 8).toString(16); });
}
// events/2026/10/25/20261025T150512345+0100-<id>.json (date and time as written in ts, i.e. the phone's local day)
export function eventPath(ev) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?([+-]\d{2}):?(\d{2})$/.exec(ev.ts);
  if (!m) throw new Error("bad ts " + ev.ts);
  return `events/${m[1]}/${m[2]}/${m[3]}/${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}${m[6]}${m[7] || "000"}${m[8]}${m[9]}-${ev.id}.json`;
}
function b64utf8(s) {
  const bytes = new TextEncoder().encode(s); let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
export function backoffMs(tries, rnd = Math.random) {
  const base = Math.min(600000, 2000 * Math.pow(2, Math.max(0, tries - 1)));
  return Math.round(base * (0.75 + 0.5 * rnd()));
}

// In-memory GitHub contents API (PUT only), for mock mode and tests. fail(n, status) makes the next n calls fail.
export function fakeGithub() {
  const files = new Map(), calls = []; let failN = 0, failStatus = 0;
  const f = async (url, init) => {
    calls.push({ url, method: init && init.method });
    if (failN > 0) { failN--; if (failStatus === 0) throw new TypeError("network down"); return { ok: false, status: failStatus, json: async () => ({}) }; }
    const m = /\/repos\/([^/]+\/[^/]+)\/contents\/(.+)$/.exec(url);
    if (!m || !init || init.method !== "PUT") return { ok: false, status: 404, json: async () => ({}) };
    const p = m[2].split("/").map(decodeURIComponent).join("/");
    if (files.has(p)) return { ok: false, status: 422, json: async () => ({ message: "Invalid request.\n\n\"sha\" wasn't supplied." }) };
    const body = JSON.parse(init.body);
    files.set(p, JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0)))));
    return { ok: true, status: 201, json: async () => ({ content: { path: p } }) };
  };
  return { fetch: f, files, calls, fail(n, status = 0) { failN = n; failStatus = status; } };
}

export function createLifeLog(opts) {
  const o = Object.assign({ storage: null, fetch: null, now: () => new Date(), setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (t) => clearTimeout(t), rnd: Math.random, config: null, device: null, log: () => {} }, opts);
  const cfg = o.config || null;
  const S = o.storage;
  const read = (k, d) => { try { const v = S && S.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const write = (k, v) => { try { S && S.setItem(k, JSON.stringify(v)); } catch { /* storage full or private mode: keep going */ } };
  const live = !!(cfg && (cfg.mock || (cfg.token && cfg.repo)));
  let busy = null, timer = null;

  const device = o.device || (() => {
    let id = (() => { try { return S && S.getItem(DEVICE_KEY); } catch { return null; } })();
    if (!id) { id = uuid().slice(0, 8); try { S && S.setItem(DEVICE_KEY, id); } catch { /* */ } }
    const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
    const kind = /iPhone/.test(ua) ? "iphone" : /iPad/.test(ua) ? "ipad" : /Android/.test(ua) ? "android" : /Mac/.test(ua) ? "mac" : "web";
    return `${kind}-${id}`;
  })();

  function queue() { const q = read(QUEUE_KEY, []); return Array.isArray(q) ? q : []; }
  function schedule(ms) {
    if (!live) return;
    if (timer) o.clearTimeout(timer);
    timer = o.setTimeout(() => { timer = null; flush(); }, Math.max(0, ms));
  }

  function emit(type, payload) {
    const d = o.now();
    const ev = { id: uuid(), ts: isoLocal(d), type, payload: payload || {}, device, app_version: (cfg && cfg.build) || "unknown" };
    const q = queue(); q.push({ ev, tries: 0, next: 0 });
    while (q.length > QUEUE_CAP) q.shift();
    write(QUEUE_KEY, q);
    schedule(0);
    return ev;
  }

  async function putOne(ev) {
    let url, body;
    try { [url, body] = request(ev); } catch { return "done"; }   // malformed event (never produced by emit): drop it
    const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" };
    if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
    try {
      const r = await o.fetch(url, { method: "PUT", headers, body });
      if (r.ok) return "done";
      if (r.status === 422) {                           // "sha wasn't supplied" = the file is already there (sent twice)
        let m = ""; try { m = String(((await r.json()) || {}).message || ""); } catch { /* */ }
        return /sha/i.test(m) ? "done" : "auth";       // any other 422 (e.g. branch missing): keep it, pause like a config error
      }
      if (r.status === 401 || r.status === 403 || r.status === 404) return "auth";
      return "retry";                                   // 409, 429, 5xx
    } catch { return "retry"; }                         // offline, DNS, CORS
  }
  function request(ev) {
    const url = `${API}/repos/${cfg.repo}/contents/${eventPath(ev).split("/").map(encodeURIComponent).join("/")}`;
    const body = JSON.stringify({ message: `life-log: ${ev.type} ${ev.payload && ev.payload.date ? ev.payload.date : ""}`.trim(),
      content: b64utf8(JSON.stringify(ev, null, 1) + "\n"), ...(cfg.branch ? { branch: cfg.branch } : {}) });
    return [url, body];
  }

  // Sends what is due, oldest first. Returns { sent, left, status }.
  function flush() {
    if (!live) return Promise.resolve({ sent: 0, left: queue().length, status: "off" });
    if (busy) return busy;
    const p = (async () => {
      let sent = 0, status = "ok";
      const st = read(STATE_KEY, {});
      const t0 = o.now().getTime();
      if (st.pausedUntil && st.pausedUntil > t0) { schedule(st.pausedUntil - t0); return { sent, left: queue().length, status: "paused" }; }
      for (;;) {
        const q = queue(); if (!q.length) break;
        const it = q[0], t = o.now().getTime();
        if (it.next && it.next > t) { schedule(it.next - t); status = "waiting"; break; }
        const res = await putOne(it.ev);
        const q2 = queue(); const i = q2.findIndex((x) => x.ev.id === it.ev.id);
        if (res === "done") { if (i >= 0) q2.splice(i, 1); write(QUEUE_KEY, q2); sent++; continue; }
        if (res === "auth") { write(STATE_KEY, { ...st, pausedUntil: t + 3600000, lastError: "auth" }); schedule(3600000); status = "auth"; break; }
        if (i >= 0) { q2[i].tries = (q2[i].tries || 0) + 1; q2[i].next = t + backoffMs(q2[i].tries, o.rnd); write(QUEUE_KEY, q2); schedule(q2[i].next - t); }
        status = "retry"; break;
      }
      if (status === "ok") write(STATE_KEY, { lastOk: isoLocal(o.now()) });
      o.log("life-log flush", status, sent);
      return { sent, left: queue().length, status };
    })();
    busy = p;
    const clear = () => { if (busy === p) busy = null; };
    p.then(clear, clear);
    return p;
  }
  // after a pause (auth) or a long offline spell: try now
  function kick() { const st = read(STATE_KEY, {}); if (st.pausedUntil) write(STATE_KEY, {}); const q = queue(); if (q.length) { q.forEach((x) => { x.next = 0; }); write(QUEUE_KEY, q); } return flush(); }
  return { emit, flush, kick, queue, live, device };
}
