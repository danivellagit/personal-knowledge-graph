// Life App only: one place in the app for past visits, vaccines and reports.
// Build-time patches on the bundled health App, same strict style as build.mjs (every anchor must match exactly once,
// else the build stops): a last "Archive" row in Health > Medical and its sub-page (screen { kind: "archive" }).
// Data: ARCHIVE (archive-data.ts, written by build.mjs from archive.mjs: records.md, vaccinations.md, data/body/labs).
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function archivePatches(patch, here) {
  const src = readFileSync(join(here, "archive.fragments.txt"), "utf8");
  const frag = (name) => { const m = new RegExp(`// ==== FRAGMENT: ${name} ====\\n([\\s\\S]*?)(?=// ==== FRAGMENT: |$)`).exec(src); if (!m) throw new Error("fragment " + name); return m[1]; };
  patch("archive screen type", '| { kind: "visits" } | null;', '| { kind: "visits" } | { kind: "archive" } | null;');
  patch("archive fragment", "\n  // =================== PAST VISITS ===================\n", "\n" + frag("archive") + "\n  // =================== PAST VISITS ===================\n");
  patch("archive medico row", /(title: "Past visits", [^\n]*show: true \},\n)(  \];\n  const medShown)/,
    '$1    { key: "archive", icon: hIc("box", K.t2, 22), title: "Archive", sub: `${arcPast.length} entries${arcFirst ? ` since ${arcFirst}` : ""} · vaccines`, s: { kind: "archive" }, show: ARC_ITEMS.length > 0 || ARC_VAX.length > 0 },\n$2');
  patch("archive screen content", ': screen.kind === "visits" ? visitsScreen :', ': screen.kind === "visits" ? visitsScreen : screen.kind === "archive" ? archiveScreen :');
}
