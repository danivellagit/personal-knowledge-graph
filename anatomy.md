# Anatomy: the personal knowledge graph

How the graph is shaped: node types, the edges that connect them, and the rules that keep it
from rotting. The engine (this file plus `skills/`) is shareable; everything under `data/` is
yours and gitignored.

## Where things live

- **Your system of record (optional)** = wherever you already keep the official, heavy record:
  finance, health, documents, goals, and the canonical People / Companies lists. Many people use
  Notion for this. If you use Notion, the `notion-sync` skill mirrors People / Companies into
  the graph. If you do not, skip it: the graph still works standalone.
- **This repo (`data/`)** = the living social graph plus the raw stream (WhatsApp, email, calls).
  It mirrors People / Companies as lean stubs for wiki-linking and OWNS the connective entities
  discovered from the stream. Obsidian graph view runs on top of `data/`.
- **The wall**: full, raw detail lives inside `data/` only. Nothing personal ever crosses into a
  work repo or any shared surface. `data/` is gitignored; keep it that way.

## Node types

Two anchor types plus the entity graph. Light entities are born from the stream.

| Type | File | Origin |
| --- | --- | --- |
| person | `data/people/<slug>.md` | A: anchor, optionally mirrored from your system of record, enriched here |
| company | `data/companies/<slug>.md` | A: anchor, optionally mirrored (read-only stub) |
| place | `data/places/<slug>.md` | B: born in repo (restaurants, bars, clubs, gyms) |
| passion | `data/passions/<slug>.md` | B: born in repo (padel, wine, running, cooking) |
| city | `data/cities/<slug>.md` | B: born in repo (Milano, Roma, Barcelona) |
| term | `data/terms/<slug>.md` | B: born in repo (recurring topics / concepts / projects) |
| group | `data/groups/<slug>.md` | B: born in repo (a course, a community, a crew) |
| bond | `data/bonds/<slug>.md` | B: the NATURE of your tie to a person (family, colleague, friend, partner, dating, advisor, investor, ex). This is a flat `relationship:` field turned into a real linked node. |
| role | `data/roles/<slug>.md` | B: job title, born in repo ON RECURRENCE (two or more people share it: co-founder, software-engineer, founder). A unique one-off title stays as a plain `role:` string attribute, not a node. |
| event | `data/events/<slug>.md` | B: born in repo (trips, offsites, birthdays) |
| interaction | `data/interactions/<slug>/YYYY-MM-DD.md` (recent) or `YYYY-MM.md` (old rollup) | the raw episodic stream |

**A vs B.** A = the two anchors (people, companies); if you use a system of record they are
mirrored here read-only and mastered there. B = born in this repo from the stream. Never master a
B type outside the repo: it would kill auto-population.

## Edges: always a forward + reverse pair, written in the same edit

Edges are `[[slug]]` wiki-links in frontmatter, as **lists of scalars** (never lists of maps: a
normalizer flattens maps).

| Forward (on node) | Reverse (on the other node) |
| --- | --- |
| person `family` / `partner` / `colleagues` / `knows` | same field |
| person `introduced_by` | person `introduced` |
| person `mentors` | person `mentored_by` |
| person `lives_in` -> city | city `residents` |
| person `works_at` -> company | company `people` |
| person `into` -> passion | passion `people` |
| person `frequents` -> place | place `regulars` |
| person `member_of` -> group | group `members` |
| person `relationship` -> bond (list of `[[bond]]`, never a flat string) | bond `people` |
| person `role_type` -> role (normalized; only when it recurs, two or more) | role `people` (the free-text `role:` title stays as-is, e.g. "Co-founder & CEO"; `role_type:` carries the normalized linked node, e.g. `["[[co-founder]]"]`) |
| place `in_city` -> city | city `places` |
| interaction `person` (anchor) + `with` [people] + `at` place + `about` [passion/term] | (the interaction is the source of truth for its day; entities do not back-link individual days) |
| event `people` + `place` + `city` | on each: `events` |

## Rules that keep the graph alive

- **Node-on-recurrence.** A light entity (B) becomes a file only when it recurs (two or more
  mentions, or two or more days). Below that it stays plain text inside the interaction. This
  stops the swamp.
- **Dedup / alias resolution.** Resolve before you create. Every node has `aliases:`; the same
  entity under different spellings or ids (a WhatsApp lid vs phone number, "Bar Basso" vs "bar
  basso") must land on ONE node. Never fork.
- **Provenance.** Facts cite their source inline: `whatsapp:<phone>`, `fireflies:<id>`,
  `gmail:<thread>`. A fact seen once is not a fact you assert as stable.
- **Bidirectional-link lint.** Every forward edge must have its reverse. Run the lint before a
  sweep is considered done; fix dangling edges.
- **Multi-source ingest.** The entity-scan reads all configured sources together (transcripts,
  mail, WhatsApp), not one source in isolation.
- **Full detail, never discreet, inside `data/` only.** Dating, health, money, family, real
  quotes: all recorded in full. The only boundary is the wall to the outside.

## Memory model (three layers)

- episodic -> `data/interactions/<slug>/*.md`: append-only; recent = daily, old = monthly rollup.
- semantic -> `data/people/<slug>.md` (and the light entity bodies): who / what they ARE, sharpens over time.
- working -> the "Current state" block on top of a person node: what is hot now.
