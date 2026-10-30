---
name: Monthly tax portal check
agent: accountant
slug: monthly-tax-portal-check
schedule: "0 9 2 * *"   # cron in the owner's timezone; timing flexible +-15 min unless stated
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: []
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** Remind the owner that it is time for the monthly check of their area on the tax authority's portal (and the collection agency's, if separate): review `deadlines.md` first for what to look at (demands, payment plans, notices, payments due, filings), check a login method is on record in the owner's vault (name only, never the value), and ask the owner to be ready to approve the login; the check happens with the owner present, the routine never enters credentials.

**When it stays silent.** Never silent: one short message each month (two or three sentences). It never pays, sends or files anything.

**Repo.** If it writes to the repo it pulls first and commits + pushes only its own paths at the end
(agents/README.md, rule 7); anything it learns goes to `data/agents/accountant/memory.md` or the right graph node.

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
