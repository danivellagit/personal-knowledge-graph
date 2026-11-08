---
name: Message action review (to-dos and commitments)
agent: tech-maintainer
slug: message-action-review
schedule: "0 9-21/3 * * *"   # cron in the owner's timezone; timing flexible +-15 min unless stated
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: [the WhatsApp bridge (SETUP-WHATSAPP.md), the hourly message pull]
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** Every few hours, turn the owner's chats into a small actionable inbox: unanswered requests,
promises the owner made, deadlines, things to prepare, meetings proposed or confirmed. It is an action
review, not ingestion: it never touches the hourly pull, its cursors or the bridge configuration. Its
source is the graph's interactions, plus newer rows read only through the read-only message query tool.
The first run looks back 72 hours; later runs read only new rows plus the context around open items, and
skip newsletters, one-time codes and automated senders. It keeps its own cursor and stable item ids in
`data/agents/tech-maintainer/message-action-review.md`, so nothing is notified twice.

**Calendar.** Read only: to spot conflicts and propose private blocks or questions. No writes, invites,
bookings or replies.

**Handoffs.** Specific preparation goes only to the responsible agent (personal logistics to the best
friend, meals and training to the fitness coach, medical to the health advisor, money to the accountant,
and so on), with minimal context, never asking them to send, publish or change a calendar.

**When it stays silent.** One short digest to the owner only for new or materially changed items; nothing
new means silence. It never sends a message in the owner's name.

**Security.** Same as the hourly pull: never opens the bridge's session/key database, only the read-only
connection; unresolved senders stay UNKNOWN.

**Repo.** It pulls first and commits + pushes only its own files at the end (agents/README.md, rule 7).

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
