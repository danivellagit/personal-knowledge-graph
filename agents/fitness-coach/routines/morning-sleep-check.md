---
name: Morning sleep check
agent: fitness-coach
slug: morning-sleep-check
schedule: "*/15 6-10 * * *"   # every 15 min in the morning window, once per day; up to 5 min late
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: [body layer]
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** Read last night's sleep from the body layer; one short line on what stands out (late bedtime, short night, low recovery) and one thing to do today.

**Once per day, right after the owner wakes.** A fixed hour is often too late or too early, so it polls
the morning window and sends at the first run where the owner is awake and the wearable has synced last
night's main sleep; a small marker file outside the repo (today's date, written after sending) makes every
later run that day do nothing.

**Up for good, whole night.** It waits until the owner is up for good, not the first brief wake-up (an
early wake followed by falling back asleep is common). It combines all of last night's sleep sessions from
the wearable: a second session after a short wake counts as the same night. Later in the morning it does one
silent recheck (no message): it re-reads the night and updates the body data if the wearable synced more,
but never overwrites a manual correction (a day flagged `sleepCorrected` keeps its sleep fields). When the
owner says they slept longer, trust them.

**When it stays silent.** Silent if the owner is not awake yet or the night has not synced (it tries again on the next run), if today's check was already sent, or if there is no new night.

**Repo.** If it writes to the repo it pulls first and commits + pushes only its own paths at the end
(agents/README.md, rule 7); anything it learns goes to `data/agents/fitness-coach/memory.md` or the right graph node.

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
