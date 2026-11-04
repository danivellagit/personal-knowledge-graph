---
name: template-updates
description: Read the updates of the original public template and install only what the owner approves. Use when the owner says "check template updates", "update the template", "what's new upstream", when the weekly-template-updates routine runs, or during onboarding (the template-updates item). Never touches data/, config.local.yml or the owner's memory.
---

# template-updates

## Why it exists

This repo started as a copy of a public template whose maintainer keeps improving it: new skills, fixed tools,
better agent specs, docs. A plain `git pull` from the template would mix those with the owner's own edits and
could overwrite them silently. `tools/template_update.py` reads the template from the `upstream` git remote,
lists what changed since the version recorded in `.template-version`, and installs **only what the owner says yes
to**, file by file or by group.

## Once

```bash
python3 tools/template_update.py init      # adds the remote `upstream` (the original template), records the version
```

It records the template commit this copy started from (the merge base with `upstream/main`). A copy made without
git history needs `--base <the template commit it came from>`. Commit `.template-version` in the owner's repo.

## Every check

1. `git pull` first if they keep a private remote. Then `python3 tools/template_update.py` (a dry run, the
   default: fetches, lists, changes nothing; exit 10 when there is something to install, 0 when up to date).
2. Summarise for the owner in plain words and in their language, by group: new or changed **skills**,
   **tools**, **agent specs** and **routines**, **boot files**, **docs**, the Life App. Name what each change is
   for (read the commit subjects; `diff <n>` shows the change). Say which files **they edited** and whether those
   merge cleanly with the update or conflict, and that `data/`, `config.local.yml` and their memory are never
   touched.
3. **Ask** which to install: all, some by number (`1,3-5`) or by group (`skills`), or none. Never install
   without that yes in the same conversation; a scheduled run that cannot ask only reports.
4. Install: `python3 tools/template_update.py apply <their choice>`. A conflicting file is skipped unless they ask
   for `--with-conflict-markers` (then resolve the markers with them, by hand). A firm no:
   `decline <n>` (offered again only if the template changes that file again). What they neither installed nor
   declined stays deferred and comes back next time.
5. Check: `python3 tools/lint.py`, `python3 -m unittest discover -s tools/tests`, and `CLAUDE.md` == `AGENTS.md`
   if either changed. Then commit only the installed paths and `.template-version` (`apply ... --commit` does
   exactly that), and push if they keep a private remote.

## What is never touched

`data/**`, `config.local.yml`, `.template-version` (except by the tool), `tools/life-app/instance.yml`, and any
glob the owner lists under `template.protect` in `config.local.yml`. Agent personas live in their `AGENT.md`, so a
spec update to an agent they created merges around the `persona:` line; if it conflicts, keep their persona.

## Schedule

The tech-maintainer's suggested routine `agents/tech-maintainer/routines/weekly-template-updates.md` runs this
weekly and asks before installing. Best on an always-on runner that can wait for the answer (e.g. a Grok Bot
routine); in Claude Code it runs only when the owner asks, or from cron as a report
(`docs/setup/always-on-agents.md`).
