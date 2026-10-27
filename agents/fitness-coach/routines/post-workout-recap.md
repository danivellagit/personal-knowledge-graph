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

**Close rule.** A session counts as ended only when the tracker logged a finished exercise session, or the
heart-rate data runs at least 20 minutes past the activity with the owner back near resting for those 20+ minutes.
A calendar end time alone, or heart-rate data that simply stops (sync lag), never means ended: if in doubt the
session stays planned and nothing is sent.

**Auto-detected sessions.** Tracker auto-detected sessions often include travel and changing time and may carry a
wrong activity type. When the owner gave start/end times in chat (or the first/last set times in the day's exercise
table), those win over the tracker's window, and kcal/HR are computed only for that window. Times the owner already
corrected in the day's training file are never overwritten by a tracker window.

**When it stays silent.** Silent when there is no new session since the last run.

**Repo.** If it writes to the repo it pulls first and commits + pushes only its own paths at the end
(agents/README.md, rule 7); anything it learns goes to `data/agents/fitness-coach/memory.md` or the right graph node.

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
