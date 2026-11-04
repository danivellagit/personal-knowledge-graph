# Install

For a person setting up their own copy, and for the AI agent helping them: the agent can follow this file step by
step. Total: **about 10 minutes** for the core (steps 1-4); each integration after that is optional, and can wait.

## Prerequisites

| Needed for | What |
| --- | --- |
| everything | `git`, `python3` (3.9 or newer), and an AI agent that works in a folder: **Claude Code** (recommended to start), Cursor, Codex, or an always-on runner such as Grok Bot |
| the Life App (optional) | `node` 18+ and `npm`; `gh` logged in (`gh auth login`) to create the site repo for you |
| WhatsApp (optional) | Go, and `uv` (see `SETUP-WHATSAPP.md`) |
| the bank sync (optional) | `pip install requests pyjwt cryptography` |
| the Fitbit / Google Health wearable (optional) | Go (to build the Google Health CLI) and a Google Cloud project |

Your graph is **private by design**: everything you add lives in `data/`, which is gitignored. If you want a
backup in git, use a **private** repository of your own (step 2), never a public fork.

## 1. Clone (1 minute)

```bash
git clone https://github.com/danivellagit/personal-knowledge-graph.git my-graph
cd my-graph
git config core.hooksPath .githooks          # the pre-commit guard (secrets, raw bank files, layout)
```

## 2. Optional: your own private remote (3 minutes)

To back up and sync your copy, create an **empty private** repository (e.g. on GitHub). The template must not
stay your `origin` (you cannot push there, and the session hooks would pull its changes in without asking), so
it becomes `upstream`, and your private repo becomes `origin`:

```bash
git remote rename origin upstream          # skip if the first run already did it (template_update.py init)
git branch --unset-upstream                # idem
git remote add origin https://github.com/<you>/<your-private-repo>.git
git push -u origin main
```

Without a private remote, everything still works locally: the first run renames the template's `origin` to
`upstream` for you, and template updates come in only through `tools/template_update.py`, on your yes.

## 3. Open it in your agent (1 minute)

```bash
claude            # Claude Code, from inside the folder (or open the folder in Cursor / Codex)
```

Say hello. The agent reads `CLAUDE.md` (`AGENTS.md` for other agents), runs `python3 tools/onboarding.py check`,
sees that this copy is not set up yet, and starts the **first run** (`skills/onboarding/SKILL.md`).

## 4. What the first run does (5 minutes)

1. A short interview, in your language: your name, city and timezone, work, the few people who matter most,
   anything the agents must know about you.
2. It writes `config.local.yml` (from `config.example.yml`), your owner file `data/_me.md`, one node per key
   person, and the conversation as your first episode. Nothing leaves your machine.
3. It shows the **integrations menu** below. Pick any, skip any. Each answer is recorded in `data/_setup.md`
   (done / skipped / later); anything skipped can be done later by saying "connect X".

## 5. The integrations menu (all optional)

| Item | What you get | Time | Say later | Guide |
| --- | --- | --- | --- | --- |
| Template updates | the template's improvements offered to you weekly, installed only on your yes | 2 min | "check template updates" | [`skills/template-updates/SKILL.md`](skills/template-updates/SKILL.md) |
| WhatsApp (read-only) | the richest source: who you talk to, in your words; an hourly pull | 20-30 min | "connect WhatsApp" | [`SETUP-WHATSAPP.md`](SETUP-WHATSAPP.md) |
| Bank (read-only, PSD2) | spending and income per month, sanitized; most EU / EEA banks and neobanks | 30-45 min | "connect my bank" | [`docs/setup/bank-enable-banking.md`](docs/setup/bank-enable-banking.md) |
| Health wearable | sleep, heart, steps, sessions per day (Fitbit / Pixel Watch wired; Oura, WHOOP, Garmin, Apple Health untested) | 30-60 min | "connect my wearable" | [`docs/setup/health-wearables.md`](docs/setup/health-wearables.md) |
| Email and calendar | the work side of your briefs, meeting cadence (read-only connectors) | 5-15 min each | "connect my mail and calendar" | [`docs/setup/email-calendar.md`](docs/setup/email-calendar.md) |
| Life App | your life on one password-locked phone screen | 15-30 min | "set up the Life App" | [`tools/life-app/README.md`](tools/life-app/README.md): `bash tools/life-app/setup.sh --create-site` |
| Agents | a team (coach, assistant, accountant, ...) each with its own memory | 2 min each | "create my agents" | [`agents/README.md`](agents/README.md) |
| Always-on agents | routines that run without an open session | 10-20 min | "run my agents on a schedule" | [`docs/setup/always-on-agents.md`](docs/setup/always-on-agents.md) |

**Important for Claude Code, Cursor and Codex:** the routines in `agents/*/routines/` are specs and do **not**
run by themselves. An agent works only while a session is open. For anything scheduled (the hourly WhatsApp
pull, the daily bank sync, the weekly template check) use an always-on runner (e.g. Grok Bot routines,
recommended) or cron with a headless run: see the always-on guide.

## 6. Keep it up to date

```bash
python3 tools/template_update.py            # what the template changed since your version (dry run)
python3 tools/template_update.py apply all  # or: apply 1,3 | apply skills | decline 2
```

It never touches `data/`, `config.local.yml` or your memory files, shows where your own edits conflict, and
records the version you are on in `.template-version`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| The agent does not start the first run | ask it: "run the onboarding skill", or check `python3 tools/onboarding.py check` |
| `python3 tools/onboarding.py status` shows an item as not configured | follow its guide in the table above; `mark <item> later` if you want to stop asking |
| A commit is blocked by the pre-commit guard | read the line it prints: usually a secret, a raw bank file or a file in a folder it does not belong in. Never `--no-verify` |
| `template_update.py` says "not initialised" | `python3 tools/template_update.py init` |
| `template_update.py` says the history has no commit in common | your copy has no git history from the template: `init --base <the template commit you started from>` |
| `bank_sync.py` exit 2 / 3 / 4 | not configured / consent expired (renew with `auth`) / bank rate limit (wait ~6 h): see the bank guide |
| WhatsApp bridge asks for a QR again | it re-links about every 20 days: scan it yourself (`SETUP-WHATSAPP.md`) |
| `tools/body-pull.sh` says "not configured" | set `body.cli` and `body.raw_dir` in `config.local.yml` (the wearable guide) |
| Lint is not clean | `python3 tools/lint.py --fix`, then `python3 tools/lint.py` must end with `mechanical: 0` |
| Several agents on one machine step on each other | one worktree each: `tools/wt.sh init <agent>`; `tools/wt.sh doctor` reports what needs a human |

Everything else: [`README.md`](README.md) (what this is), [`CLAUDE.md`](CLAUDE.md) (how an agent works here),
[`anatomy.md`](anatomy.md) (the memory model and the optional modules).
