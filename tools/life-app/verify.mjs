// End-to-end check of a built Life App site, the way a phone sees it.
//
//   node tools/life-app/verify.mjs [SITE_DIR_OR_URL] [--password-file FILE] [--shots DIR]
//
// 1. static: index.html carries the payload and none of the app's plaintext (no area names, no sample strings);
// 2. served on 127.0.0.1 (a secure context, so WebCrypto works) at iPhone size: the lock screen shows, a wrong password
//    is refused, the right one renders Home, then every tab and the three "Altro" areas open without a page error.
// Screenshots go to --shots (default tools/life-app/out/verify). Uses an installed Chrome (or CHROME_PATH) through
// playwright-core (a dev dependency: `npm ci` in tools/life-app). Exits 1 on any failed check.
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { join, dirname, resolve, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const flag = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const pos = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !(i > 0 && all[i - 1].startsWith("--")));
const CFG = JSON.parse(execFileSync("python3", [join(HERE, "life_config.py")], { encoding: "utf8" }));
const site = pos[0] || join(HERE, "out/site");
const pwFile = flag("password-file", CFG.password_file);
const shots = resolve(flag("shots", join(HERE, "out/verify")));
if (!existsSync(pwFile)) { console.error("password file missing: " + pwFile); process.exit(2); }
const pw = readFileSync(pwFile, "utf8").replace(/\r?\n$/, "");
mkdirSync(shots, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; };

let base = site;
let server = null;
if (!/^https?:/.test(site)) {
  const html = readFileSync(join(site, "index.html"), "utf8");
  ok(html.includes('"c":"'), "index.html carries an encrypted payload");
  const plain = ["Life Health", "esempio", ...CFG.areas.map((a) => a.name).filter((n) => n.length > 4)];
  ok(!plain.some((w) => html.toLowerCase().includes(`>${w.toLowerCase()}<`) || html.includes(w + "</")), "no app plaintext in index.html");
  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".webmanifest": "application/manifest+json", ".png": "image/png", ".txt": "text/plain" };
  server = createServer((q, r) => {
    const p = normalize(decodeURIComponent(new URL(q.url, "http://x").pathname)).replace(/^\/+/, "") || "index.html";
    const f = join(site, p);
    if (!f.startsWith(resolve(site)) || !existsSync(f)) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" }); r.end(readFileSync(f));
  });
  await new Promise((y) => server.listen(0, "127.0.0.1", y));
  base = `http://127.0.0.1:${server.address().port}/`;
}
let pwmod;
try { pwmod = await import("playwright-core"); } catch { console.error("playwright-core missing: run `npm ci` in " + HERE); process.exit(2); }
const exe = process.env.CHROME_PATH || ["/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium"].find(existsSync);
const browser = await pwmod.chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "dark", timezoneId: CFG.timezone });
const pg = await ctx.newPage();
const errs = [];
pg.on("pageerror", (e) => errs.push(String(e)));
await pg.goto(base);
await pg.waitForSelector("#lock:not([hidden])");
await pg.screenshot({ path: join(shots, "lock.png") });
await pg.fill("#pw", pw + "-wrong"); await pg.click("#go"); await pg.waitForTimeout(2500);
ok((await pg.$(".wb-root")) === null, "a wrong password is refused");
await pg.fill("#pw", pw); await pg.click("#go");
try { await pg.waitForSelector(".wb-root", { timeout: 30000 }); ok(true, "the right password renders the app"); } catch { ok(false, "the right password renders the app"); }
await pg.waitForTimeout(1200); await pg.screenshot({ path: join(shots, "home.png") });
ok(await pg.isVisible("text=Life Health"), "Home shows Life Health");
const tabs = await pg.$$eval(".wb-tab", (bs) => bs.map((b) => b.getAttribute("aria-label")));
for (const t of tabs) {
  await pg.click(`.wb-tab[aria-label='${t}']`); await pg.waitForTimeout(700);
  await pg.screenshot({ path: join(shots, `tab-${t.toLowerCase()}.png`) });
  ok(errs.length === 0, `tab ${t} opens without a page error`);
}
for (const a of CFG.areas.filter((x) => ["relazioni", "crescita", "vita"].includes(x.id) && x.enabled)) {
  await pg.click(`button[aria-label='Apri ${a.name}']`); await pg.waitForTimeout(600);
  await pg.screenshot({ path: join(shots, `area-${a.id}.png`) });
  ok(errs.length === 0, `area ${a.name} opens without a page error`);
  await pg.click("button[aria-label='Indietro']"); await pg.waitForTimeout(300);
}
if (errs.length) console.log(errs.slice(0, 5).join("\n"));
await browser.close(); if (server) server.close();
console.log(fails ? `${fails} check(s) failed` : "ALL_OK", "· screenshots in", shots);
process.exit(fails ? 1 : 0);
