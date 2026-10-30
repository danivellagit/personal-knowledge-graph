---
name: Weekday site check
agent: web-builder
slug: weekday-site-check
schedule: "0 9 * * 1-5"   # cron in the owner's timezone; timing flexible +-15 min unless stated
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: [a browser]
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** Load each live site in `sites.md`: status, key pages, forms, share cards; one line per problem.

**Agent-readable versions and images.** For each site that publishes them: every sitemap URL has its
markdown version, `llms.txt` / `llms-full.txt` list exactly the sitemap's pages, and every image on the
pages, the markdown and the llms files loads; problems listed with the page that references them, a failing
check script reported as such.

**When it stays silent.** Silent when everything is fine.

**Repo.** If it writes to the repo it pulls first and commits + pushes only its own paths at the end
(agents/README.md, rule 7); anything it learns goes to `data/agents/web-builder/memory.md` or the right graph node.

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
