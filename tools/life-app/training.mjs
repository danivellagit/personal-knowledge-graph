// Build-time only: data/training/*.md (MD first: the markdown is the source of truth, the app only displays it) ->
// TRAINING { logs, sessions, plans } and the lift history (LIFTS) for the Life App Corpo pages.
// Format: data/agents/fitness-coach/memory.md "Training log format (Life App)".
//   - one "## " heading per session in data/training/training-YYYY-MM-DD.md; the first HH:MM in it is the start time
//   - under it an "### Esercizi" table: | Esercizio | Serie | Ripetizioni | kg | Note |  (empty cell = not stated, "~60" = about 60)
//   - plan templates in data/training/plans/*.md: frontmatter name, kind, match, default + the same "### Esercizi" table
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const front = (t) => (/^---\n([\s\S]*?)\n---/.exec(t) || [])[1] || "";
const fv = (fr, k) => { const m = new RegExp("^" + k + ":[ \\t]*(.*)$", "m").exec(fr); if (!m) return null; const v = m[1].replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "").trim(); return v || null; };
const hhmm = (s) => { const m = /(\d{1,2})[:.](\d{2})/.exec(s || ""); return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null; };
// session kind from the heading text (falls back to the file's frontmatter kind)
export const kindOfHeading = (h, fileKind) => {
  const t = h.toLowerCase();
  if (/\bgrid\b|crossfit/.test(t)) return "grid";
  if (/\bgym\b|palestra|weights|strength|upper body|lower body/.test(t)) return "palestra";
  if (/padel/.test(t)) return "padel";
  if (/beach/.test(t)) return "beach";
  if (/tennis/.test(t)) return "tennis";
  if (/calcio|football|soccer/.test(t)) return "calcio";
  if (/\brun\b|corsa/.test(t)) return "corsa";
  const fk = (fileKind || "").toLowerCase();
  return fk === "gym" ? "palestra" : fk === "beach-volley" ? "beach" : null;
};
const num = (c) => { const m = /(\d+(?:[.,]\d+)?)/.exec(c || ""); return m ? Number(m[1].replace(",", ".")) : null; };
// the "### Esercizi" (or "### Exercises") table of a block of lines; only tables in the documented column format
export const parseExercises = (lines) => {
  const out = [];
  const i0 = lines.findIndex((l) => /^###\s+(Esercizi|Exercises)\b/i.test(l));
  if (i0 < 0) return out;
  let i = i0 + 1;
  while (i < lines.length && !lines[i].trim().startsWith("|")) { if (/^#{2,3}\s/.test(lines[i])) return out; i++; }
  if (i >= lines.length) return out;
  const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const head = cells(lines[i]).map((c) => c.toLowerCase());
  const col = (re) => head.findIndex((h) => re.test(h));
  const cN = col(/^(esercizio|exercise)$/), cS = col(/^(serie|sets)$/), cR = col(/^(ripetizioni|reps)$/), cK = col(/^kg$/), cNo = col(/^(note|notes)$/);
  if (cN < 0 || cS < 0 || cR < 0 || cK < 0) return out; // not the structured format (e.g. an old free table)
  for (i += 2; i < lines.length && lines[i].trim().startsWith("|"); i++) {
    const c = cells(lines[i]), name = (c[cN] || "").trim(); if (!name) continue;
    const kgC = c[cK] || "";
    out.push({ name, sets: num(c[cS]), reps: num(c[cR]), kg: num(kgC), approx: /~|circa|ca\./.test(kgC), note: cNo >= 0 && c[cNo] ? c[cNo] : null });
  }
  return out;
};

export function readTraining(kb) {
  const dir = join(kb, "data/training");
  const logs = [], sessions = [], plans = [];
  for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => /^training-\d{4}-\d{2}-\d{2}\.md$/.test(x)).sort() : []) {
    const date = f.slice(9, 19), t = readFileSync(join(dir, f), "utf8"), fileKind = fv(front(t), "kind");
    const lines = t.replace(/^---\n[\s\S]*?\n---\n/, "").split("\n");
    const heads = lines.map((l, i) => (/^## /.test(l) ? i : -1)).filter((i) => i >= 0);
    heads.forEach((h, j) => {
      const title = lines[h].slice(3).trim(), kind = kindOfHeading(title, fileKind);
      if (!kind) return;
      const block = lines.slice(h + 1, j + 1 < heads.length ? heads[j + 1] : lines.length);
      const time = hhmm(title.replace(/\([^)]*(fitbit|heart|max|zone)[^)]*\)/gi, ""));
      sessions.push({ date, time, kind });
      const exercises = parseExercises(block);
      if (exercises.length) logs.push({ date, time, kind, title, exercises });
    });
  }
  const pdir = join(dir, "plans");
  for (const f of existsSync(pdir) ? readdirSync(pdir).filter((x) => x.endsWith(".md")).sort() : []) {
    const t = readFileSync(join(pdir, f), "utf8"), fr = front(t);
    const exercises = parseExercises(t.split("\n"));
    if (!exercises.length) continue;
    plans.push({ file: f, name: fv(fr, "name") || f.replace(/\.md$/, ""), kind: fv(fr, "kind") || "palestra", match: fv(fr, "match"), isDefault: fv(fr, "default") === "true", exercises });
  }
  // lift history: one row per exercise with a load, per logged session (replaces the hand-copied LIFTS list)
  const lifts = logs.flatMap((l) => l.exercises.filter((e) => e.kg !== null).map((e) => ({ date: l.date, ex: e.name, kg: e.kg, sets: e.sets, reps: e.reps })));
  return { logs, sessions, plans, lifts };
}
