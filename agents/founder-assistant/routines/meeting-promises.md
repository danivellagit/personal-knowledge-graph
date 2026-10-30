---
name: Promises from yesterday's meetings
agent: founder-assistant
slug: meeting-promises
schedule: "30 8 * * 1-5"   # cron in the owner's timezone; timing flexible +-15 min unless stated
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: [a transcript connector, mail and calendar connectors]
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** Read every transcript of the previous working day (Monday: the weekend too), including duplicate recordings of the same meeting, and extract every commitment the owner made (send something, an intro, a follow-up, a call, a piece of work): person, company, what, deadline if said, meeting. Check each against sent mail, drafts, chat and the calendar (done / draft ready / open). For each open one, block a short hold on the work calendar in the next 1-3 working days, before any deadline, never overlapping an existing event or protected block, no guests, no notifications, never a duplicate. Save the open promises in the work digest (`data/_followups/`) and the interaction notes (work only), then report grouped by person.

**Only what the owner said.** An item whose speaker cannot be attributed (a room microphone) is marked uncertain and gets no hold. It never sends a mail, message or invite.

**When it stays silent.** Silent when there were no meetings or no promises.

**Repo.** If it writes to the repo it pulls first and commits + pushes only its own paths at the end
(agents/README.md, rule 7); anything it learns goes to `data/agents/founder-assistant/memory.md` or the right graph node.

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
