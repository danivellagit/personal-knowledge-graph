---
name: Monthly brand consistency pass
agent: brand-designer
slug: monthly-brand-audit
schedule: "0 10 1 * *"   # cron in the owner's timezone; timing flexible +-15 min unless stated
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: [a browser]
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** Walk the surfaces listed in `brands.md` (site, decks, social profiles), list the drift by severity with a link each, propose the order to fix it.

**When it stays silent.** Silent if nothing drifted. Never changes anything.

**Repo.** If it writes to the repo it pulls first and commits + pushes only its own paths at the end
(agents/README.md, rule 7); anything it learns goes to `data/agents/brand-designer/memory.md` or the right graph node.

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
