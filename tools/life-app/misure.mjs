// Home measurements for the Life App (Health > Medical > Measurements), generated from the knowledge graph (MD first):
//   data/health/blood-pressure.md -> "Blood pressure": table | date | time | arm | SYS | DIA | pulse | notes |
//   data/body/waist.md            -> "Waist": table | date | time | waist_cm | notes |
// Both files are optional (a fresh instance gets empty lists, the app shows "No readings yet"). The default arm for
// the averages is the `default_arm:` frontmatter key of blood-pressure.md when present, else "left". Nothing personal
// lives in this code: every value comes from the files. Rows without an ISO date or without numbers are skipped.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const front = (t) => (/^---\n([\s\S]*?)\n---/.exec(t) || [])[1] || "";
const fv = (fm, k) => { const m = new RegExp(`^${k}:[ \\t]*(.*)$`, "m").exec(fm); return m ? m[1].replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "").trim() || null : null; };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const clean = (s) => String(s ?? "").replace(/\*\*/g, "").replace(/`/g, "").replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, "$1").trim();
const num = (c) => { const m = /(\d+(?:[.,]\d+)?)/.exec(c || ""); return m ? Number(m[1].replace(",", ".")) : null; };
const hhmm = (s) => { const m = /(\d{1,2})[:.](\d{2})/.exec(s || ""); return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null; };
// first markdown table whose header contains every wanted column: [{col: cell}] (header lower-cased)
const table = (txt, want) => {
  let head = null; const rows = [];
  for (const l of txt.split("\n")) {
    if (!/^\s*\|/.test(l)) { if (head && rows.length) break; head = null; continue; }
    const cells = l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
    if (!head) { const h = cells.map((c) => c.toLowerCase()); if (want.every((w) => h.includes(w))) head = h; continue; }
    rows.push(Object.fromEntries(head.map((h, i) => [h, cells[i] ?? ""])));
  }
  return rows;
};
const byTime = (a, b) => (a.date + (a.time || "") < b.date + (b.time || "") ? -1 : 1);

export function readMisure(kb) {
  const bpTxt = read(join(kb, "data/health/blood-pressure.md")), wTxt = read(join(kb, "data/body/waist.md"));
  const arm = (fv(front(bpTxt), "default_arm") || "left").toLowerCase();
  const bp = table(bpTxt, ["date", "sys", "dia"]).filter((r) => ISO.test(r.date) && num(r.sys) !== null && num(r.dia) !== null)
    .map((r) => ({ date: r.date, time: hhmm(r.time), arm: (r.arm || "").toLowerCase() || null, sys: num(r.sys), dia: num(r.dia), pulse: num(r.pulse), note: clean(r.notes) || null }))
    .sort(byTime);
  const waist = table(wTxt, ["date", "waist_cm"]).filter((r) => ISO.test(r.date) && num(r.waist_cm) !== null)
    .map((r) => ({ date: r.date, time: hhmm(r.time), cm: num(r.waist_cm), note: clean(r.notes) || null }))
    .sort(byTime);
  return { bp: { arm, rows: bp, updated: fv(front(bpTxt), "updated") }, waist: { rows: waist, updated: fv(front(wTxt), "updated") } };
}

// node misure.mjs [kb]: print the data (debug)
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(readMisure(process.argv[2] || join(new URL(".", import.meta.url).pathname, "../..")), null, 1));
}
