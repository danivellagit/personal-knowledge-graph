---
name: Monday post proposal
agent: linkedin-coach
slug: monday-post-proposal
schedule: "0 8 * * 1"   # cron in the owner's timezone; timing flexible +-15 min unless stated
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: []
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** One post proposal for the week from what the owner really built, in their voice, with a hook and a lesson; the owner publishes.

**When it stays silent.** Never publishes. Silent if the owner paused the rhythm.

**Repo.** If it writes to the repo it pulls first and commits + pushes only its own paths at the end
(agents/README.md, rule 7); anything it learns goes to `data/agents/linkedin-coach/memory.md` or the right graph node.

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
