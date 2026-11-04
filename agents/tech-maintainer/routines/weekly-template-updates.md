---
name: Weekly check for template updates (asks before installing)
agent: tech-maintainer
slug: weekly-template-updates
schedule: "0 9 * * 1"   # cron in the owner's timezone; timing flexible +-15 min unless stated
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: [the `upstream` remote and .template-version (python3 tools/template_update.py init)]
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** Pull, then `python3 tools/template_update.py` (a dry run: it fetches the original template from the
`upstream` remote and lists what changed since the version in `.template-version`). Summarise the list for the
owner in a few plain lines, in their language: what is new or better (new skills, tool fixes, agent specs, docs),
which files they edited themselves and whether those merge cleanly or conflict, and what is never touched (their
`data/`, `config.local.yml`, their memory). Then **ask**: install all, some (by number or group), or none. Install
only what they say yes to (`apply ...`, `decline ...` for a firm no), run the checks (`python3 tools/lint.py`,
`python3 -m unittest discover -s tools/tests`), and commit only the installed paths plus `.template-version`. The
procedure is `skills/template-updates/SKILL.md`.

**When it stays silent.** Silent when the template has nothing new (exit 0). One line if the fetch fails.

**Where it runs.** Best on an always-on runner that can ask and wait for the answer (e.g. a Grok Bot routine: the
summary arrives in chat and the owner replies "yes, all" or "only 2 and 5"). In Claude Code, Cursor or Codex nothing
runs on its own: use cron with a headless run that only **reports** (it cannot wait for a yes) and leave the
install for the next session, or just say "check template updates" now and then
(`docs/setup/always-on-agents.md`). Never installs anything without the owner's yes in the same conversation.

**Repo.** If it writes to the repo it pulls first and commits + pushes only its own paths at the end
(agents/README.md, rule 7); anything it learns goes to `data/agents/tech-maintainer/memory.md` or the right graph node.

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
