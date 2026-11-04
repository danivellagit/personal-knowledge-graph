---
name: Personal inbox: calendar and cleanup
agent: best-friend
slug: personal-inbox-triage
schedule: "0 8,14,20 * * *"   # cron in the owner's timezone; timing flexible +-15 min unless stated
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: [personal mail connector, calendar connector]
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** For the owner's personal mailbox (the work inbox stays with `founder-assistant`): read the new mail.
Bookings and appointments go on the calendar as private events with no invitations, and cancellations update
them. Junk, phishing and promotions from unknown senders go to spam; newsletters and low-value notifications from
senders the owner uses get archived; useful mail stays in the inbox. Urgent or legal items are flagged to the owner
right away. It never replies or sends.

**When it stays silent.** Silent when nothing changed.

**Repo.** If it writes to the repo it pulls first and commits + pushes only its own paths at the end
(agents/README.md, rule 7); anything it learns goes to `data/agents/best-friend/memory.md` or the right graph node.

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
