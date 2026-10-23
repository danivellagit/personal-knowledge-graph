# Health app: a private, installable phone dashboard

An optional module. It takes a React page (a health dashboard whose numbers sit in a `DATA` block),
bundles it, **encrypts the whole bundle**, wraps it in an installable iPhone/Android web-app shell
with an unlock screen, and publishes the result as a static site on GitHub Pages. On the phone it is
an icon on the home screen that opens full-screen, asks for the password once, and then opens
straight away. Nothing else in the graph needs it; unconfigured, the publisher says what to set and
exits 0.

```
tools/publish_health_app.sh            # build the configured page, publish if anything changed
tools/publish_health_app.sh --fill     # same, with the DATA block built from the body layer + food log
tools/publish_health_app.sh --no-push  # build only, into tools/health-app/out/site
```

## What is in this folder

| file | what it does |
| --- | --- |
| `example-page.tsx` | the page that ships: last 7 days of kcal eaten vs burned, protein, steps, sleep, workouts, with obviously fake sample data. Replace it with your own (`health_app.source`). |
| `build.mjs` | splice the DATA block, bundle with esbuild + React, encrypt (AES-256-GCM, PBKDF2-SHA256 310k), write the site |
| `shell.html` | the only unencrypted page: PWA meta tags, safe areas, the lock screen, decryption, the update check |
| `sw.js`, `manifest.webmanifest`, `icons/` | service worker (network-first, offline fallback), web-app manifest, generic icons |
| `make_icons.py` | regenerates the icons in another accent colour, no dependencies |
| `fill_data.py` | builds a DATA block from `tools/body.py`'s store and `data/food/` |
| `canvas-shim.js` | lets a page written for a canvas tool (`import ... from "grok/canvas"`) run unchanged |
| `verify.mjs` | end-to-end check of a build in headless Chrome at iPhone size |

`tools/sleep_fields.py` (one level up) prints per-night sleep fields straight from the wearable CLI,
for a routine that wants sleep numbers without running the whole body layer.

## The page contract

1. The file default-exports a React component. It is rendered into `#root`, a full-screen scroll
   container; pad your top with `var(--sa-t)` and your bottom with `var(--sa-b)` (the iPhone status
   bar and home indicator). `var(--app-h)` is the real screen height.
2. Everything that changes day to day sits between two marker lines, as one literal:

   ```ts
   // ==== DATA:START (anything after the marker is fine) ====
   const DATA = { updatedAt: "2030-01-07T08:00", owner: "...", goals: {...}, days: [...], notes: [...] };
   // ==== DATA:END ====
   ```

   The publisher can replace that block from a file (`--data FILE`, or `health_app.data_file`), so
   a routine or an agent updates the numbers without touching the code. The file may contain the
   marker lines or just the block between them. `updatedAt: "..."` is echoed in the build output.
3. Imports come from `react` (and `react-dom`) only, or from `grok/canvas` / `page-kit`, which
   `canvas-shim.js` serves. Everything is bundled into one file; there is no network access to
   anything but the site itself.
4. `globalThis.__HEALTH_APP_AVATAR__` is a data URI of `health_app.avatar`, or `null`.

The example page's DATA shape (every number may be `null`, shown as "—"):

```
updatedAt "YYYY-MM-DDTHH:MM"   owner "first name"   notes ["..."]
goals { kcalIn, proteinG, steps, sleepMin, workoutsPerWeek }
days [ { date "YYYY-MM-DD", kcalIn, kcalOut, proteinG, steps, sleepMin, deepMin, remMin,
         bedtime "HH:MM", wakeTime "HH:MM", restingHr, hrvMs,
         workouts [ { name, min, kcal, hrAvg } ] } ]      oldest first
```

### Filling DATA

- **From the graph:** `--fill` (or `health_app.fill_from_body: true`) runs `fill_data.py`: burned
  kcal, steps, sleep, resting heart, HRV and workouts from the body layer's store (`body.db`, see
  `anatomy.md`), eaten kcal and protein from the food log's day files (`kcal_est`,
  `protein_g_est`), goals from `health_app.goals`. A source that is not set up leaves its fields
  `null`; neither source having anything for the week stops the publish (exit 3) instead of
  pushing an empty dashboard.
- **From a routine or an agent:** write the block to a file outside the repo and run
  `tools/publish_health_app.sh --data FILE`. Numbers are facts, as everywhere in this repo: a coach
  line in `notes` is the coach's read and should say so.

## Security model

- **Only ciphertext is published.** `index.html` holds the lock screen plus one JSON payload:
  salt, iteration count, IV, the AES-256-GCM ciphertext of the whole bundle (code, data, avatar)
  and a build id. The page source, the data and the avatar never exist as files in the site or in
  the Pages repo. The build writes the spliced page to a private temp dir and deletes it.
- **The password is never committed or printed.** It is read at build time from
  `health_app.password_file`, which the publisher refuses to use if it is inside the repo. On the
  phone, the password is turned into a key with PBKDF2 (310,000 iterations); with "remember" ticked,
  the derived AES key (not the password) is kept in the installed app's localStorage. Open the app
  with `?logout` to forget it.
- **The salt is per instance and fixed**, made on the first build into `health_app.salt_file`
  (default `~/.cache/health-app/salt.txt`, off-repo; the template ships none). Fixed means a
  remembered key survives every data update and breaks only when the password changes. It is not
  secret: it is in the page. On a new machine the publisher takes it back from the published site.
