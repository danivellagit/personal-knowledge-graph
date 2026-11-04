---
name: Work repo PR backlog triage
agent: tech-maintainer
slug: work-repo-pr-triage
schedule: "0 9 * * 1,3,5"   # cron in the owner's timezone; timing flexible +-15 min unless stated
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: [github or a local clone of the work repo]
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** Keep the open pull request backlog of a shared work repository under control. Every couple of days, a
read-only pass over all open PRs: link, title, author, age, size, what it does, conflicts with the default branch,
CI and review state (UNKNOWN when it cannot be verified), risks (secrets, personal data, structural rewrites), and
a verdict per PR (merge / close / needs changes / ask the author). Compared with the previous report, so the owner
sees what moved. It never merges, closes, approves, comments or pushes, and nothing personal goes into the work repo.

**When it stays silent.** Silent when there are no open PRs or nothing changed since the last report.

**Repo.** It saves the dated report (no code, no secrets) in `data/agents/tech-maintainer/reports/`, pulled first
and pushed at the end (agents/README.md, rule 7).

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
