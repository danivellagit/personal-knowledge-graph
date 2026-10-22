# Anatomy: the personal knowledge graph

How the graph is shaped: node types, the edges that connect them, the memory model, the rules
that keep it from rotting, and the optional modules. The engine (this file, `LEGEND.md`,
`tools/`, `skills/`, `agents/`) is shareable; everything under `data/` is the owner's and private.
The exact field-by-field contract is [`LEGEND.md`](LEGEND.md); this file is the model behind it.

## Where things live

- **Your system of record (optional)** = wherever you already keep the official, heavy record:
  finance, health documents, goals, and the canonical People / Companies lists. Many people use
  Notion for this. If you do, the `notion-sync` skill mirrors People / Companies into the graph
  and keeps them reconciled. If you do not, skip it: the graph works standalone.
- **This repo (`data/`)** = the living social graph plus the raw stream (WhatsApp, email, calls).
  It holds People / Companies (mirrored as lean stubs if you use a system of record) and OWNS the
  connective entities discovered from the stream. Obsidian graph view runs on top of `data/`.
- **Off-repo, on your machine** = the heavy raw streams of the optional modules (wearable
  samples, GPS points) and their SQLite stores. Only facts derived from them enter `data/`.
- **The wall**: full, raw detail lives inside `data/` only. Nothing personal ever crosses into a
  work repo, any shared surface, or the `_followups` work digest. `data/` is gitignored by
  default; keep it that way unless your copy is a private repo and you want a backup.

## Node types

Two anchor types plus the entity graph. Light entities are born from the stream.

| Type | File | Origin |
| --- | --- | --- |
| person | `data/people/<slug>.md` | A: anchor, optionally mirrored from your system of record, enriched here |
| company | `data/companies/<slug>.md` | A: anchor, optionally mirrored (read-only stub) |
| place | `data/places/<slug>.md` | B: born in repo (restaurants, bars, clubs, gyms, coworkings) |
| passion | `data/passions/<slug>.md` | B: born in repo (climbing, sailing, chess, cooking) |
| city | `data/cities/<slug>.md` | B: born in repo (Lisbon, Porto, Lyon) |
| term | `data/terms/<slug>.md` | B: born in repo (recurring topics / concepts / projects / running jokes) |
| group | `data/groups/<slug>.md` | B: born in repo (a course, a community, a crew, an alumni cohort) |
| bond | `data/bonds/<slug>.md` | B: the NATURE of the owner's tie to a person (family, colleague, friend, partner, dating, advisor, investor, ex). A flat `relationship:` field turned into a real linked node. |
| role | `data/roles/<slug>.md` | B: job title, born in repo ON RECURRENCE (two or more people share it: co-founder, software-engineer, product-manager). A unique one-off title stays as a plain `role:` string attribute, not a node. |
| event | `data/events/<slug>.md` | B: born in repo (trips, offsites, birthdays, conferences) |
| media | `data/media/<slug>.md` | B: born in repo (podcasts, videos, interviews, articles) ABOUT graph people. A one-way source the owner *consumed*, not a two-way exchange. One node per artifact, reusable across every person it features. |
| interaction | `data/interactions/<slug>/YYYY-MM-DD.md` (recent) or `YYYY-MM.md` (old rollup) | the raw episodic stream |
| owner | `data/_me.md` | the point of view; see "Manual capture" |

**media vs interaction.** An interaction is an episode of the owner's *tie* to someone (they were
there, two-way, dated, lives under the person's folder). Media is a public *artifact* they
consumed (podcast / video / interview / article), one-way and reusable, that is a rich source
about one or more people. Extract the durable facts up into the person's semantic node; keep the
raw notes in the media node. Do not model a podcast as an interaction.

**A vs B.** A = the two anchors (people, companies); if you use a system of record they are
mastered there and mirrored here. B = born in this repo from the stream; promote to the system of
record only if it becomes officially needed. Never master a B type outside the repo: it would
kill auto-population.

## Edges: always a forward + reverse pair

