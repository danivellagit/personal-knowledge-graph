---
name: Weekly agents retrospective
agent: agent-manager
slug: weekly-agents-retrospective
schedule: "0 19 * * 0"   # cron in the owner's timezone; timing flexible +-15 min unless stated
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: [a way to message the other agents]
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same schedule and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** Every agent does its own self-critique of the week and proposes its changes to the owner;
the agent manager collects them.

1. Ask every agent for its self-retrospective of the week:
   - **A) Mistakes:** what went wrong (concrete, with dates), why, how to improve.
   - **B) Communication:** did it talk too little, not at all, or too much, with the owner and with
     the other agents; what to change.
   - **C) What it did really well:** where to double down.
   - **Proposed changes:** 1-3, each waiting for the owner's yes.
2. In parallel, check the week independently: the git log, each agent's `data/agents/<role>/memory.md`
   Log/Open, the routine mirrors in `agents/<role>/routines/` against the runner's real routines, and
   the transcripts if readable. Note what the self-critiques missed.
3. Collect replies until every agent has answered or a deadline (e.g. the next day at noon); an agent
   that did not answer is marked as such (UNKNOWN, never invented).
4. Write `data/agents/agent-manager/retros/<YYYY-MM-DD>.md`: one section per agent with A, B, C and
   proposed changes, plus the manager's notes.
5. Send the owner a short summary: who is fine, who is not, what waits for them; then each agent's
   proposals, to approve one by one.
6. Approved changes go to the owning agent (repo, structure, machine -> `tech-maintainer`). The manager
   never applies a proposal itself; nothing goes to anyone outside.

**When it stays silent.** Never: the owner gets the summary every week, even if short.

**Repo.** It pulls first and commits + pushes only `data/agents/agent-manager/` at the end
(agents/README.md, rule 7).

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
