---
name: Life App: body area
agent: fitness-coach
slug: life-app-body-area
schedule: "30 21 * * *"   # cron in the owner's timezone; timing flexible +-15 min unless stated
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: [Life App]
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** Update `data/happiness/corpo.json` from today's facts, validate, publish.

**Never overwrite what the owner logged meanwhile.** Right before writing, pull again, re-read the current
`corpo.json`, keep its meals and workouts as they are and recompute today's eaten totals from that current
meal list; only then merge in the computed fields (burn, steps, device, heart rate, history) and write.

**Planned sports close themselves.** Once a planned sport's calendar slot has ended and the wearable shows
the session within it (the close rule of the post-workout recap), write that day's training file and mark the
session done, without asking. Short light-zone commutes or walks are never workouts.

**When it stays silent.** Silent; a failed publish is retried once, and only a second failure is reported (once per day).

**Repo.** If it writes to the repo it pulls first and commits + pushes only its own paths at the end
(agents/README.md, rule 7); anything it learns goes to `data/agents/fitness-coach/memory.md` or the right graph node.

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
