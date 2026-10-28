---
name: Work repo PR review
agent: tech-maintainer
slug: work-repo-pr-review
trigger: "pr-opened on the owner's work knowledge repo"   # event-driven, no schedule
status: suggested     # suggested (not created on any runner) | enabled | paused
requires: [github]
created:              # YYYY-MM-DD, the day it is created on the runner
runner_id:            # the routine's id or folder on the runner, filled when created
---

<!-- A generic routine spec shipped with the template. When the owner creates it on a runner, keep this
     file as its mirror: same trigger and status, the saved prompt below (agents/README.md, rule 9). -->

**Intent.** For a shared work repository where other people open pull requests and ping the owner about them:
on every newly opened PR, a read-only review. What it changes, fit with the repo's own conventions, conflicts
with the default branch (`git merge-tree`), stacked base, CI and review state (UNKNOWN when it cannot be
verified), risks (secrets, personal or excluded content, broken links or frontmatter, deletions, dangling
references to removed files). Verdict to the owner in a couple of lines: safe to merge / merge after small fixes
(listed) / don't merge (why). It never merges, approves, comments, pushes to the PR or posts anywhere, and
nothing personal ever goes into the work repo.

**When it stays silent.** Never: every new PR gets one short verdict.

**Repo.** It writes one dated line in `data/agents/tech-maintainer/memory.md`, pulled first and pushed at the end
(agents/README.md, rule 7).

**Saved prompt.** (written here, verbatim or as a faithful summary, when the routine is created)
