---
name: Hourly message pull into the graph
agent: tech-maintainer
slug: hourly-message-pull
schedule: "0 6-23 * * *"   # cron in the owner's timezone; timing flexible +-15 min unless stated
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: [the WhatsApp bridge (SETUP-WHATSAPP.md)]
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** Pull, check the bridge is alive (restart it with the agreed start script if it is down, and say so), take only messages newer than the cursors in its state file (the message time, plus the time the bridge stored the row, so messages backfilled after a disconnect are not skipped; dedupe by message id), process them with `skills/remember-people`, lint, move the cursors, commit and push. The only routine that pulls messages into the graph; it never sends anything.

**Security.** It never opens, queries, attaches or prints the bridge's login/session database or any
session or key table, not even to resolve a contact name (unresolved senders stay UNKNOWN). The message
store is read only through a read-only connection that refuses session/key tables and redacts long
base64/hex strings in its output. If key material ever shows up in output, the run stops and tells the
owner in one line, without the value.

**When it stays silent.** Silent unless something breaks (a git conflict, the bridge down or stale, lint errors) or the bridge was restarted automatically. A logout or a QR request waits for the owner.

**Repo.** If it writes to the repo it pulls first and commits + pushes only its own paths at the end
(agents/README.md, rule 7); anything it learns goes to `data/agents/tech-maintainer/memory.md` or the right graph node.

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
