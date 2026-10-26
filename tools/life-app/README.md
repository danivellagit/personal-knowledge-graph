# The Life App

Your whole life on one phone screen: one number, **Life Health**, over seven areas, each kept up to date by the agent
that owns it. It is a React app bundled into ONE file, encrypted whole (AES-256-GCM, key from your password with
PBKDF2), and published as a static site that contains only ciphertext. Add it to the home screen and it behaves like
an app; without the password the site is noise.

| tab / area | data file in `data/happiness/` | default owner (role) |
| --- | --- | --- |
| Home: Life Health ring, the weekly picture | `weekly-summary.json`, `life-health-history.json` | whoever writes the Monday recap |
| Corpo: calories, steps, sleep, training, body trends | `corpo.json` (+ `corpo-history.json`) | fitness-coach |
| Salute: labs, check-ups, pills, mind | `medico.json`, `mente.json` | health-advisor, psychologist |
| Lavoro | `lavoro.json` | founder-assistant, linkedin-coach |
| Finanze | `finanze.json` (+ `data/finance/scadenzario.md` deadlines if present) | accountant |
| Altro: Relazioni, Crescita, Vita | `relazioni.json`, `crescita.json`, `vita.json` | best-friend |

The app's own wording is Italian today (area names, labels); the area names, the agent names and the app name are
yours to change in `config.local.yml`.

## Install (once)

```bash
bash tools/life-app/setup.sh --dry-run        # print every step, change nothing
bash tools/life-app/setup.sh                  # asks your name and a password, builds with sample data
bash tools/life-app/setup.sh --create-site    # also: your own public GitHub Pages repo + first publish
```

What `setup.sh` does, step by step (every step is skipped when already done, so it is safe to rerun):

1. checks `python3`, `node` 18+, `npm`, `git` (and `gh`, logged in, for `--create-site`);
2. adds a `life_app:` block with your name (and site repo) to `config.local.yml`, if there is none;
3. stores the app password in `~/.secrets/life-app-password` (mode 600, outside the repo; `--password-file FILE` or
   `LIFE_APP_PASSWORD` for non-interactive runs);
4. `npm ci` in this folder;
5. creates `data/happiness/` from `sample-data/` if it does not exist (`python3 tools/happiness.py init`): **fake
   values**, so the app has something to show until your agents write real ones; existing data is never touched;
6. builds: `publish.sh --no-push` -> `out/site/` (`index.html` with the ciphertext, the service worker, the icons);
7. with `--create-site`: `gh repo create <you>/life-app --public` if missing, pushes the built site there as a single
   commit, enables GitHub Pages, prints the URL. On the phone: open it in Safari, Share > Add to Home Screen.

Flags: `--owner NAME`, `--password-file FILE`, `--site-repo user/name`, `--yes` (no prompts), `--dry-run`.

## Every update

```bash
bash tools/life-app/publish.sh             # validate, inject, build, encrypt, push (only if the bundle changed)
bash tools/life-app/publish.sh --no-push   # build only
bash tools/life-app/publish.sh --dry-run   # show what it would do
node tools/life-app/verify.mjs             # headless phone check: wrong password refused, every tab renders
```

Agents run `publish.sh` after writing their file (rule 8 in `agents/README.md`).

## What is where (and what is never committed)

| what | where | in git? |
| --- | --- | --- |
| app code, health page, build, sample data | `tools/life-app/` | yes (this repo) |
| your data | `data/happiness/*.json` | no (`data/` is gitignored) |
| password | `life_app.password_file`, default `~/.secrets/life-app-password` | never |
| salt, deploy checkout, last published hash | `life_app.cache_dir`, default `~/.cache/life-app/` | never |
| built site | `tools/life-app/out/site/` | no (gitignored); pushed only to YOUR site repo, ciphertext only |
| optional avatar | `life_app.avatar` (a file outside the repo) | never; embedded only inside the ciphertext |

The site repo is public (GitHub Pages on a free plan needs that) and holds only `index.html` with the encrypted
payload plus the shell. Use a long password: anyone can download the ciphertext and try offline.

## Configuration

All under `life_app:` in `config.local.yml`; every key is optional and documented in `config.example.yml`:
owner name, app name, language tag, timezone, password / cache / salt paths, avatar, the site repo (repo, branch,
url, token file, commit author), write-back, a few labels, and per area `name`, `agents` (role or persona names shown
in the app), `weight` in the Life Health total, `enabled` (Relazioni, Crescita, Vita only).
`python3 tools/life-app/life_config.py` prints the resolved settings; `... get site.repo` prints one.

## Write-back (optional, off by default)

Some taps in the app (a pill taken, a weigh-in) can be saved as small event files in a PRIVATE repo of yours, which an
agent then folds into `data/`. Turn on `life_app.writeback`, create that private repo, and put a fine-grained token
with *Contents: read and write on that repo only* in `writeback.token_file`. The token travels only inside the
ciphertext. Leave it off and the app is read-only.

## Data model

[`DATA-MODEL.md`](DATA-MODEL.md) (generated from the validator's schema). `python3 tools/happiness.py validate` must
pass before every build; `python3 tools/happiness.py check` lists files that are stale for their owner.

## Files

| file | role |
| --- | --- |
| `setup.sh` / `publish.sh` | install once / build + publish |
| `life_config.py` | resolves `life_app:` from `config.local.yml` (+ `LIFE_APP_*` env) |
| `build.mjs` | bundle (esbuild) + inline + encrypt -> `out/site/` |
| `shell.html`, `sw.js`, `manifest.webmanifest`, `icons/` | lock screen, offline cache, home-screen metadata |
| `src/app.tsx`, `src/scores.ts`, `src/recap.ts`, `src/history.ts`, `src/happy-orb.tsx` | Home, areas, scores |
| `src/health/health-page.tsx` | the Corpo/Salute page (its data blocks are filled from `data/happiness/` at build) |
| `*-patches.mjs`, `*.fragments.txt`, `training.mjs`, `area-modules.mjs` | build-time additions to the health page |
| `src/lifelog*.mjs`, `src/pill-bridge.mjs` | the optional write-back |
| `make_sample_data.py`, `sample-data/` | the fake data a fresh clone builds with |
| `verify.mjs`, `tests/` | headless end-to-end check, unit tests (`node --test tests/*.test.mjs`) |

## Sync (maintainers)

This folder is meant to be the SAME code as the app in the instance it came from: everything personal lives in
`config.local.yml` and `data/`, never in these files. `python3 tools/template_sync.py --source <instance> --template
<this worktree> --author "Name <user@users.noreply.github.com>"` copies the shared files, runs the leak check
(names from the instance's graph, emails, phones, paths, gitleaks, images, file names, commit metadata), builds and
verifies with sample data, and commits to a `sync/...` branch. It never touches `main`; merge by hand after review.
