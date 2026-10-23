// Build the encrypted health PWA from a React page source.
//
//   node build.mjs [--source page.tsx] [--data data-block.ts] [--out DIR]
//                  [--password-file FILE] [--salt-file FILE] [--avatar IMAGE]
//
// Usually run by tools/publish_health_app.sh, which reads the `health_app:` config and passes the
// same values as environment variables (every flag has one: HEALTH_APP_SOURCE, HEALTH_APP_DATA,
// HEALTH_APP_OUT, HEALTH_APP_PASSWORD_FILE, HEALTH_APP_SALT_FILE, HEALTH_APP_AVATAR; the look and the
// wording come from HEALTH_APP_NAME, _DESCRIPTION, _LANG, _THEME_COLOR, _ACCENT, _UI_*).
//
// What it does: splice the DATA block (optional), bundle the page with React (esbuild, one IIFE),
// encrypt the WHOLE bundle (code + data + avatar) with AES-256-GCM under a key derived from the
// password (PBKDF2-SHA256, 310k iterations, fixed per-instance salt), and write a static site:
// index.html (unlock shell + ciphertext), manifest, service worker, icons, version.txt,
// robots.txt (Disallow all) and .nojekyll. No plaintext of the page ever reaches the output dir.
// Prints one JSON line; `plainHash` fingerprints the plaintext so the publisher can skip no-op pushes.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync, readdirSync, mkdtempSync, statSync } from "node:fs";
import { join, dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir, homedir } from "node:os";
import { webcrypto as wc, randomBytes, createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const ITER = 310000;
const die = (code, msg) => { console.error(msg); process.exit(code); };
const tilde = (p) => (p && p.startsWith("~") ? join(homedir(), p.slice(1)) : p);
const arg = (n, env, d) => {
  const i = process.argv.indexOf("--" + n);
  if (i > 0) return process.argv[i + 1];
  return (env && process.env[env] && process.env[env].trim()) || d;
};
const env = (k, d) => (process.env[k] && process.env[k].trim()) || d;

const src = resolve(tilde(arg("source", "HEALTH_APP_SOURCE", join(HERE, "example-page.tsx"))));
const dataFile = tilde(arg("data", "HEALTH_APP_DATA", ""));
const out = resolve(tilde(arg("out", "HEALTH_APP_OUT", join(HERE, "out/site"))));
const pwFile = tilde(arg("password-file", "HEALTH_APP_PASSWORD_FILE", ""));
const saltFile = tilde(arg("salt-file", "HEALTH_APP_SALT_FILE", join(homedir(), ".cache/health-app/salt.txt")));
const avatar = tilde(arg("avatar", "HEALTH_APP_AVATAR", ""));

const NAME = env("HEALTH_APP_NAME", "Health");
const SLUG = NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "health";
const UI = {
  lang: env("HEALTH_APP_LANG", "en"),
  description: env("HEALTH_APP_DESCRIPTION", "Health and training, last 7 days"),
  theme: env("HEALTH_APP_THEME_COLOR", "#0B0E10"),
  accent: env("HEALTH_APP_ACCENT", "#00F19F"),
  password: env("HEALTH_APP_UI_PASSWORD", "Password"),
  remember: env("HEALTH_APP_UI_REMEMBER", "Remember on this device"),
  unlock: env("HEALTH_APP_UI_UNLOCK", "Unlock"),
  wrong: env("HEALTH_APP_UI_WRONG", "Wrong password"),
  nocrypto: env("HEALTH_APP_UI_NO_CRYPTO", "This browser cannot decrypt the app (it needs HTTPS)."),
};
for (const k of ["theme", "accent"]) if (!/^#[0-9a-fA-F]{6}$/.test(UI[k])) die(2, `colour ${k} must be #RRGGBB, got ${UI[k]}`);

if (!existsSync(src)) die(2, `page source not found: ${src}`);
if (!pwFile) die(4, "no password file: set health_app.password_file (or HEALTH_APP_PASSWORD_FILE, or --password-file)");
if (!existsSync(pwFile)) die(4, `password file ${pwFile} does not exist`);
const pw = readFileSync(pwFile, "utf8").replace(/\r?\n$/, "");
if (!pw) die(4, "empty password file");
if (pw.length < 12) console.error("warning: the password is shorter than 12 characters; the ciphertext is public, use a long random one");

// --- 1. the page source, with the DATA block replaced if asked
let code = readFileSync(src, "utf8");
const START = /^.*\/\/ ==== DATA:START.*$/m, END = /^.*\/\/ ==== DATA:END ====.*$/m;
if (!START.test(code) || !END.test(code)) die(3, `DATA markers not found in ${src} (need "// ==== DATA:START" and "// ==== DATA:END ====")`);
if (dataFile) {
  if (!existsSync(dataFile)) die(3, `data file ${dataFile} does not exist`);
  // the block from the file, with or without its own marker lines
  let blk = readFileSync(dataFile, "utf8");
  if (START.test(blk) && END.test(blk)) blk = blk.slice(blk.search(START), blk.search(END)).replace(START, "").replace(/^\n/, "");
  const a = code.search(START), am = code.match(START)[0], b = code.search(END);
  code = code.slice(0, a + am.length) + "\n" + blk.replace(/\s+$/, "") + "\n" + code.slice(b);
}
const updatedAt = (code.slice(code.search(START), code.search(END)).match(/"?updatedAt"?\s*:\s*"([^"]+)"/) || [])[1] || "?";

// optional avatar: a data URI inside the encrypted bundle only, never a file in the site
let avatarUri = null;
if (avatar) {
  if (!existsSync(avatar)) die(2, `avatar ${avatar} does not exist`);
  const mime = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[extname(avatar).toLowerCase()];
  if (!mime) die(2, "avatar must be .jpg, .png or .webp");
  if (statSync(avatar).size > 200_000) console.error("warning: avatar over 200 KB; a 256x256 crop is plenty");
  avatarUri = `data:${mime};base64,${readFileSync(avatar).toString("base64")}`;
}

// --- 2. bundle, in a private temp dir (the spliced page holds the data in clear: never in the repo)
const esbuild = await import("esbuild").catch(() => die(5, `esbuild missing: run \`npm install\` in ${HERE}`));
const work = mkdtempSync(join(tmpdir(), "health-app-"));
let js;
try {
  writeFileSync(join(work, "page-src.tsx"), code);
  copyFileSync(join(HERE, "entry.jsx"), join(work, "entry.jsx"));
  writeFileSync(join(work, "avatar-init.js"), `globalThis.__HEALTH_APP_AVATAR__ = ${JSON.stringify(avatarUri)};\n`);
  const r = await esbuild.build({
    entryPoints: [join(work, "entry.jsx")], bundle: true, minify: true, format: "iife", write: false, target: ["safari15"],
    jsx: "automatic", alias: { "grok/canvas": join(HERE, "canvas-shim.js"), "page-kit": join(HERE, "canvas-shim.js") },
    nodePaths: [join(HERE, "node_modules")], define: { "process.env.NODE_ENV": '"production"' }, logLevel: "warning", legalComments: "none",
  });
  js = r.outputFiles[0].text;
} finally {
  rmSync(work, { recursive: true, force: true });
}

// --- 3. encrypt. The salt is per instance and FIXED: a key remembered on the phone keeps working
// across data updates and breaks only when the password changes. It is not secret (it is in the page).
if (!existsSync(saltFile)) {
  mkdirSync(dirname(saltFile), { recursive: true, mode: 0o700 });
  writeFileSync(saltFile, randomBytes(16).toString("base64") + "\n", { mode: 0o600 });
  console.error(`new salt written to ${saltFile} (keep it: losing it means re-entering the password on every device once)`);
}
const salt = Buffer.from(readFileSync(saltFile, "utf8").trim(), "base64");
if (salt.length < 16) die(4, `salt in ${saltFile} is not 16+ bytes of base64`);
const base = await wc.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
const key = await wc.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
const iv = randomBytes(12);
const ct = Buffer.from(await wc.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(js)));
const build = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13) + "-" + createHash("sha256").update(ct).digest("hex").slice(0, 8);
const P = { s: salt.toString("base64"), i: ITER, v: iv.toString("base64"), c: ct.toString("base64"), b: build };

