// Pill taps -> life-log events, WITHOUT touching the health Page code (the health page component in src/health/).
// The Pills screen saves every tap to localStorage "salute.capelli.aderenza.v1" as
//   { "YYYY-MM-DD": { p?: "am" | "pm" | "no", t?: ISO } }   (p missing = the day was cleared by hand)
// (old format { fin, pa, pp } is migrated by the component on first load). This bridge wraps Storage.setItem for
// that ONE key, diffs the old and new value day by day and emits:
//   pill.taken   { date, slot: "morning" | "evening" }
//   pill.missed  { date }                                   ("I did not take them")
//   pill.untaken { date, slot: "morning" | "evening" | null, was: "taken" | "missed" | null }   (a second tap = undo;
//                compensating event; slot/was null when the cleared value came from the graph, not from this phone)
// The write itself always goes through first and unchanged, so the UI never waits and never breaks.
// The importer maps them to medico.json pills.log rows (taken/missed/cleared, slot mattina/sera/null, by "app").
export const PILL_ITEM = "salute.capelli.aderenza.v1";
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// same normalization as the component's pillLoad(): date -> "am" | "pm" | "no" | "" (cleared) ; absent = no entry
export function normPills(raw) {
  let v; try { v = raw ? JSON.parse(raw) : null; } catch { return {}; }
  if (!v || typeof v !== "object") return {};
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    if (!DAY.test(k) || !x || typeof x !== "object") continue;
    out[k] = x.p === "am" || x.p === "pm" || x.p === "no" ? x.p : x.pa || x.fin ? "am" : x.pp ? "pm" : "";
  }
  return out;
}
const SLOT = { am: "morning", pm: "evening" };
export function diffPills(oldRaw, newRaw) {
  const a = normPills(oldRaw), b = normPills(newRaw), evs = [];
  for (const d of Object.keys(b).sort()) {
    const was = d in a ? a[d] : undefined, now = b[d];
    if (was === now) continue;
    if (now === "am" || now === "pm") evs.push(["pill.taken", { date: d, slot: SLOT[now] }]);
    else if (now === "no") evs.push(["pill.missed", { date: d }]);
    else evs.push(["pill.untaken", { date: d, slot: SLOT[was] || null, was: was === "am" || was === "pm" ? "taken" : was === "no" ? "missed" : null }]);
  }
  return evs;
}
// install on a Storage prototype (window.Storage.prototype) for the given storage object (window.localStorage)
export function installPillBridge(proto, storage, lifelog) {
  if (!proto || !storage || proto.__lifeLogPill) return false;
  const orig = proto.setItem;
  proto.setItem = function (k, v) {
    let before = null;
    const mine = this === storage && k === PILL_ITEM;
    if (mine) { try { before = this.getItem(k); } catch { /* */ } }
    const r = orig.call(this, k, v);
    if (mine) { try { for (const [type, payload] of diffPills(before, String(v))) lifelog.emit(type, payload); } catch { /* never break a tap */ } }
    return r;
  };
  proto.__lifeLogPill = true;
  return true;
}
