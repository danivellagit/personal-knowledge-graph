# Start here

Read `CLAUDE.md` at the repo root first (`AGENTS.md` is an identical copy). It is the rulebook for
every model working in this repo, not only Claude: who you are here (an agent, a sweep, or the
keeper), rule zero, the loop, the wall, quotes vs reads, never invent a fact, never hand-edit a
frontmatter link list. Then `LEGEND.md` (the exact shape of every file) and `anatomy.md` (the
memory model and the optional modules).

First run: if `python3 tools/onboarding.py check` exits 1, this copy is not set up yet; offer the
guided first run in `skills/onboarding/SKILL.md` (`CLAUDE.md`, section 1).

Hooks in `.claude/` do not run for you: if the owner keeps a private remote, pull before you
start and commit + push yourself after every change.
