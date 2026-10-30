---
name: Evening medication reminder
agent: health-advisor
slug: evening-medication-reminder
schedule: "0 21 * * *"   # cron in the owner's timezone; timing flexible +-15 min unless stated
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: []
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** If the owner takes a medication in the evening and has not confirmed it today: one line.

**Plus an active measurement series.** If `plan.md` holds a temporary series with an evening reading (until
its end date) and today's reading is missing, the same line asks for it; answers go to their files.

**When it stays silent.** Silent when neither is needed: medication confirmed (or none in the evening) and no evening reading due.

**Repo.** If it writes to the repo it pulls first and commits + pushes only its own paths at the end
(agents/README.md, rule 7); anything it learns goes to `data/agents/health-advisor/memory.md` or the right graph node.

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
