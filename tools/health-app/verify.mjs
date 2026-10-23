// End-to-end check of a built site, the way a phone would see it.
//
//   npm install            # once, in tools/health-app (adds playwright-core, a dev dependency)
//   node verify.mjs [SITE_DIR_OR_URL] --password-file FILE [--shots DIR]
//
// 1. static: index.html carries a payload and none of the page's plaintext markers;
// 2. served locally (127.0.0.1 is a secure context, so WebCrypto works) at iPhone size:
//    the lock screen shows, a wrong password is refused, the right one renders the page;
// 3. a second launch opens straight away (remembered key), and ?logout forgets it.
// Screenshots go to --shots (default out/verify). Uses an installed Google Chrome (or CHROME_PATH).
// Exits 1 on any failed check. The password file defaults to HEALTH_APP_PASSWORD_FILE.
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { join, dirname, resolve, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const tilde = (p) => (p && p.startsWith("~") ? join(homedir(), p.slice(1)) : p);
const flag = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const pos = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !(i > 0 && all[i - 1].startsWith("--")));
const site = pos[0] || join(HERE, "out/site");
const pwFile = tilde(flag("password-file", process.env.HEALTH_APP_PASSWORD_FILE || ""));
const shots = resolve(tilde(flag("shots", join(HERE, "out/verify"))));
if (!pwFile || !existsSync(pwFile)) { console.error("give --password-file FILE (or HEALTH_APP_PASSWORD_FILE)"); process.exit(2); }
const pw = readFileSync(pwFile, "utf8").replace(/\r?\n$/, "");
mkdirSync(shots, { recursive: true });

let pwmod;
try { pwmod = await import("playwright-core"); } catch { console.error("playwright-core missing: run `npm install` in " + HERE); process.exit(2); }

const checks = [];
const ok = (name, pass, extra) => { checks.push({ name, pass: !!pass, ...(extra ? { extra } : {}) }); };

let url = site, srv = null;
if (!/^https?:/.test(site)) {
  const root = resolve(site), index = join(root, "index.html");
  if (!existsSync(index)) { console.error(`no index.html in ${root}`); process.exit(2); }
  const html = readFileSync(index, "utf8");
  ok("payload present", /var P = \{"s":"[^"]+","i":\d+,"v":"[^"]+","c":"[^"]+","b":"[^"]+"\};/.test(html));
  ok("no plaintext page markers in index.html", !/DATA:START|DATA:END|const DATA|updatedAt|createRoot/.test(html));
  ok("robots Disallow", existsSync(join(root, "robots.txt")) && /Disallow: \//.test(readFileSync(join(root, "robots.txt"), "utf8")));
  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json", ".txt": "text/plain" };
  srv = createServer((req, res) => {
    let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^\/+/, "");
    if (!p || p.endsWith("/")) p += "index.html";
    const f = join(root, p);
    if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" }); res.end(readFileSync(f));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${srv.address().port}/`;
}

const launch = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" };
const browser = await pwmod.chromium.launch({ headless: true, ...launch });
const errs = [];
try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: "dark",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.goto(url);
  await pg.waitForSelector("#lock:not([hidden])", { timeout: 10000 });
  await pg.screenshot({ path: join(shots, "lock.png") });
  ok("lock screen shown", true);

  await pg.fill("#pw", "definitely-not-the-password"); await pg.click("#go");
  await pg.waitForFunction(() => document.getElementById("err").textContent.length > 0, null, { timeout: 15000 });
  ok("wrong password refused", await pg.isVisible("#lock"), await pg.textContent("#err"));

  await pg.fill("#pw", pw); await pg.click("#go");
  await pg.waitForSelector("html[data-unlocked]", { timeout: 30000 });
  await pg.waitForTimeout(800);
  const rendered = await pg.evaluate(() => document.getElementById("root").children.length > 0 && document.getElementById("root").innerText.trim().length > 0);
  ok("right password renders the page", rendered);
  await pg.screenshot({ path: join(shots, "home.png") });
  await pg.evaluate(() => { const r = document.getElementById("root"); r.scrollTop = r.scrollHeight; });
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: join(shots, "home-bottom.png") });

  const pg2 = await ctx.newPage();
  await pg2.goto(url);
  await pg2.waitForSelector("html[data-unlocked]", { timeout: 15000 }).catch(() => {});
  ok("remembered key opens without the prompt", await pg2.evaluate(() => document.documentElement.hasAttribute("data-unlocked") && document.getElementById("lock").hidden));

  const pg3 = await ctx.newPage();
  await pg3.goto(url + "?logout");
  await pg3.waitForSelector("#lock:not([hidden])", { timeout: 10000 }).catch(() => {});
  ok("?logout forgets the key", await pg3.isVisible("#lock"));
  ok("no page errors", errs.length === 0, errs.slice(0, 3));
} finally {
  await browser.close();
  if (srv) srv.close();
}
const failed = checks.filter((c) => !c.pass);
console.log(JSON.stringify({ url, shots, checks }, null, 1));
process.exit(failed.length ? 1 : 0);
