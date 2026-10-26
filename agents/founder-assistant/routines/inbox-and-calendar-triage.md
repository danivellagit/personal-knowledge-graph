---
name: Inbox and calendar triage
agent: founder-assistant
slug: inbox-and-calendar-triage
schedule: "0 8,14,20 * * *"   # cron in the owner's timezone; timing flexible +-15 min unless stated
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: [mail connector, calendar connector]
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** Read new mail and the next 24 h of calendar; list what needs the owner (reply, decide, prepare), with a draft where useful.

**When it stays silent.** Silent when nothing needs the owner.

**Repo.** If it writes to the repo it pulls first and commits + pushes only its own paths at the end
(agents/README.md, rule 7); anything it learns goes to `data/agents/founder-assistant/memory.md` or the right graph node.

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
