---
name: onboarding
description: The guided first run. Use when data/_me.md is missing or still the placeholder, config.local.yml is missing, data/_setup.md is missing or has items never asked, or the owner says "set me up", "start", "redo my profile" or "connect X" (WhatsApp, my bank, my wearable, my mail and calendar, the Life App, template updates, my agents on a schedule). A short interview fills the owner file and the config, then an optional integrations menu where every item can be skipped or done later, tracked in data/_setup.md.
---

# onboarding

## Why it exists

Someone who clones this template and opens it in Claude Code (or Cursor, Codex, any agent that reads
`AGENTS.md`) has an empty `data/` and no `config.local.yml`. Without a first run the agent does not know whose
graph this is, which language to speak, or which sources exist, and the owner has to read four documents before
anything works. This skill walks them through it in a few minutes, and lets every integration wait.

`python3 tools/onboarding.py check` says whether the first run is owed (exit 1, one line per gap). The boot files
(`CLAUDE.md` / `AGENTS.md`, section 1) send you here when it is.

## The tone

Talk like a person, in the owner's language as soon as you know it (ask first, in English, which language they
want). Short questions, one or two at a time, never a form. Every answer is theirs: never fill a field by
assumption; a skipped question stays empty or UNKNOWN. Say at the start that everything stays on their machine
(`data/` is gitignored) and that every integration is optional and can be done later. Never run a login or
an authorisation for them (WhatsApp QR, bank consent, Google login): explain, give the command, wait.

## Step 1. The interview (5 minutes)

Ask, in this order, and stop whenever they want:

1. Their name (and what people call them), the language they want the agents to use.
2. City and timezone (offer the timezone you infer from the city, ask them to confirm).
3. Work: what they do, where, with whom.
4. The key people: partner, family, closest friends, the colleagues who matter. Names, and one line each.
5. Anything the agents should know about how to talk to them, or must never do.

Then write, in the same turn:

- `config.local.yml`: `cp config.example.yml config.local.yml` if missing, then set `owner`, `owner_language`,
  and `life_app.timezone` if they gave one. Leave every source and module as the example has it (off) until the
  menu below wires it. Never put a secret in this file.
- `data/_me.md` from [`templates/me.md`](templates/me.md): fill what they said, in their words, and delete the
  `onboarding: pending` line. Unknown fields stay empty.
- One node per key person in `data/people/<slug>.md` from `skills/remember-people/templates/person.md`, with the
  bond (`relationship:` partner / family / friend / colleague...) written through `tools/graph.py`, and only what
  they said. A person with no surname yet keeps a placeholder slug and a NAME UNKNOWN gap (`CLAUDE.md`, section 5).
- The conversation itself as `data/interactions/_me/<today>.md` (`setting: manual`,
  `source: manual:<owner_slug>-<date>`).
- `python3 tools/lint.py --fix && python3 tools/lint.py` (must end with `mechanical: 0`), then
  `python3 tools/onboarding.py init` and `python3 tools/onboarding.py mark profile done`.

## Step 2. The integrations menu (each one optional)

Show the menu once, as a short list with the time each takes, and say: "pick any, skip any; you can do any of
these later by saying 'connect X'". Then do only what they pick, one at a time. After each item record the
outcome: `python3 tools/onboarding.py mark <item> done|skipped|later [-n "why / what is missing"]`.

| item | what it gives | time | how |
| --- | --- | --- | --- |
| `template-updates` | the template's future improvements, offered to them weekly, installed only on a yes | 2 min | `python3 tools/template_update.py init` (adds the `upstream` remote, writes `.template-version`); commit `.template-version` if they keep a private remote. Then offer the weekly routine below. [`skills/template-updates`](../template-updates/SKILL.md) |
| `whatsapp` | the richest source: who they talk to, in their words | 20-30 min | [`SETUP-WHATSAPP.md`](../../SETUP-WHATSAPP.md): the lharries bridge, read-only use, `whatsapp.bridge_db` in the config; then the `hourly-message-pull` routine (tech-maintainer). They scan the QR themselves |
| `bank` | spending and income per month, read-only | 30-45 min | [`docs/setup/bank-enable-banking.md`](../../docs/setup/bank-enable-banking.md): their own Enable Banking app, `tools/bank_sync.py setup / auth / sync`; then the `daily-bank-sync` routine. They approve the consent in their bank's app |
| `wearable` | sleep, heart, steps, sessions per day | 30-60 min | [`docs/setup/health-wearables.md`](../../docs/setup/health-wearables.md): Fitbit / Pixel Watch through the Google Health CLI (wired); Oura, WHOOP, Garmin, Apple Health: untested, not wired |
| `mail-calendar` | the work side of briefs, meeting cadence | 5-15 min each | [`docs/setup/email-calendar.md`](../../docs/setup/email-calendar.md): the runner's connectors (Claude Code MCP servers, Grok Bot connectors), read-only; then `integrations:` in the config |
| `life-app` | one password-locked phone app over their life | 15-30 min | `bash tools/life-app/setup.sh --dry-run`, then `bash tools/life-app/setup.sh --create-site` (needs `node`, `npm`, `gh auth login`). [`tools/life-app/README.md`](../../tools/life-app/README.md) |
| `agents` | a team: coach, assistant, accountant... with their own memory | 2 min each | `python3 tools/agents/create_agent.py --list`, then `create_agent.py <role>` for the ones they want; `agents.enabled: true` |
| `always-on` | routines that run without an open session | 10-20 min | [`docs/setup/always-on-agents.md`](../../docs/setup/always-on-agents.md): in Claude Code / Cursor / Codex nothing in `agents/*/routines/` runs by itself; an always-on runner (e.g. Grok Bot routines, recommended), or cron with a headless run |

An item they skip is `skipped`; an item they want but cannot finish now (an app approval pending, a device not at
hand) is `later` with a note of what is missing. Never mark `done` without having seen it work (a first sync, a
first pull, a first build).

## Step 3. Close

One short message: what is set up, what is left for later and the phrase to start each one, and what they can
ask now ("log my coffee with ...", "prepare the brief for ...", "run the daily sweep"). If they keep a private
remote, commit and push the engine changes (and `data/` only if their repo is private and tracks it).

## Later

"connect X" any time: jump to that row of the menu, then `mark`. `python3 tools/onboarding.py status` shows the
checklist next to what the machine actually shows (no network, no secrets). `tools/wt.sh doctor` reports an owed
first run too.
