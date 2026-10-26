// Life App only (2026-10-25, the owner: "i passi giornalieri ... 10.000 passi giornalieri come obiettivo ... deve essere un
// dettaglio che apri e c'hai un mondo sui passi"). Build-time patches on the bundled health App, same strict style as
// build.mjs (every anchor must match exactly once, else the build stops):
//   - Corpo hub: "Passi" card right under the calories-burned card (Oggi in breve), following the day picker
//   - screen { kind: "steps" }: today vs the goal, current and best streak, days at goal this month, best day,
//     last 30 days chart with the goal line, averages (7 days, 30 days, this vs last month), month by month
//   - the kcal card drops its own small "Passi" tile in the Life App (the card below says it once)
// Data: STEPS_HIST (gen.ts, from data/body/steps-history.md + data/body/body-*.md) and corpo.json (days, history, stepsGoal).
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function stepsPatches(patch, here) {
  const src = readFileSync(join(here, "steps.fragments.txt"), "utf8");
  const frag = (name) => { const m = new RegExp(`// ==== FRAGMENT: ${name} ====\\n([\\s\\S]*?)(?=// ==== FRAGMENT: |$)`).exec(src); if (!m) throw new Error("fragment " + name); return m[1]; };
  patch("steps screen type", 'type Screen = { kind: "dial"; id: DialId } |', 'type Screen = { kind: "steps" } | { kind: "dial"; id: DialId } |');
  patch("steps fragment", "\n  const todayHero = (() => {\n", "\n" + frag("steps") + "  const todayHero = (() => {\n");
  patch("steps hub card", "      {todayHero}\n      <button onClick={() => open({ kind: \"coach\" })} aria-label=\"Cosa fare oggi\"", "      {todayHero}\n      {stepsCard}\n      <button onClick={() => open({ kind: \"coach\" })} aria-label=\"Cosa fare oggi\"");
  patch("steps screen content", ': screen.kind === "hr" ? (hrScreen() ?? coachScreen) :', ': screen.kind === "hr" ? (hrScreen() ?? coachScreen) : screen.kind === "steps" ? stepsScreen() :');
  patch("kcal card no steps tile", '        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>\n          {miniTile("Passi", isNum(d.steps) ? kcalTxt(d.steps) : "—")}',
    '        <div style={{ display: "grid", gridTemplateColumns: props.embed ? "repeat(2, minmax(0,1fr))" : "repeat(3, minmax(0,1fr))", gap: 8 }}>\n          {props.embed ? null : miniTile("Passi", isNum(d.steps) ? kcalTxt(d.steps) : "—")}');
}
