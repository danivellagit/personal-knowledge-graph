---
name: Dish picks when eating out
agent: fitness-coach
slug: eating-out-dish-picks
schedule: "0 11,18 * * *"   # cron in the owner's timezone; timing flexible +-15 min unless stated
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: [a calendar connector, a browser]
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** Before lunch and dinner: if the calendar or the owner's messages show a restaurant, a booking or a link for that meal, open the menu online and propose 2-3 specific dishes that fit the day so far (the food log and the owner's targets) and what to skip, with the menu link.

**Standing rule.** The owner asked for this unprompted: the coach works out the place itself. Usual places and their closing days can live in its memory.

**When it stays silent.** Silent when no restaurant is found, or when that meal was already proposed (a marker outside the repo: date, meal, place).

**Repo.** If it writes to the repo it pulls first and commits + pushes only its own paths at the end
(agents/README.md, rule 7); anything it learns goes to `data/agents/fitness-coach/memory.md` or the right graph node.

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
