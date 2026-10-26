---
name: Deadline register check
agent: accountant
slug: deadline-register-check
schedule: "0 8 * * 1-5"   # cron in the owner's timezone; timing flexible +-15 min unless stated
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: [mail connector, calendar connector]
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** The next 30 days of the deadline register plus new official mail; one line per item that needs the owner, with the amount and the source. Updates the Money area if the Life App is used.

**When it stays silent.** Silent when nothing is due or new. Never files, sends or pays.

**Repo.** If it writes to the repo it pulls first and commits + pushes only its own paths at the end
(agents/README.md, rule 7); anything it learns goes to `data/agents/accountant/memory.md` or the right graph node.

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