- **What anyone on the internet can see:** that the site exists (the repo is public; Pages from a
  private repo needs a paid GitHub plan), the app name and icons, the repo owner's username, the
  size of the ciphertext (roughly how much data), when each build happened (`version.txt`, commit
  time), the salt and iteration count, and the deploy commit's author (`health_app.git_name` /
  `git_email`, neutral by default). Search engines are asked not to index it (`robots.txt`
  Disallow, `noindex`), which is a request, not a protection.
- **What protects the content is the password alone.** Anyone can download the ciphertext and
  guess offline, so use a long random password (a password manager's 20+ characters), not a word.
  If a password ever leaks, change it and republish: old builds that someone already copied stay
  readable with the old password. The deploy branch is one force-pushed commit, so the repo keeps
  no history of past builds, but GitHub or a stranger's clone may.
- **On the phone** the remembered key opens the app for anyone holding the unlocked phone, like
  any other app. The service worker caches only the public files (ciphertext).

## One-time setup

1. Copy the `health_app:` block from `config.example.yml` into `config.local.yml`. Set `name`,
   `repo` (e.g. `your-user/health-app`) and `password_file`. Create the password file outside the
   repo, readable only by you:

   ```
   mkdir -p ~/.secrets && (umask 077; read -rs -p 'password: ' p && printf '%s\n' "$p" > ~/.secrets/health-app-password)
   ```

2. Install the build tools once: Node 18+, then `npm install` in `tools/health-app` (the publisher
   also does it on first run).
3. On github.com create the repo (**public**, empty: no README, no licence).
4. First publish: `tools/publish_health_app.sh --force`. It force-pushes one commit to `main`. Pushing
   uses git's own credentials, or a token from `health_app.token_file` (a fine-grained token with
   "Contents: read and write" on that repo only). Exit 10 means the repo is missing or not pushable.
5. In the repo: Settings → Pages → "Deploy from a branch", branch `main`, folder `/ (root)` → Save.
   About a minute later the app is at `https://<user>.github.io/<repo>/`.
6. On the iPhone: open that URL in Safari → Share → **Add to Home Screen**. Open the app from the
   home screen (it has its own storage, separate from Safari), enter the password once with
   "Remember on this device" ticked. Android/Chrome: menu → Install app.

## Updating

Run the publisher after every data change (a routine can do it right after it writes the DATA
block). It rebuilds and compares a fingerprint of the plaintext with the last publish: nothing
changed, nothing pushed (`--force` overrides). The ciphertext itself differs on every build (a new
IV), which is why the fingerprint, kept off-repo in the cache, is taken before encryption. The app
checks `version.txt` every time it comes back to the foreground and reloads itself when a newer
build is live, so the phone picks up the update by itself.

- New page design: point `health_app.source` at your `.tsx`. A page whose DATA block holds real
  numbers is private data: keep it in `data/` (gitignored by default) or off-repo, never in
  `tools/`. The publisher keeps the last good copy in the cache and falls back to it if the source
  is unreadable.
- New look: `health_app.accent` / `theme_color`, then `python3 make_icons.py --accent "#RRGGBB"`.
- Another language: `health_app.lang` and the `health_app.ui.*` strings.
- New password: change the file and publish; every phone asks for it once.

## Checking a build

```
cd tools/health-app && npm install        # includes playwright-core (dev only)
node verify.mjs out/site --password-file ~/.secrets/health-app-password
```

It checks that `index.html` carries a payload and no plaintext page markers, then serves the site
on 127.0.0.1 and drives an installed Google Chrome (or `CHROME_PATH`) at iPhone size: lock screen,
wrong password refused, right password renders, a second launch opens without asking, `?logout`
forgets the key, no page errors. Screenshots go to `out/verify/`.

## Configuration

`config.local.yml`, `health_app:` block; the env var wins over the file.

| key | env | default |
| --- | --- | --- |
| `enabled` | `HEALTH_APP_ENABLED` | on when configured; `false` switches it off |
| `name`, `description`, `lang` | `HEALTH_APP_NAME`, `_DESCRIPTION`, `_LANG` | Health, "Health and training, last 7 days", en |
| `password_file` | `HEALTH_APP_PASSWORD_FILE` | none: **required** |
| `repo` / `remote_url` | `HEALTH_APP_REPO` / `HEALTH_APP_REMOTE_URL` | none: build only |
| `branch` | `HEALTH_APP_BRANCH` | main |
| `token_file` | `HEALTH_APP_TOKEN_FILE` (or `HEALTH_APP_GH_TOKEN`) | git's own credentials |
| `source` | `HEALTH_APP_SOURCE` | `tools/health-app/example-page.tsx` |
| `data_file` | `HEALTH_APP_DATA` | the page's own block |
| `fill_from_body` | `HEALTH_APP_FILL` | false |
| `goals.*` | none | none |
| `avatar` | `HEALTH_APP_AVATAR` | none |
| `cache_dir` | `HEALTH_APP_CACHE` | `~/.cache/health-app` (must be outside the repo) |
| `salt_file` | `HEALTH_APP_SALT_FILE` | `<cache_dir>/salt.txt` |
| `out_dir` | `HEALTH_APP_OUT` | `tools/health-app/out/site` |
| `git_name`, `git_email` | `HEALTH_APP_GIT_NAME`, `_GIT_EMAIL` | health-app, health-app@users.noreply.github.com |
| `theme_color`, `accent` | `HEALTH_APP_THEME_COLOR`, `_ACCENT` | #0B0E10, #00F19F |
| `ui.password`, `ui.remember`, `ui.unlock`, `ui.wrong`, `ui.no_crypto` | `HEALTH_APP_UI_PASSWORD`, ... | English |
