// Life App only: a section for home blood pressure and waist circumference.
// Blood pressure has its own Medical page, waist sits inside the Body > Weight page.
// Build-time patches on the bundled health App, same strict style as build.mjs (every anchor must match exactly once,
// else the build stops): a "Blood pressure" row in Health > Medical with its sub-page (screen { kind: "pressione" }), and the
// "Waist" block inside the Body > Weight page (after Weigh-ins, before Body composition).
// Must run AFTER archivePatches (it anchors on the archive screen kind). Data: MISURE (misure-data.ts, written by
// build.mjs from misure.mjs: data/health/blood-pressure.md, data/body/waist.md).
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function misurePatches(patch, here) {
  const src = readFileSync(join(here, "misure.fragments.txt"), "utf8");
  const m = /\/\/ ==== FRAGMENT: misure ====\n([\s\S]*)$/.exec(src); if (!m) throw new Error("fragment misure");
  patch("misure screen type", '| { kind: "archive" } | null;', '| { kind: "archive" } | { kind: "pressione" } | null;');
  patch("misure fragment", "\n  // =================== PAST VISITS ===================\n", "\n" + m[1] + "\n  // =================== PAST VISITS ===================\n");
  patch("misure medico row", '    { key: "labs", icon: ic("pulse", K.t2, 22), title: "Blood draws",',
    '    { key: "pressione", icon: ic("heart", K.t2, 22), title: "Blood pressure", sub: misAll ? `${misAll.sys}/${misAll.dia} 7-day average` : misLastBp ? `Last: ${misLastBp.sys}/${misLastBp.dia}` : "To measure", s: { kind: "pressione" }, show: true },\n    { key: "labs", icon: ic("pulse", K.t2, 22), title: "Blood draws",');
  // Waist inside the Body > Weight page (pesoPage, added by build.mjs "peso page"), after the weigh-ins list
  patch("waist in Weight", '      {sectionTitle("Body composition")}\n', "      {giroVitaBlock}\n" + '      {sectionTitle("Body composition")}\n');
  patch("misure screen content", 'screen.kind === "archive" ? archiveScreen :', 'screen.kind === "archive" ? archiveScreen : screen.kind === "pressione" ? pressioneScreen :');
}
