// Life App only (2026-10-28): a section for home blood pressure and waist circumference.
// 2026-10-29: blood pressure on its own Medico page, waist inside the Corpo > Peso page.
// Build-time patches on the bundled health App, same strict style as build.mjs (every anchor must match exactly once,
// else the build stops): a "Pressione" row in Salute > Medico with its sub-page (screen { kind: "pressione" }), and the
// "Giro vita" block inside the Corpo > Peso page (after Pesate, before Composizione corporea).
// Must run AFTER archivePatches (it anchors on the archive screen kind). Data: MISURE (misure-data.ts, written by
// build.mjs from misure.mjs: data/health/blood-pressure.md, data/body/waist.md).
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function misurePatches(patch, here) {
  const src = readFileSync(join(here, "misure.fragments.txt"), "utf8");
  const m = /\/\/ ==== FRAGMENT: misure ====\n([\s\S]*)$/.exec(src); if (!m) throw new Error("fragment misure");
  patch("misure screen type", '| { kind: "archive" } | null;', '| { kind: "archive" } | { kind: "pressione" } | null;');
  patch("misure fragment", "\n  // =================== VISITE FATTE ===================\n", "\n" + m[1] + "\n  // =================== VISITE FATTE ===================\n");
  patch("misure medico row", '    { key: "labs", icon: ic("pulse", K.t2, 22), title: "Prelievi",',
    '    { key: "pressione", icon: ic("heart", K.t2, 22), title: "Pressione", sub: misAll ? `${misAll.sys}/${misAll.dia} media 7 giorni` : misLastBp ? `Ultima: ${misLastBp.sys}/${misLastBp.dia}` : "Da misurare", s: { kind: "pressione" }, show: true },\n    { key: "labs", icon: ic("pulse", K.t2, 22), title: "Prelievi",');
  // Giro vita inside the Corpo > Peso page (pesoPage, added by build.mjs "peso page"), after the weigh-ins list
  patch("giro vita in peso", '      {sectionTitle("Composizione corporea")}\n', "      {giroVitaBlock}\n" + '      {sectionTitle("Composizione corporea")}\n');
  patch("misure screen content", 'screen.kind === "archive" ? archiveScreen :', 'screen.kind === "archive" ? archiveScreen : screen.kind === "pressione" ? pressioneScreen :');
}
