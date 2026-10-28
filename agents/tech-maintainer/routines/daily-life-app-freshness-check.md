---
name: Daily Life App freshness check
agent: tech-maintainer
slug: daily-life-app-freshness-check
schedule: "30 8 * * *"   # cron in the owner's timezone; timing flexible +-15 min unless stated
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: [life-app]
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** Area agents sometimes forget to update the Life App. Every morning, for each area file in
`data/happiness/`, compare its last real update (the data's own date and its last commit) with what it should
have by now; check that taps made in the app landed in the MD files, and that the published Life App build is
not older than the newest data commit. Safe fixes only (regenerate a recap, republish when the data is fresh but
the build is stale); never invent another agent's data and never change another agent's routines. For each stale
area, message the agent that owns it with exactly what is missing, so that agent updates its own area.

**When it stays silent.** Silent when every area is fresh; otherwise one or two lines to the owner on what was
stale or fixed.

**Repo.** If it writes to the repo it pulls first and commits + pushes only its own paths at the end
(agents/README.md, rule 7); anything it learns goes to `data/agents/tech-maintainer/memory.md` or the right graph node.

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
