---
name: Daily upstream template sync (maintainers of a public template only)
agent: tech-maintainer
slug: upstream-template-sync
schedule: "30 6 * * *"   # cron in the owner's timezone; timing flexible +-15 min unless stated
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: [a public template repo]
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** Run `tools/template_sync.py` from the private instance to the public template: verbatim only for paths classified generic, everything else into a pending report to anonymize by hand; leak check before any push.

**When it stays silent.** Silent when nothing changed; reports pending items and any failed check.

**Repo.** If it writes to the repo it pulls first and commits + pushes only its own paths at the end
(agents/README.md, rule 7); anything it learns goes to `data/agents/tech-maintainer/memory.md` or the right graph node.

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
