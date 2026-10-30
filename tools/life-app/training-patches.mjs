// Life App only: workouts in Body, MD first. Build-time patches on the bundled health App,
// in the same strict style as build.mjs (every anchor must match exactly, else the build stops).
//   - Body kcal card: Done (kcal per session, gym rows open their exercises) / In progress / To do (calendar time,
//     plan description, template exercises with last time's load) / "All done today"
//   - gym session page: exercises on top; empty zone and comparison cards and a Note that repeats the exercises are hidden
//   - Training page: week strip + the one session list, last 8 weeks, main lifts, volume (from 3 logged sessions)
//   - Effort: no second week/session list (it lives in Training)
//   - LIFTS: generated from data/training/*.md (training.mjs) instead of the hand-copied list in the Page source
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function trainingPatches(patch, here, lifts) {
  const src = readFileSync(join(here, "health-training.fragments.txt"), "utf8");
  const frag = (name) => { const m = new RegExp(`// ==== FRAGMENT: ${name} ====\\n([\\s\\S]*?)(?=// ==== FRAGMENT: |$)`).exec(src); if (!m) throw new Error("fragment " + name); return m[1]; };
  patch("lifts from md", /const LIFTS: \{ date: string; ex: string; kg: number; sets: number \| null; reps: number \| null \}\[\] = \[[\s\S]*?\n\];/,
    () => `const LIFTS: { date: string; ex: string; kg: number; sets: number | null; reps: number | null }[] = ${JSON.stringify(lifts)};`);
  patch("ex open state", "const setSel = (x: string) => { setSelS(x); if (props.onSel) props.onSel(x); };",
    "const setSel = (x: string) => { setSelS(x); if (props.onSel) props.onSel(x); };\n" + frag("hooks"));
  patch("life oggi + allenamento", "\n  const todayHero = (() => {\n", "\n" + frag("oggi") + frag("fitness") + "  const todayHero = (() => {\n");
  patch("kcal card rows", "rows = workoutRows(d, false), bl = bal(d);", "rows = props.embed ? lifeOggi(d) : workoutRows(d, false), bl = bal(d);");
  patch("allenamento page", "{live ? matchCard : null}{fitness}</div>", "{live ? matchCard : null}{lifeFitness}</div>");
  // gym session page
  patch("session exercises top", '{w.status === "pianificato" ? " · planned" : ""}</span>\n        </div>\n',
    '{w.status === "pianificato" ? " · planned" : ""}</span>\n        </div>\n        {props.embed && isGym(k) && exOfW(date, w).length ? lifeExCard(exOfW(date, w)) : null}\n');
  patch("session exercises bottom", "        {w.exercises && w.exercises.length ? (", "        {!props.embed && w.exercises && w.exercises.length ? (");
  patch("session note", '        {w.detail ? <div style={{ ...card, ...st(6) }}><span style={capLbl(12)}>Note</span>', '        {w.detail && !(props.embed && noteDup(date, w)) ? <div style={{ ...card, ...st(6) }}><span style={capLbl(12)}>Note</span>');
  patch("session zones", '{zoneCard(zm, "Zones in this session",', '{props.embed && sum(zm) === 0 ? null : zoneCard(zm, "Zones in this session",');
  patch("session compare", "        {prev ? (\n          <div style={{ ...card, ...st(10) }}>\n            <span style={capLbl(12)}>Compared with the previous one</span>",
    "        {prev && !(props.embed && !cmp.length) ? (\n          <div style={{ ...card, ...st(10) }}>\n            <span style={capLbl(12)}>Compared with the previous one</span>");
  // Effort: the week goals strip and the other sessions live in Training
  patch("sforzo week card", "        {gymCard}\n", "        {props.embed ? null : gymCard}\n");
  patch("sforzo other sessions", '{chronoW.some((e) => e.date !== d.date) ? listCard("Other sessions"', '{!props.embed && chronoW.some((e) => e.date !== d.date) ? listCard("Other sessions"');
}
