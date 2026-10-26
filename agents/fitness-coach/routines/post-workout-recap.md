---
name: Post-workout recap
agent: fitness-coach
slug: post-workout-recap
schedule: "0 10-22/2 * * *"   # cron in the owner's timezone; timing flexible +-15 min unless stated
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: [body layer]
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** When a new session appears in the body layer: a short recap (duration, intensity, how it fits the week) and the training file for that day.

**When it stays silent.** Silent when there is no new session since the last run.

**Repo.** If it writes to the repo it pulls first and commits + pushes only its own paths at the end
(agents/README.md, rule 7); anything it learns goes to `data/agents/fitness-coach/memory.md` or the right graph node.

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
