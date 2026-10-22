---
name: graph-audit
description: The weekly look at the graph from above. The daily sweep records person-by-person and cannot see what is missing across people; this one measures the graph as a graph, chases the gaps that have gone stale, and reports honestly on whether the memory is connecting or just accumulating.
---

# graph-audit

## Why it exists

The daily sweep (`remember-people`, Flow C) walks one relationship at a time. It is good at
recording and structurally blind to everything cross-person: whether two people who keep sharing
rooms are connected, whether the introduction graph is growing, whether a whole node type has
quietly stayed empty, whether a follow-up file has been open for three weeks.

The first audit of the graph this engine was built on found exactly that: excellent episodic and
semantic memory, a relational layer that was a star around the owner, `places/` with two nodes,
and three hub nodes with corrupted frontmatter that a hand-run repair had introduced four days
earlier and nobody had caught.

This skill runs **weekly** and answers one question: *is the memory getting better connected, or
just bigger?*

## What it does

1. **Shape first.**
   ```bash
   python3 tools/lint.py --fix     # mechanical only: reverses, dedup, YAML shape, body lists
   python3 tools/lint.py           # must end with "mechanical findings: 0"
   ```
   If `--fix` had anything to do, say so in the report: a non-empty mechanical list means
   something upstream is writing edges by hand instead of through `tools/graph.py`, and that is
   a process bug worth naming, not just cleaning up.

2. **Measure the graph as a graph.** Record these every week, in the report, as a series: the
   trend is the point, not the absolute value.
   - people, interactions, nodes per type (a type stuck near zero is a finding);
   - median and mean degree over people, and how many are at degree ≤1 (effectively orphans);
   - coverage: `knows`, `lives_in`, `partner`, `introduced_by`, `works_at`, `member_of`;
   - `introduced_by` edge count: the single best proxy for whether the human layer is being
     mined or just logged;
   - co-presence holes still open (pairs together on two or more days with no path).
   The check definitions live in `tools/checks.py`, shared by the lint and the gap register, so
   both see exactly the same findings with the same stable ids.

3. **Read the gap register as a trend, which is the whole point.**
   ```bash
   python3 tools/gaps.py sync      # reconcile, and record today in history.jsonl
   python3 tools/gaps.py trend     # opened vs closed per sync: net closing or net opening?
   python3 tools/gaps.py today     # what should be chased next
   ```
   Three things to report every week, by name:
   - gaps **closed with real evidence** (not "the detector stopped seeing it");
   - gaps flagged **STALLED** (3+ attempts): these are not going to close on their own, so
     either put the question straight to the owner or drop them with a reason
     (`gaps.py drop <id> -n "..."`);
   - gaps **open >21 days with zero attempts**: those are being ignored, not worked, and that is
     a process finding about the daily sweep, not about the data.
   If `trend` shows net opening for two weeks running, the sweep is recording faster than it is
   resolving. Say so plainly.

4. **Check the catch-up.** `python3 tools/owed_backfill.py`: days with traffic in a source and no
   interaction file. It measures from the data, never from a hardcoded date; if the owed region
   is not shrinking week over week, the backfill has stopped and that is a finding.

5. **Chase the gaps, in this order.** From `python3 tools/gaps.py today`, recording every outcome
   (`gaps.py close <id> -e "..."` or `gaps.py attempt <id> -n "what you checked"`):
   - `possible-duplicate` → verify and merge with `python3 tools/merge.py <loser> <survivor>
     --why "..."` (`--dry-run` first; never fork a person);
   - placeholder slugs whose real name has surfaced → `python3 tools/rename.py <old> <new>
     --name "Real Name" --why "..."`;
   - pairs co-present on two or more days with **no path** → resolve from the stream, add
     `knows`;
   - `NAME UNKNOWN` partners / unnamed children / unnamed investors → re-read that person's
     recent threads; if the name genuinely is not there, leave the gap and record the attempt;
   - people with no location;
   - people whose `name` is one word or a placeholder slug;
   - recurring proper nouns with no node (venue? city? company?);
   - follow-up files older than 14 days with nothing ticked;
   - dailies older than 60 days that should be a monthly rollup;
   - cold contacts (no interaction in 45+ days): for the owner to decide, not to prune.

6. **Report to the owner, in prose, honestly.** What improved since last week, what got worse,
   what is structurally stuck. Name the number. A week where nothing improved is a finding, not
   something to dress up. If the same gap has survived three audits, say that it is not going to
   close on its own and propose either a targeted stream re-read or dropping it.

## The rules that make it safe

- **Never invent a fact to make the lint quiet.** No inferred surname, no guessed city, no
  assumed partner name. This graph is read before real conversations with real people.
- **Mechanical and gap findings never mix.** `--fix` touches only the provably-right class.
- **Every data change goes through `tools/graph.py`**, never a hand-edited frontmatter list.
- **A non-trivial repair belongs in a migration**, `tools/migrations/<date>-<name>.py`, with the
  evidence quoted inline, so the next reader can see why each edge was added.
- **A gap closes on evidence, never on silence.** `sync` flags fact-gaps that vanished without
  an explanation (a name does not become known by itself: usually the node was renamed, merged
  or deleted); check each one and re-close it with the real reason instead of enjoying the
  smaller number.
- **If you commit `data/` to a private repo, commit what you found, not that you ran**:
  `audit: close 18 co-presence holes, 5 new cities`.

## Scheduling

Weekly, after a daily sweep has run (so the shape is fresh), e.g. Sunday evening. Chain:
`remember-people` (daily) → `notion-sync` (daily, optional) → `graph-audit` (weekly).
