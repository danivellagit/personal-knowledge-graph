// Life App only (2026-10-27, the owner: "tutte le visite vecchie, vaccini, referti: non c'è un posto dove vederli in app").
// Build-time patches on the bundled health App, same strict style as build.mjs (every anchor must match exactly once,
// else the build stops): a last "Archivio" row in Salute > Medico and its sub-page (screen { kind: "archive" }).
// Data: ARCHIVE (archive-data.ts, written by build.mjs from archive.mjs: records.md, vaccinations.md, data/body/labs).
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function archivePatches(patch, here) {
  const src = readFileSync(join(here, "archive.fragments.txt"), "utf8");
  const frag = (name) => { const m = new RegExp(`// ==== FRAGMENT: ${name} ====\\n([\\s\\S]*?)(?=// ==== FRAGMENT: |$)`).exec(src); if (!m) throw new Error("fragment " + name); return m[1]; };
  patch("archive screen type", '| { kind: "visits" } | null;', '| { kind: "visits" } | { kind: "archive" } | null;');
  patch("archive fragment", "\n  // =================== VISITE FATTE ===================\n", "\n" + frag("archive") + "\n  // =================== VISITE FATTE ===================\n");
  patch("archive medico row", /(title: "Visite fatte", [^\n]*show: true \},\n)(  \];\n  const medShown)/,
    '$1    { key: "archive", icon: hIc("box", K.t2, 22), title: "Archivio", sub: `${arcPast.length} voci${arcFirst ? ` dal ${arcFirst}` : ""} · vaccini`, s: { kind: "archive" }, show: ARC_ITEMS.length > 0 || ARC_VAX.length > 0 },\n$2');
  patch("archive screen content", ': screen.kind === "visits" ? visitsScreen :', ': screen.kind === "visits" ? visitsScreen : screen.kind === "archive" ? archiveScreen :');
}
