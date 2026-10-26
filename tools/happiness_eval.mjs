// Node helper for tools/happiness.py: reads the TypeScript object literals of the health page source (tools/life-app/src/health/health-page.tsx) (DATA, MEDICO)
// and writes JSON back into a copy of the Page source.
// Types are stripped with esbuild (the same one the app builds use), then the literal is evaluated in an empty vm.
//   node tools/happiness_eval.mjs extract-canvas CANVAS.tsx          -> {"corpo": DATA, "medico": MEDICO} on stdout
//   node tools/happiness_eval.mjs eval-block FILE                    -> DATA from a DATA block file (happiness.py import-data-block)
//   node tools/happiness_eval.mjs inject CANVAS.tsx CORPO.json MEDICO.json OUT.tsx [WEIGHTS.json]
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(HERE, "life-app/package.json"));
const esbuild = require("esbuild");
const die = (m) => { console.error("happiness_eval: " + m); process.exit(3); };

// [start, end) of the object literal assigned to `const NAME: TYPE = { ... };` (declaration line ends with "= {")
function span(src, name, endBefore) {
  const decl = new RegExp("^(?:export )?const " + name + ": .* = \\{$", "m").exec(src);
  if (!decl) die(`const ${name} declaration not found`);
  const start = decl.index + decl[0].length - 1;
  let end;
  if (endBefore) {
    const e = src.indexOf(endBefore, start); if (e < 0) die(`${endBefore} not found after ${name}`);
    end = src.lastIndexOf("};", e) + 1;
  } else {
    const m = /^\};$/m.exec(src.slice(start)); if (!m) die(`end of ${name} not found`);
    end = start + m.index + 1;
  }
  if (src[start] !== "{" || src[end - 1] !== "}") die(`bad span for ${name}`);
  return [start, end];
}
const evalLiteral = (lit) => {
  const js = esbuild.transformSync("const __v = (" + lit + ");", { loader: "ts" }).code;
  const ctx = {}; vm.runInNewContext(js + "\n__out = __v;", ctx); return ctx.__out;
};
const DATA_END = "// ==== DATA:END";
// JS literal with unquoted identifier keys (the Page style); only keys outside strings are touched (inner quotes are escaped)
const toLiteral = (v) => JSON.stringify(v, null, 2).replace(/(^|[\s{,])"([A-Za-z_$][\w$]*)":/g, "$1$2:");

const [cmd, ...a] = process.argv.slice(2);
if (cmd === "extract-canvas") {
  const s = readFileSync(a[0], "utf8");
  const [d0, d1] = span(s, "DATA", DATA_END), [m0, m1] = span(s, "MEDICO");
  process.stdout.write(JSON.stringify({ corpo: evalLiteral(s.slice(d0, d1)), medico: evalLiteral(s.slice(m0, m1)) }));
} else if (cmd === "eval-block") {
  const s = readFileSync(a[0], "utf8");
  const [d0, d1] = span(s, "DATA", s.includes(DATA_END) ? DATA_END : null);
  process.stdout.write(JSON.stringify(evalLiteral(s.slice(d0, d1))));
} else if (cmd === "inject") {
  let s = readFileSync(a[0], "utf8");
  const corpo = JSON.parse(readFileSync(a[1], "utf8")), medico = JSON.parse(readFileSync(a[2], "utf8"));
  const [m0, m1] = span(s, "MEDICO"); s = s.slice(0, m0) + toLiteral(medico) + s.slice(m1);   // MEDICO sits after DATA: replace it first
  const [d0, d1] = span(s, "DATA", DATA_END); s = s.slice(0, d0) + toLiteral(corpo) + s.slice(d1);
  if (a[4]) {  // optional WEIGHTS.json (from data/body/weigh-ins.md): replaces the Page's WEIGHTS list
    const re = /^const WEIGHTS: \{ date: string; kg: number \}\[\] = \[\n[\s\S]*?^\];$/m;
    if (!re.test(s)) die("const WEIGHTS list not found");
    const ws = JSON.parse(readFileSync(a[4], "utf8"));
    s = s.replace(re, () => "const WEIGHTS: { date: string; kg: number }[] = [\n" + ws.map((w) => `  { date: "${w.date}", kg: ${Number(w.kg)} },\n`).join("") + "];");
  }
  writeFileSync(a[3], s);
} else die("unknown command " + cmd);
