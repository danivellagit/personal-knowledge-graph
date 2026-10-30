---
name: Daily repo and system health check
agent: tech-maintainer
slug: daily-repo-health-check
schedule: "0 7 * * *"   # cron in the owner's timezone; timing flexible +-15 min unless stated
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: []
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** Git state of every checkout, lint, failing tools, disk, stale routines; fixes what is mechanical and agreed, reports the rest in one message.

**A message bridge, if one runs here.** Alive check; if it is down, the agreed start script restarts it,
verified (connected in its log, the local API listening on localhost only) and reported in one line. It
also checks the reboot hook and the start script still exist and counts the automatic starts since the
last run (each one means the machine rebooted). Re-linking is never done without the owner.

**When it stays silent.** Silent when all green; an automatic bridge restart is always reported.

**Repo.** If it writes to the repo it pulls first and commits + pushes only its own paths at the end
(agents/README.md, rule 7); anything it learns goes to `data/agents/tech-maintainer/memory.md` or the right graph node.

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
