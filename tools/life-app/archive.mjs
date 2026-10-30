// Medical archive for the Life App (Health > Medical > Archive), generated from the knowledge graph (MD first):
//   data/health/records.md      -> visits, reports, surgeries, births, booked appointments (one table row each)
//   data/health/vaccinations.md -> the "Vaccines" table (Record table + the "status unknown" table) and the vaccine
//                                  sessions in the timeline
//   data/body/labs/lab-*.md     -> one "Blood draw" timeline entry per lab report (frontmatter: date, drawn, lab, site,
//                                  category, out_of_range), its values from the "Markers over time" table of labs.md
// Every file is optional (a fresh instance gets an empty archive). Nothing personal lives in this code: names, places
// and values all come from the files. Never reads images; image/scan columns are ignored on purpose.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const front = (t) => (/^---\n([\s\S]*?)\n---/.exec(t) || [])[1] || "";
const fv = (fm, k) => { const m = new RegExp(`^${k}:[ \\t]*(.*)$`, "m").exec(fm); return m ? m[1].replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "").trim() || null : null; };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const clean = (s) => String(s ?? "").replace(/\*\*/g, "").replace(/`/g, "").replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, "$1").replace(/\s*\u2014\s*/g, ", ").trim();
// markdown tables of a section: rows as arrays of cells, header row first
const tables = (txt) => {
  const out = []; let cur = null;
  for (const l of txt.split("\n")) {
    if (/^\s*\|/.test(l)) {
      const cells = l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
      if (!cur) { cur = []; out.push(cur); }
      cur.push(cells);
    } else cur = null;
  }
  return out;
};
const section = (txt, title) => { const i = txt.search(new RegExp(`^#{2,3} ${title}\\b`, "m")); if (i < 0) return ""; const rest = txt.slice(i).split("\n"); const lvl = rest[0].match(/^#+/)[0].length; const end = rest.slice(1).findIndex((l) => new RegExp(`^#{1,${lvl}} `).test(l)); return rest.slice(0, end < 0 ? undefined : end + 1).join("\n"); };

// ---- vaccine families: English names in vaccinations.md -> display label, match words for booked rows ----
const VAX = [
  { re: /^hepatitis b/i, key: "hepb", name: "Hepatitis B", words: ["epatite b"] },
  { re: /^diphtheria-tetanus/i, key: "dt", name: "Diphtheria and tetanus (DT)", words: ["difterite"] },
  { re: /^tetanus/i, key: "tet", name: "Tetanus, booster", words: ["tetano"] },
  { re: /^polio/i, key: "polio", name: "Polio", words: ["polio"] },
  { re: /^measles/i, key: "mpr", name: "Measles, mumps, rubella (MMR)", words: ["morbillo", "mpr"] },
  { re: /^pertussis/i, key: "pert", name: "Pertussis", words: ["pertosse"] },
  { re: /^haemophilus/i, key: "hib", name: "Haemophilus influenzae b (Hib)", words: ["hib", "haemophilus"] },
  { re: /^meningococc/i, key: "men", name: "Meningococcal (C, ACWY, B)", words: ["meningococco"] },
  { re: /^hpv/i, key: "hpv", name: "HPV (papilloma virus)", words: ["hpv", "papilloma"] },
  { re: /^varicella/i, key: "var", name: "Varicella", words: ["varicella"] },
];
const famOf = (n) => VAX.find((v) => v.re.test(n)) || { key: n.toLowerCase(), name: clean(n), words: [n.toLowerCase()] };
const doseIt = (d) => clean(d).replace(/^(\d+)(st|nd|rd|th)$/i, "dose $1").replace(/^(\d+)(st|nd|rd|th) booster$/i, "booster $1").replace(/^booster$/i, "booster");
const placeIt = (p) => clean(p);

function readRecords(kb) {
  const t = read(join(kb, "data/health/records.md"));
  const tb = tables(t).find((x) => x[0] && x[0][0].toLowerCase() === "date" && x[0].includes("type"));
  if (!tb) return [];
  const h = tb[0].map((c) => c.toLowerCase()), ix = (n) => h.indexOf(n);
  return tb.slice(1).filter((c) => ISO.test(c[ix("date")] || "")).map((c) => ({
    date: c[ix("date")], type: (c[ix("type")] || "visita").toLowerCase(), title: clean(c[ix("title")]), place: clean(c[ix("place")]),
    summary: clean(c[ix("summary")]), details: ix("details") >= 0 && c[ix("details")] ? clean(c[ix("details")]).split(/\s+·\s+/).filter(Boolean) : [],
    source: clean(c[ix("source")]) || "data/health/records.md",
  }));
}

function readVaccines(kb, records) {
  const t = read(join(kb, "data/health/vaccinations.md"));
  if (!t) return { rows: [], sessions: [] };
  const fams = new Map(), sessions = new Map();
  const fam = (n) => { const f = famOf(n); if (!fams.has(f.key)) fams.set(f.key, { key: f.key, name: f.name, words: f.words, doses: [], status: null, note: null }); return fams.get(f.key); };
  const rec = tables(section(t, "Record")).find((x) => x[0] && x[0][0].toLowerCase() === "vaccine");
  if (rec) {
    const h = rec[0].map((c) => c.toLowerCase()), ix = (n) => h.indexOf(n);
    for (const c of rec.slice(1)) {
      const f = fam(c[ix("vaccine")]), raw = c[ix("date")] || "", date = (/^(\d{4}-\d{2}-\d{2})/.exec(raw) || [])[1] || null;
      if (date) {
        f.doses.push({ dose: doseIt(c[ix("dose")]), date, place: placeIt(c[ix("place")]) });
        if (!sessions.has(date)) sessions.set(date, { date, names: [], place: placeIt(c[ix("place")]) });
        const s = sessions.get(date); if (!s.names.includes(f.name)) s.names.push(f.name);
        s.doses = s.doses || []; s.doses.push(`${f.name}: ${doseIt(c[ix("dose")])}`);
      } else if (/not done|non fatt/i.test(raw)) {
        f.status = "da fare"; const due = /\b(19|20)\d\d\b/.exec(raw); f.note = due ? `Never done (was due in ${due[0]})` : "Never done";
      } // "none (slot empty)": an empty slot of a complete series, ignored
    }
  }
  const unk = tables(section(t, "Not in these photos")).find((x) => x[0] && x[0][0].toLowerCase() === "vaccine");
  if (unk) for (const c of unk.slice(1)) {
    const f = fam(c[0]), st = (c[1] || "").toLowerCase();
    if (f.doses.length) continue;
    if (/^never|not received|never received/.test(st)) { f.status = "da fare"; f.note = "Never done"; }
    else { f.status = "non noto"; f.note = "Not in the record"; }
  }
  const today = new Date().toISOString().slice(0, 10);
  const booked = records.filter((r) => r.type === "vaccino" && r.date >= today);
  const rows = [...fams.values()].map((f) => {
    const doses = f.doses.sort((a, b) => (a.date < b.date ? -1 : 1));
    const bk = booked.find((r) => f.words.some((w) => r.title.toLowerCase().includes(w)));
    let status = f.status ?? (doses.length ? "fatto" : "non noto");
    if (bk && status !== "fatto") status = "prenotato";
    return { name: f.name, status, doses, booked: bk ? { date: bk.date, title: bk.title, place: bk.place } : null, note: f.note };
  });
  const order = { prenotato: 0, "da fare": 1, fatto: 2, "non noto": 3 };
  rows.sort((a, b) => order[a.status] - order[b.status]);
  return { rows, sessions: [...sessions.values()] };
}

const GROUP_IT = { lipids: "Blood fats", "glucose / metabolism": "Sugar and metabolism", kidney: "Kidneys", liver: "Liver", "inflammation / vascular": "Inflammation", thyroid: "Thyroid", "blood count": "Blood count", urine: "Urine" };
const enDate = (iso) => { const [y, m, d] = iso.split("-"); return `${Number(d)} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1]} ${y}`; };
const KEY_MARKERS = [/^(colesterolo totale|total cholesterol)/i, /^ldl/i, /^(glucosio|glucose)/i, /^hba1c/i, /^(acido urico|uric acid)/i, /^tsh/i];
// is "value" outside "ref" (forms: "a - b", "<=x", ">=x")? null when it cannot tell
const itNum = (x) => String(x).replace(/(\d)\.(\d)/g, "$1,$2");
const outOf = (value, ref) => {
  const v = parseFloat(String(value).replace(",", ".")); if (isNaN(v) || !ref) return null;
  let m;
  if ((m = /^\s*([\d.]+)\s*-\s*([\d.]+)/.exec(ref))) return v < +m[1] || v > +m[2];
  if ((m = /^\s*<=?\s*([\d.]+)/.exec(ref))) return v > +m[1];
  if ((m = /^\s*>=?\s*([\d.]+)/.exec(ref))) return v < +m[1];
  return null;
};

function readLabs(kb) {
  const dir = join(kb, "data/body/labs");
  if (!existsSync(dir)) return [];
  const idx = read(join(dir, "labs.md"));
  const markers = tables(section(idx, "Markers over time")).find((x) => x[0] && x[0][0].toLowerCase() === "marker");
  const reports = tables(section(idx, "Reports")).find((x) => x[0] && x[0][0].toLowerCase() === "date");
  const out = [];
  for (const f of readdirSync(dir).filter((x) => /^lab-\d{4}-\d{2}-\d{2}\.md$/.test(x)).sort()) {
    const fm = front(read(join(dir, f))), date = fv(fm, "date");
    if (!date || !ISO.test(date)) continue;
    const drawn = fv(fm, "drawn"), oor = fv(fm, "out_of_range");
    const cat = (reports && reports.slice(1).find((c) => c[0] === date)?.[1]) || fv(fm, "category") || "Tests";
    const groups = [];
    if (markers) {
      const col = markers[0].indexOf(date), unitI = markers[0].findIndex((c) => c.toLowerCase() === "unit"), refI = markers[0].findIndex((c) => c.toLowerCase().startsWith("reference"));
      let g = null;
      if (col > 0) for (const c of markers.slice(1)) {
        if (/^\*\*.+\*\*$/.test(c[0]) && !c[col]) { g = { title: GROUP_IT[clean(c[0]).toLowerCase()] ?? clean(c[0]), items: [] }; groups.push(g); continue; }
        const val = (c[col] || "").trim(); if (!val || /comment/i.test(c[0])) continue;
        if (!g) { g = { title: "Values", items: [] }; groups.push(g); }
        const star = /\*/.test(val), ref = refI > 0 ? clean(c[refI]) : "", v = val.replace(/\*/g, "").trim();
        g.items.push({ name: clean(c[0]).replace(/\s*\([^)]*\)/g, ""), value: itNum(v), unit: unitI > 0 ? clean(c[unitI]) : "", ref: itNum(ref).replace(/<=/g, "\u2264").replace(/>=/g, "\u2265"), out: star || outOf(v, ref) === true });
      }
    }
    const all = groups.flatMap((x) => x.items);
    const nOut = oor !== null && !isNaN(+oor) ? +oor : all.filter((x) => x.out).length;
    const keys = KEY_MARKERS.map((re) => all.find((x) => re.test(x.name))).filter(Boolean).slice(0, 4);
    const lab = [fv(fm, "lab"), fv(fm, "site")].filter(Boolean).join(", ");
    out.push({
      date: drawn && ISO.test(drawn) ? drawn : date, type: "prelievo", title: `Blood draw: ${clean(cat).replace(/\+/g, "and").replace(/\s+/g, " ").toLowerCase()}`, place: lab,
      summary: `${nOut === 0 ? "No values out of range" : nOut === 1 ? "1 value out of range" : `${nOut} values out of range`}${keys.length ? ". " + keys.map((k) => `${k.name.replace(/\s*\(.*\)$/, "")} ${k.value.split(" ")[0]}`).join(", ") : ""}.`,
      details: [drawn && drawn !== date ? `Blood draw on ${enDate(drawn)}, report of ${enDate(date)}` : `Report of ${enDate(date)}`],
      groups, out: nOut, source: `data/body/labs/${f}`,
    });
  }
  return out;
}

export function readArchive(kb) {
  const records = readRecords(kb);
  const vax = readVaccines(kb, records);
  const labs = readLabs(kb);
  const vaxEntries = vax.sessions.map((s) => ({ date: s.date, type: "vaccino", title: `Vaccines: ${s.names.join(", ")}`, place: s.place, summary: `${s.names.length === 1 ? "1 vaccine" : `${s.names.length} vaccines`} from the vaccination record.`, details: s.doses || [], source: "data/health/vaccinations.md" }));
  const items = [...records, ...labs, ...vaxEntries].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
  return { items, vaccines: vax.rows };
}

// node archive.mjs [kb]: print the archive (debug)
if (import.meta.url === `file://${process.argv[1]}`) {
  const a = readArchive(process.argv[2] || join(new URL(".", import.meta.url).pathname, "../.."));
  console.log(JSON.stringify(a, null, 1));
}
