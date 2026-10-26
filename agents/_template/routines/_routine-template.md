---
name: Routine name as shown on the runner
agent: <role>
slug: <routine-slug>
schedule: "0 8 * * *"   # cron in the owner's timezone, timing (exact / flexible +-15 min); or "event: ..."
status: suggested       # suggested (not created) | enabled | paused
requires: []            # connectors or layers it needs
created:                # YYYY-MM-DD, the day it is created on the runner
runner_id:              # the routine's id / folder on the runner
---

<!-- Copy to agents/<role>/routines/<slug>.md the same turn the routine is created, and update it the same
     turn it changes, is paused or deleted (agents/README.md, rule 9). -->

**Intent.** What it reads, what it writes, what it tells the owner.

**When it stays silent.** (most routines: when there is nothing worth saying)

**Repo.** If it writes to the repo it pulls first and commits + pushes only its own paths at the end.

**Saved prompt.** The prompt as saved on the runner, verbatim, or a faithful summary of it.
