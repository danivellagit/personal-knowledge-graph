---
name: Weekday legal mail check
agent: legal
slug: weekday-legal-mail-check
schedule: "30 8 * * 1-5"   # cron in the owner's timezone; timing flexible +-15 min unless stated
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: [the owner's mail connector(s)]
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** Every weekday morning, read `data/agents/legal/memory.md` (open matters, the lawyers and firms
involved), then search every mailbox the owner connected for new mail since the last check from those firms
and lawyers and from certified/registered mail. For each message: what it asks, the action for the owner,
the dates. Also flag any deadline or hearing in the next 7 days.

**Read only.** It never replies, sends or drafts; it cites each message's id and writes UNKNOWN for anything
it cannot verify. New facts go to `memory.md`.

**When it stays silent.** Silent when there is no new legal mail and no deadline within 7 days.

**Repo.** If it writes to the repo it pulls first and commits + pushes only its own paths at the end
(agents/README.md, rule 7); anything it learns goes to `data/agents/legal/memory.md` or the right graph node.

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