Edges are **quoted** `"[[slug]]"` wiki-links in frontmatter, as **lists of scalars** (never lists
of maps). You write the forward edge, through `tools/graph.py`; `tools/lint.py --fix` writes the
reverse. The full table, with types, is in [`LEGEND.md`](LEGEND.md) §2.

| Forward (on node) | Reverse (on the other node) |
| --- | --- |
| person `family` / `partner_of` / `colleagues` / `knows` | same field |
| person `introduced_by` | person `introduced` |
| person `mentors` | person `mentored_by` |
| person `lives_in` -> city | city `residents` |
| person `works_at` -> company | company `people` |
| person `into` -> passion | passion `people` |
| person `frequents` -> place | place `regulars` |
| person `member_of` -> group | group `members` |
| person `relationship` -> bond (list of `[[bond]]`, never a flat string) | bond `people` |
| person `role_type` -> role (normalised; only when it recurs, two or more) | role `people` (the free-text `role:` title stays as-is, e.g. "Co-founder & CEO"; `role_type:` carries the linked node, e.g. `["[[co-founder]]"]`) |
| person `events` -> event | event `people` |
| place `in_city` -> city | city `places` |
| interaction `person` (anchor) + `with` [people] + `at` place + `city` + `about` [passion/term] | (the interaction is the source of truth for its day; entities do not back-link individual days) |
| media `features` -> [people] | person `featured_in` -> [media] |
| media `about` -> [term] + `by` host/outlet | (media owns the topic reference, like an interaction; `by` stays a plain string until the host recurs, then becomes a `[[person]]`) |
| event `people` + `place` + `city` + `groups` | on each: `events` |

## Rules that keep the graph alive

- **Personal stories first, captured aggressively and specifically (the reason this graph
  exists).** The human layer beats the work layer every time: life stories, where someone is
  from, family, health, feelings, fears, ambitions, character, jokes, what they are going through
  right now. Mine every transcript and every message thread for it, quote the real words, and
  write it into the person's profile even when the exchange was "about work". Be **obsessed and
  specific, capturing proper names**: the partner / spouse (name, job, state of the relationship,
  plans together), children (names, ages), parents and siblings, close friends and who introduced
  whom, and the **investors / people who funded** them or their company. Generic ("a partner",
  "some investors") is a failed capture; a known-but-unnamed partner or backer is a gap to chase.
  A log that only records the work is a failed capture. Never compress the personal beat away to
  be tidy; that beat is the whole value.
- **Nothing is unattached, and every frontmatter link is QUOTED.** Two halves of one rule, and
  the most expensive lesson the original instance learned.
  - **Quote it.** `person: "[[wren-halvorsen]]"`, never `person: [[wren-halvorsen]]`. YAML has no
    idea what a wiki-link is: unquoted, `[[x]]` parses as a list containing a list containing a
    string, so **Obsidian registers no reference** and the tooling finds no link either. In the
    original instance nearly every interaction file (well over 600) was written unquoted for a
    month: the graph view showed a dense core inside a ring of hundreds of isolated dots, and
    nothing complained because the tooling then read both forms with a regex and Obsidian did
    not. `lint.py` now fails on `unquoted-link`.
  - **Attach it.** Every `.md` under `data/` has at least one wiki-link in or out. A file with
    neither is invisible in the graph and unreachable from any brief, so it is a bug, not a
    style choice. That includes the `_followups/` digests: group them under `## [[slug]]`
    headings, not bare names. `lint.py` reports `orphan-file` and there are no exemptions.
- **Node-on-recurrence.** A light entity (B) becomes a file only when it recurs (two or more
  mentions, or two or more days). Below that it stays plain text inside the interaction. This
  stops the swamp. (`sweep.create_nodes: always` in config creates a person node for every
  human, even one-offs; light entities still wait for recurrence.)
