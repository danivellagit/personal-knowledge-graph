# Run your agents on a schedule (always-on)

**Optional.** 10-20 minutes to set up the first routine.

Every agent in `agents/<role>/` ships **suggested routines** in `agents/<role>/routines/*.md`: a schedule (cron,
in your timezone), what the routine does, when it stays silent, and its saved prompt. They are specs, not jobs:
**nothing in this repo runs by itself**. In Claude Code, Cursor or Codex an agent only works while you have a
session open. To have the hourly WhatsApp pull, the daily bank sync, the morning brief or the weekly template
check happen without you, give the routine to a scheduler. Three options:

## 1. An always-on agent runner (recommended): e.g. Grok Bot

Create one bot per agent you want always on (or one bot for everything), connect the repo (a private GitHub
copy, or the runner's machine with a clone), then create each routine on the runner with the spec's schedule and
its saved prompt. After creating it, set `status: enabled`, `created:` and `runner_id:` in the spec (rule 9 in
`agents/README.md`: the spec is the mirror of what runs). The runner delivers the result to you in chat, so a
routine that "asks before installing" can really ask.

## 2. cron (or launchd / Task Scheduler) + a headless agent run

Any machine that stays on can run a routine as a non-interactive agent session. With Claude Code that is print
mode, `claude -p "<the routine's saved prompt>"` (check `claude --help` for the flags that limit which tools it
may use; give it the least it needs). Example crontab line for a weekly check on Monday at 09:00:

```cron
0 9 * * 1  cd ~/my-graph && claude -p "$(sed -n '/Saved prompt/,$p' agents/tech-maintainer/routines/weekly-template-updates.md)" >> ~/logs/agents.log 2>&1
```

Caveats: a cron run cannot ask you anything and wait, so routines that need a yes (installing updates, renewing a
consent) should only **report** in cron and leave the decision for your next session. Keep logs outside the repo.

## 3. A plain script on a timer (no AI)

Some routines are pure tools and need no agent at all:

```cron
15 7 * * *  cd ~/my-graph && python3 tools/bank_sync.py sync >> ~/logs/bank.log 2>&1
0 8 * * 1   cd ~/my-graph && python3 tools/template_update.py --no-fetch >/dev/null || echo "template updates available"
```

## Which routines first

- `agents/tech-maintainer/routines/hourly-message-pull.md` if WhatsApp is connected
- `agents/tech-maintainer/routines/daily-bank-sync.md` if a bank is linked
- `agents/tech-maintainer/routines/weekly-template-updates.md` (summarises the template's updates, asks first)
- `agents/tech-maintainer/routines/daily-graph-lint.md`

Related: [`agents/README.md`](../../agents/README.md), [`INSTALL.md`](../../INSTALL.md).