// --- 4. the static site
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ink = (() => { const n = parseInt(UI.accent.slice(1), 16), l = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); return l > 140 ? "#00140C" : "#FFFFFF"; })();
const shell = readFileSync(join(HERE, "shell.html"), "utf8")
  .replaceAll("__APP_NAME__", esc(NAME)).replaceAll("__APP_SLUG__", SLUG).replaceAll("__LANG__", esc(UI.lang))
  .replaceAll("__THEME__", UI.theme).replaceAll("__ACCENT__", UI.accent).replaceAll("__ACCENT_INK__", ink)
  .replaceAll("__T_PASSWORD__", esc(UI.password)).replaceAll("__T_REMEMBER__", esc(UI.remember)).replaceAll("__T_UNLOCK__", esc(UI.unlock))
  .replace("__STRINGS__", () => JSON.stringify({ wrong: UI.wrong, nocrypto: UI.nocrypto, slug: SLUG }).replace(/</g, "\\u003c"));
const manifest = JSON.parse(readFileSync(join(HERE, "manifest.webmanifest"), "utf8"));
Object.assign(manifest, { name: NAME, short_name: NAME, description: UI.description, lang: UI.lang, background_color: UI.theme, theme_color: UI.theme });
const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const sw = readFileSync(join(HERE, "sw.js"), "utf8").replace("__APP_SLUG__", SLUG);
const ICONS = ["apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"];
for (const f of ICONS) if (!existsSync(join(HERE, "icons", f))) die(2, `icons/${f} missing: run \`python3 make_icons.py\` in ${HERE}`);

if (existsSync(out) && readdirSync(out).length && !existsSync(join(out, "version.txt")))
  die(2, `refusing to wipe ${out}: it is not empty and is not a previous build (no version.txt)`);
rmSync(out, { recursive: true, force: true }); mkdirSync(join(out, "icons"), { recursive: true });
writeFileSync(join(out, "index.html"), shell.replace("__PAYLOAD__", () => JSON.stringify(P)));
writeFileSync(join(out, "manifest.webmanifest"), manifestText);
writeFileSync(join(out, "sw.js"), sw);
for (const f of ICONS) copyFileSync(join(HERE, "icons", f), join(out, "icons", f));
writeFileSync(join(out, "version.txt"), build + "\n");
writeFileSync(join(out, ".nojekyll"), "");
writeFileSync(join(out, "robots.txt"), "User-agent: *\nDisallow: /\n");

// plaintext + wrapper fingerprint: the ciphertext changes on every build (random IV), this does not
const h = createHash("sha256").update(js).update(shell).update(sw).update(manifestText);
for (const f of ICONS) h.update(readFileSync(join(HERE, "icons", f)));
console.log(JSON.stringify({ out, build, dataUpdatedAt: updatedAt, jsBytes: js.length, htmlBytes: shell.length + JSON.stringify(P).length, plainHash: h.digest("hex") }));