- **Dedup / alias resolution. Never fork.** Resolve before you create. Every node has `aliases:`;
  the same entity under different spellings or ids (a WhatsApp lid vs a phone number, "The Copper
  Kettle" vs "copper kettle", a nickname vs the full name) must land on ONE node. When a fork
  happens anyway, `tools/merge.py` resolves it; when a placeholder slug gets its real name,
  `tools/rename.py` moves it with every link intact.
- **Provenance.** Facts cite their source inline: `whatsapp:<phone>`, `fireflies:<id>`,
  `gmail:<thread>`, `manual:<owner_slug>-<date>` (a fact the owner pushed by hand, see below). A
  fact seen once is not a fact you assert as stable.
- **Quotes are facts, reads are guesses.** The owner's remark is recorded as the quote it is. An
  interpretation may sit in a log, marked as the sweep's read, but never reaches a Current state
  or a brief until the owner confirms it.
- **Bidirectional-link lint, in code.** Every forward edge must have its reverse, but you write
  only the forward one and `python3 tools/lint.py --fix` writes every reverse. A run is done when
  `python3 tools/lint.py` prints `mechanical: 0`. **Never hand-edit a frontmatter link list**: a
  freehand reverse-edge repair once appended items at the wrong indent and corrupted three hub
  nodes, so Obsidian silently stopped reading their edges for four days.
- **The graph pass (Flow E).** Logging is per-person and therefore only draws edges toward the
  owner. Once per sweep, ask the cross-person questions: who was in the room together (`with:`:
  ≥2 shared days and no path means add `knows`), who introduced whom, where did it happen, which
  venue has now recurred. This is the step whose absence turned the original instance's first
  month into a star instead of a network.
- **The gap register.** What the memory does not know is tracked, not just reported:
  `data/_gaps/`, worked by `tools/gaps.py`. A gap closes on evidence, never on silence; three
  failed attempts mean ask the owner. See `CLAUDE.md` §5.
- **No hardcoded horizons.** A detector that starts at a typed-in date cannot see what is before
  it. `tools/owed_backfill.py` measures the days still owed every time.
- **Multi-source ingest.** The entity scan reads all configured sources together (transcripts,
  mail, WhatsApp), not one source in isolation. **Manual is the fourth source**, owner-pushed on
  demand rather than swept: the offline coffee, the phone call, and above all the owner's own
  read on a person or situation, none of which ever flow through the integrations.
- **Full detail, never discreet, inside `data/` only.** Dating, health, money, legal, family,
  gossip, real quotes: all recorded in full. The only boundary is the wall to the outside.

## Manual capture (owner-pushed)

The sweep only sees what flows through WhatsApp / transcripts / mail. The offline interaction and
the owner's own thought never do, and they are the most valuable input. So manual is a
first-class source, pushed on demand, never by the timer.

- **Two shapes.** (1) an **offline interaction** that happened with no recording (a call, a
  coffee); (2) a **thought / feedback** from the owner: a read on a person or a situation.
- **Still just a log entry.** Write it as a normal interaction:
  `data/interactions/<slug>/YYYY-MM-DD.md`, `setting: manual`,
  `source: manual:<owner_slug>-<date>`. Then treat it identically to a swept one: roll up into the
  node, run the entity scan, wire every forward edge. No new folder, no new node type.
- **Anchor it to what it is about.** A person (their node), or a company / place / passion / term
  (via `about`). A thought with no other anchor hangs off the **owner file** below.
- **The owner file.** `data/_me.md`, at the entrance of `data/`,
  NOT a node in `people/`: the owner is not a counterpart, they are the point of view the whole
  graph is written from, so it needs no outgoing wiki-links (everything relates to them by
  definition). It carries the owner's durable profile (principles, way of being, context) plus a
  Current state block. Self-thoughts and every conversation the owner has with an agent in this
  repo log as dated episodes under `data/interactions/_me/` and roll up into it. The
  sweep never touches it and `notion-sync` skips it.

## Memory model (three layers)

- **episodic** -> `data/interactions/<slug>/*.md`: append-only; recent = daily, old = monthly
  rollup. (The optional body, food and training days are episodic too.)
- **semantic** -> `data/people/<slug>.md` (and the light entity bodies): who / what they ARE,
  sharpens over time.
- **working** -> the "Current state" block on top of a person node: what is hot now.

---

# Optional modules

Everything below is opt-in. The core (people graph + tools + `remember-people`) works without
any of it. Enable a module in `config.local.yml` and set up its external pieces; leave it out and
nothing references it. Every module follows the same shape: **raw off-repo, only facts in the
repo, a number or a coordinate is a fact and its meaning is not.**

## Agents

An agent is a role with a memory that works on top of the graph and talks to the owner.

```
agents/<role>/AGENT.md     # who it is: role, voice, what it reads, what it writes, its flows
skills/<role>/SKILL.md     # the thin launcher, so "/<role>" or "talk to the <role>" starts it
data/agents/<role>/        # its own memory: private, like the rest of data/
```

The roles the template ships with: `fitness-coach` (training, food, sleep, recovery, from the
body layer), `psychologist` (reflective sessions; not a licensed therapist, and says so),
`founder-assistant` (the work day: calendar, mail, meetings, follow-ups; drafts, never sends on
its own), `linkedin-coach` (the owner's own posts and comments; drafts, never publishes). The
owner can give each a persona name and profile (`persona:` in `AGENT.md`); see
`agents/README.md`.

Rules every agent inherits: `CLAUDE.md` applies in full (the wall, quotes vs reads, never
invent, never hand-edit frontmatter links, always push); an agent's reads of the owner stay in
its own log marked as reads, never in the owner's profile; one agent, one job.
**`data/agents/psychologist/sessions/` is the one place whose content never propagates**: nothing
said in a session is copied into a profile, a brief or another agent unless the owner asks.

## The body layer (a wearable)

The graph knows *what* happened and *with whom*; the body knows *when*, to the second, and what
it did. Joined on time, the body becomes the clock of the whole graph instead of a separate
health diary.

- **Raw** lives off-repo (`body.raw_dir`): heart rate every few seconds is megabytes a day. It
  is pulled by `tools/body-pull.sh` through the wearable vendor's command-line client or API
  (`body.cli`; the reference setup uses a Google Health / Fitbit CLI, one JSON file per data type
  per day, resumable) and rebuilt into a local SQLite store (`body.db`) by
  `python3 tools/body.py ingest`. Never committed. Two devices on one account are different
  sensors: keep one (`body.sources`), never mix them.
- **The day** is a node, `data/body/body-<date>.md`: the numbers in frontmatter (Obsidian Dataview
  can chart them), the readable detail in the body (sleep stage by stage, heart hour by hour,
  sessions, still-heart episodes), links out to passions, places, people and the same day's
  interactions. `data/body/body-week-<YYYY-Www>.md` sums the week; `data/body/body-log.md` is the
  one-row-per-day table. All written by `python3 tools/body.py days [FROM [TO]]`.
- **The joins** the generator makes every day, from facts only: the chain of days and the week
  node; who the owner was in touch with and who they met in person (from the interactions); city,
  venue and the events dated that day; and, from WhatsApp timestamps against the sleep times, who
  they wrote to last before sleeping, first on waking, after midnight, and most that day. Who and
  when, never what.
- **Notion mirror (optional)**: `python3 tools/body.py notion FROM TO` emits one row per day for
  a Notion database; each day node keeps its row's `notion_url`. The repo is the source; Notion is
  the view for charts and filters.
- **Calories, ours next to the wearable's**: `python3 tools/calories.py day YYYY-MM-DD [--write]
  [--height-cm CM]` keeps the wearable's active kcal and replaces its basal with the mean of
  Mifflin-St Jeor and revised Harris-Benedict (weight valid on that day, age, `body.height_cm`),
  with an experimental small correction for the day's resting heart rate against the previous
  two weeks, prorated for a day in progress. It flags days whose implied basal looks incomplete.
  `--write` puts a marker-delimited `## Calories` section inside the `## Notes` tail that
  `body.py` preserves; reruns replace it.

What it is for, in order of value:

1. **The body finds events the graph cannot see.** A 90-minute session at heart 140 is a match:
   who was there, where? Every unattributed session is a gap in the register
   (`body-session-unattributed`), chased like a missing surname. This is the relational layer the
   graph is weakest at (`CLAUDE.md`, failure 1).
2. **The body inside an interaction.** For a call or a meeting with a known `time:`,
   `python3 tools/body.py window START END` gives the heart against that day's still baseline,
   whether the owner was walking, and the minute of the peak. With a transcript, the sentence at
   that minute can be put next to the number. Two facts side by side, never a conclusion.
3. **People**, measured: sessions together, sleep the night after. Numbers with their n only;
   never in a Current state or a brief until the owner confirms what they mean.
4. **The owner**: baselines and rhythm in the owner file, rebuilt from the day nodes.

The rule that matters most: **a number is a fact, its meaning is not.** A heart at 112 while
sitting still is recorded as exactly that. Caffeine, stairs, digestion and posture move it too,
which is why only stillness-filtered minutes count, and why nothing here ever becomes "they were
stressed". Same rule as quotes vs reads.

### Food and training

- **`data/food/food-<date>.md`**: every meal, from a photo or the owner's words, written through
  `python3 tools/food.py add <photo> [--time HH:MM]` (photos resized into `data/food/photos/`),
  then filled by the fitness coach: what, ingredients, portion, a nutrient estimate line, where
  and with whom. `python3 tools/food.py table` generates `food-log.md` and `ingredients.md`.
  Linked to the body day; `with` / `at` like an interaction. Every number is an estimate from a
  photo unless the block says otherwise.
- **`data/training/training-<date>.md`**: what the owner did in the gym or on court, in their
  words, next to what the body day measured.

### The labs

The wearable is the body by the second; lab reports are the body by the year. If the owner keeps
the documents somewhere (a folder, a Notion database with the PDFs attached), each report gets a
node, `data/body/labs/lab-<date>.md`, carrying every value with unit, reference range and method,
the lab's own comments, the out-of-range count, and (optionally) the source row's `notion_url`.
Key markers sit flat in frontmatter with fixed keys (`LEGEND.md`) so Dataview can chart them
across years. `data/body/labs/labs.md` lists every report with one table, a row per marker and a
column per date. PDFs stay off-repo (`body.labs_pdf_dir`).

- **The source of truth for the numbers is the PDF**, not a typed summary of it.
- **Each sweep checks the labs source for reports with no node** and transcribes new ones the
  same day.
- A value is a fact, its meaning is the doctor's. No diagnosis, no advice, nothing in a brief.

## The location layer (phone GPS)

Where the owner was, so a meeting gets a place without anyone saying it. Same shape as the body:
raw off-repo, only facts in the repo.

- **Live:** the open-source [Overland](https://github.com/aaronpk/Overland-iOS) iOS app posts GPS
  batches (a low-battery "significant location" mode is enough) to a small receiver the owner
  hosts on their **own** account (a serverless endpoint writing to a private blob store works
  well). `tools/location-pull.sh` copies new batches into `location.raw_dir`, resumable, and may
  prune the remote store after a few days. Never committed: raw coordinates stay out of git.
- **The past:** Google Maps Timeline has no API, but its on-device export (`Timeline.json`) holds
  the history; drop it in `location.raw_dir/timeline/`.
- **The store:** `python3 tools/location.py ingest` rebuilds a local SQLite store
  (`location.db`) from both sources; `python3 tools/location.py day YYYY-MM-DD` lists that day's
  visits, `summary` the coverage. A visit has a place id, coordinates and a type (home, work,
  unknown), **no name**.
- **Next, by design:** turn points into visits, match them to `places/` nodes and to the same
  day's interactions, and write them into the day node. **A place is named only from a real
  match** (a `places/` node, an address in a log), never guessed from coordinates alone.
