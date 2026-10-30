---
name: Daily health check-in
agent: health-advisor
slug: daily-health-check-in
schedule: "0 8 * * *"   # cron in the owner's timezone; timing flexible +-15 min unless stated
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: []
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** If there is an active treatment or a symptom being watched: one short question; plus anything of the prevention plan due in the next 7 days.

**Daily confirmations, recorded at once.** If the owner wants it, the check-in also asks whether today's
medications were taken and for a daily self-measurement (e.g. morning weight); answers go to their files
(the medication log, the measurement log) and the Life App is republished. A temporary measurement series a
doctor asked for (e.g. a week of blood-pressure readings) is asked for until its end date in `plan.md`, then
summarised (e.g. the average) for the doctor.

**When it stays silent.** Silent when there is nothing active and nothing due.

**Repo.** If it writes to the repo it pulls first and commits + pushes only its own paths at the end
(agents/README.md, rule 7); anything it learns goes to `data/agents/health-advisor/memory.md` or the right graph node.

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
