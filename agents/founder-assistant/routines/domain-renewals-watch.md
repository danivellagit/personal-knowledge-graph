---
name: Domain renewals and payments watch
agent: founder-assistant
slug: domain-renewals-watch
schedule: "0 9 * * 1-5"   # cron in the owner's timezone; timing flexible +-15 min unless stated
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: [a mail connector]
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** Read-only scan of the work mail for new messages from the domain registrars and registries since the last run. Alert at once on a failed or declined payment, an expired card or payment method, a failed renewal, an expired domain or one in redemption, or a required action; confirm in one line when a known renewal's receipt arrives; flag a missing receipt three days after a renewal date. The renewal register (domain, account, date, expected cost) lives in its memory.

**When it stays silent.** Silent when nothing needs the owner's attention. Marketing, summaries and "your domains stay active" notices are ignored; it never replies, archives, labels or clicks.

**Repo.** If it writes to the repo it pulls first and commits + pushes only its own paths at the end
(agents/README.md, rule 7); anything it learns goes to `data/agents/founder-assistant/memory.md` or the right graph node.

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
