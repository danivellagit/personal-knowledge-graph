---
name: remember-people
description: A chief-of-staff for one-to-one meetings. Before a 1:1 it prepares a brief on the person (work + personal), keeps an append-only log of every meeting, runs the daily sweep that turns calls, mail and chats into the graph, and suggests when to see them next. The staff that remembered everything.
---

# remember-people

## What it does, in one line

It puts the right person back in front of you five minutes before you walk in: who they are,
when you last met, what was left open, two or three personal hooks to open with, what NOT to
raise, and how often you should be in touch.

The value is not storage. It is retrieval at the right moment.

Who "the owner" is comes from `config.local.yml`: `owner` is the display name, `owner_slug` the
slug of the owner's own file (`data/_me.md`, with dated self-episodes under
`data/interactions/_me/`). The owner is the point of view of the whole graph, never a node in
`people/`.

## The type system (a linked graph)

The person and the interaction are the two anchors, but they live inside a wider graph of
connective entities discovered from the stream. **The full node map, the edge table (every
forward + reverse pair), and the rules live in [`anatomy.md`](../../anatomy.md); the exact
field-and-edge contract the tooling enforces is [`LEGEND.md`](../../LEGEND.md).** Read both
before writing nodes. Short version:

| Thing | A type? | Where it lives |
| --- | --- | --- |
| **person** | yes, a node with a file | `data/people/<slug>.md` |
| **interaction** | yes, a node with a file | `data/interactions/<slug>/YYYY-MM-DD.md` (recent) or `YYYY-MM.md` (old rollup) |
| **company** | yes (anchor, optionally mirrored from a system of record) | `data/companies/<slug>.md` |
| **place / passion / city / term / group / event / bond / role** | yes, born in repo on recurrence | `data/<type>/<slug>.md` |
| **media** | yes, born in repo (one node per artifact) | `data/media/<slug>.md`: a podcast / video / interview / article / book ABOUT people that you *consumed* |
| relation (any node to any node) | no, an **edge** | forward + reverse wiki-link pair in frontmatter |
| meeting transcript / chat / mail | no, a **source** | referenced by id, never stored whole |
| manual capture (offline interaction / owner thought) | no, an owner-pushed **source** | logged on demand as an interaction, `setting: manual` (see Flow D) |
| brief | no, an **ephemeral view** | generated on demand, never saved |

The brief (Flow B) looks at the human first; the graph lets it ramify (who they know, where you
meet them, what you share) instead of reading isolated files. Keep the discipline that makes it
work: **node-on-recurrence** (a light entity becomes a file only when it recurs, two or more
mentions or days), **dedup before create** (aliases, never fork), and **every edge is a forward
+ reverse pair**: you write the forward one through `tools/graph.py`, `tools/lint.py --fix`
writes the reverse.

Templates for the three files this skill writes most: [`templates/person.md`](templates/person.md),
[`templates/interaction.md`](templates/interaction.md), [`templates/media.md`](templates/media.md).

## Memory model: three layers, like the brain

```
episodic   -> data/interactions/<slug>/*.md   individual meetings, immutable, append-only
semantic   -> data/people/<slug>.md            who they ARE: stable facts (family, character)
working    -> "Current state" section on top   what is hot NOW (open threads, pending follow-ups)
```

- **Episodic** is the raw archive. You never read all of it.
- **Semantic** is what you generally know about them. It does not grow with each meeting, it
  gets sharper. After 20 meetings the profile is not 20x longer, it is more accurate.
- **Working** is the few live things: where you left off, what you promised, what to open with.

## Flow A: "log the 1:1 with X"

1. Take the transcript (transcription tool) or spoken / typed notes.
2. Separate: work side / what you learned about them (personal) / what you promised.
3. Append a new file to `data/interactions/<slug>/YYYY-MM-DD.md` from the template. Never
   overwrite.
4. **Rollup** in the same write: promote any new stable fact into the profile (semantic),
   rewrite the "Current state" section (working), close resolved follow-ups.
5. **Wire it**: run the graph pass (Flow E) on this one interaction, then the lint.

The rollup is what keeps history from piling up: the summary compresses itself a little on
every meeting. Memory is the living summary plus the logs as backup, not the sum of 20 logs.

## Flow B: "prepare the brief for X"

The brief reads three things only, never the full archive:

```
profile (semantic) + current state (working) + last 2-3 interactions (recency)
```

1. Open `data/people/<slug>.md`.
2. Glob the last 2-3 files in `data/interactions/<slug>/`.
3. If an external source is configured and X is a work contact, read it **read-only** for the
   work side. If nothing is there, do not block.
4. Check the calendar: next scheduled meeting + time since last contact -> cadence.
5. Output the one-pager: who they are / last contact / what is open / 2-3 personal hooks /
   what NOT to raise / when to see them next.
6. **No bare names.** Any third person named in the brief (a hook, an open thread) carries one
   inline clause of who they are and where the name comes from ("Jonah Whitlock, the profile
   X sent on WhatsApp last Tuesday as a hire idea"), never a naked name. The owner reads the
   brief precisely because they do not remember; assume zero recall of secondary names, even
   ones from yesterday.
7. **Only confirmed guidance.** A hook or a "what NOT to raise" comes from something said or
   confirmed, never from the sweep's own read (see "Quotes are facts" below).

Older meetings stay in the archive, recalled only on demand ("what did we discuss in March?").

## Flow C: "daily sweep" (unattended)

Runs once a day, no human in the loop. It turns the last day of meetings, mail and chats into
episodic logs + profile rollups + edges, so Flow B always has fresh memory to read.

0. **See the state before touching anything.** `python3 tools/lint.py` (the starting shape),
   `python3 tools/gaps.py today` (the unknowns this run should try to close), and
   `python3 tools/owed_backfill.py` (days with traffic in a source but no interaction file).
   Never give the catch-up check a hardcoded start date: a detector told to skip a region cannot
   see it, and in the graph this engine was built on that hid two months and ~17,000 messages
   behind a check that kept truthfully reporting "nothing owed". The backfill runs
   oldest-first, one day at a time, until `owed_backfill.py` reports nothing.
1. **Window.** Look at the last ~24h (since the previous run). Pull:
   - Meetings the owner attended, from the transcripts integration.
   - Real human email the owner exchanged, from the mail integration. Skip automated mail:
     newsletters, `no-reply@`, receipts, notifications, marketing. Only person-to-person.
   - Real WhatsApp conversations the owner exchanged, from the whatsapp integration. Names
     come from the owner's synced address book, so a saved contact maps straight to its slug.
     **Groups are in** (`sweep.whatsapp.include_groups`): attribute each message to its sender
     and feed it into that sender's node; a group itself never becomes a person node. Skip
     business / verified accounts, broadcasts, OTP and automated messages. A bare number with no
     saved name becomes a node only after it recurs (`sweep.whatsapp.unknown_number_min_days`).
2. **Per counterpart.** For each other human in a meeting / thread, resolve their slug
   (kebab-case of the name), **checking aliases first** (never fork, see Flow E step 6). One
   counterpart at a time; group a thread under its main person, and put everyone else who was
   there in `with:`.
3. **Log (episodic).** Append `data/interactions/<slug>/YYYY-MM-DD.md` from the template.
   Never overwrite. If a file for that person + date exists, append a new dated block or merge,
   do not duplicate. Separate work / personal / follow-ups as always. **Fill the personal side
   hard**: the human content (stories, family, mood, life events, the personal asides inside a
   "work" call) is the priority, not an afterthought. If a meeting or thread had any personal
   beat, it MUST land in the log.
4. **Rollup (semantic + working).** Create or sharpen `data/people/<slug>.md`: promote new
   stable facts into the profile, rewrite "Current state", tick resolved follow-ups.
5. **Wire the graph: create the connective entities, do not just log people.** Not optional:
   every sweep must actively extract and connect, per [`anatomy.md`](../../anatomy.md). For
   each interaction, scan for and create-on-recurrence the light entities, then wire every edge:
   - **cities** (where people live / you meet), **places** (restaurants, bars, clubs, gyms,
     coworkings), **passions** (sailing, chess, running...), **groups** (communities, crews,
     cohorts), **events** (trips, offsites, birthdays), **bonds** (the nature of the tie),
     **roles** (normalized job title, on recurrence).
   - **terms**: the type that stays empty if you do not push for it. A term is a recurring
     concept / project / theme / running joke that is not a person, place, passion or company:
     a method or framework ("north-star metric"), an ongoing matter ("the office move"), a
     positioning idea. Create one once it recurs (two or more mentions, or two or more people).
   - Dedup before create (aliases, never fork); cite provenance (`whatsapp:<phone>`,
     `fireflies:<id>`, `gmail:<thread>`, `manual:<owner>-<date>`).
   - **QUOTE every wiki-link you write in frontmatter: `person: "[[tessa-marlowe]]"`, and
     `- "[[slug]]"` for list items.** Unquoted, YAML reads `[[x]]` as nested arrays, so
     Obsidian registers no reference and the file becomes an orphan. In the graph this engine
     was built on, 687 of 705 interaction files were written unquoted and the gap was invisible
     for a month, because the tooling read both forms with a regex and Obsidian did not.
     `tools/lint.py` now fails on `unquoted-link`.
   - **Nothing you write is unattached.** Every file, including the `_followups/` digest,
     carries at least one wiki-link in or out. `tools/lint.py` fails on `orphan-file` and there
     are no exemptions.
   - **Write the FORWARD edge only, in code, via `tools/graph.py`.** Never hand-edit a
     frontmatter link list: appending an item at the wrong indent silently corrupts the node.
     A freehand "close the missing reverses" pass once did exactly that to three hub nodes, and
     Obsidian stopped reading their edges for four days before anyone noticed.
     `tools/lint.py --fix` writes every reverse edge for you.
     ```python
     import sys; sys.path.insert(0, "tools")
     from graph import load_nodes
     nodes = load_nodes()
     nodes["tessa-marlowe"].add_link("lives_in", "lisbon")
     nodes["tessa-marlowe"].write()   # re-reads itself and raises if it broke anything
     ```
   - `at:` is a **place** (a venue). The city goes in `city:`, a passion or a term in `about:`.
     Putting cities in `at:` is how `places/` stays empty for a month.
   If you use a system of record (e.g. Notion), the A-entities (people, companies) reconcile
   with it in the separate `notion-sync` skill, which runs right after this sweep.
6. **The work digest.** Write the day's work follow-ups to `data/_followups/<date>.md`: what
   the owner owes, then one `## [[slug]]` section per person with what they owe and the owner
   of each item. **Work only**: nothing from the personal side crosses into it (the wall; its
   data form is the `wall:` block in `config.local.yml`: personal bonds, excluded slugs,
   sensitive words). If past days were swept but have no digest,
   `python3 tools/rebuild_followups.py` regroups them from the interaction files already
   written, without re-reading the stream.
7. **Flow E, the graph pass (below). Not optional.** Logging is per-person and therefore only
   ever produces edges pointing at the owner. Flow E is the only step that asks the cross-person
   question.
8. **Close the run with the lint and the register.** `python3 tools/lint.py --fix`, then
   `python3 tools/lint.py`: the run is not done until it prints `mechanical findings: 0`. Then
   `python3 tools/gaps.py sync` to reconcile the gap register and record the day in its history.
9. **Node-creation policy** comes from config (`sweep.create_nodes`): `on-recurrence`
   (default, the discipline rule) or `always` (a node for everyone, even one-offs).
10. **Enrichment (optional, cheap).** On a *new* node, one lightweight external lookup
    (LinkedIn / personal site) to seed role + company. Never block on it.
11. **Fail soft, stay idempotent.** If a source is down, log what you got and move on; a re-run
    must be safe. `data/` is private: by default it is gitignored and never committed. If you
    keep it in a private repo of your own, the sweep commits its own work, one commit per run,
    saying what it *found* (`sweep: 3 new people, 2 introductions`), not that it ran.

The sweep is Flow A run in batch on a timer. Same rules, no chat.

## Flow E: "the graph pass" (every sweep, right after the rollups)

Flows A and C walk one person at a time, so they can only ever draw edges from that person to
the owner and to the light entities. Nothing in them ever asks *"do these two know each
other?"*. In the graph this engine was built on, after a month and ~600 interactions, 74% of
people had no edge to another human and the introduction graph had six edges in total. It
recorded well and connected badly. Flow E is the fix, and it is cheap.

For every interaction written in this run:

1. **Co-presence.** Read `with:`. Everyone in it was in the room with the anchor person. If a
   pair has now shared **two or more interactions** and there is **no path between them in the
   graph**, add `knows` both ways. If they already share a company, group or event, do
   **nothing**: the hub is the path, and a direct edge would be noise. (`tools/lint.py`
   computes both lists for you and separates them.)
2. **Introductions.** Scan for "intro from", "introduced by", "through X", "connected us",
   "you should meet", and the same phrases in the owner's other languages. Write
   `introduced_by` on the person, and let the lint write `introduced` back on the introducer.
   **This fact is stated once, in one message, and never repeated: capture it the day the
   person appears or it is lost for good.**
3. **Location.** If the exchange says where someone lives or is based, that is an edge, not
   prose: create the city node if needed and set `lives_in`. Free text in `based:` is a gap.
4. **Venues.** A named restaurant / bar / club / gym / coworking that has now come up twice
   becomes a `places/` node with `in_city`, and the interaction gets `at:`.
5. **Proper names.** Partner, children, parents, investors: the name, or an explicit
   `NAME UNKNOWN (gap to chase)` with everything that IS known, e.g.
   `partner: "NAME UNKNOWN (gap to chase) - architect, met at university"`. Never invent one.
   An empty field asks nothing; the lint greps for `NAME UNKNOWN` and keeps asking.
6. **Dedup.** If the day introduced a "Sam", a "Kit", a first name with no surname, check it is
   not an existing person under a nickname before creating a node. The fork always has the same
   shape: a first name saved as a nickname in one source becomes a second node that grows its
   own interactions and its own profile. `tools/checks.py` reports `possible-duplicate` (two
   nodes sharing a phone or a `notion_url` are one human); resolve with
   `python3 tools/merge.py <loser> <survivor> --why "..."` (try `--dry-run` first). When a
   placeholder slug (`kit-climbing`) finally gets its real name, rename it with
   `python3 tools/rename.py <old> <new> --name "Real Name" --why "..."`: it relinks everything,
   keeps the old spellings as aliases and carries the gap history across.
7. **Work the gap register.** `python3 tools/gaps.py today` is the chase list for this run:
   the unknowns the graph has been carrying, oldest and highest-priority first. Try them against
   today's stream and **record every outcome**: `gaps.py close <id> -e "evidence"` when you
   actually found it, `gaps.py attempt <id> -n "what you checked"` when you did not, `gaps.py
   drop <id> -n "why"` when it is not real. A failed attempt is worth recording: it stops the
   next run walking into the same dead end, and after three the gap is flagged STALLED, meaning
   ask the owner instead of guessing.
8. **Run the lint** (`--fix`, then verify `mechanical findings: 0`) and **`gaps.py sync`** to
   close the day in the register.

## Flow D: "manual capture" (owner-pushed, on demand)

The sweep only sees the integrations. The offline interaction and the owner's own thought never
pass through them, and they are the highest-signal input. So the owner can hand you one
directly, any time, and you capture it like everything else.

1. Take what the owner gives you: an **offline interaction** (a call, a coffee, no recording),
   or a **thought / feedback** (their read on a person or a situation).
2. Log it as a normal interaction: `data/interactions/<slug>/YYYY-MM-DD.md`, `setting: manual`,
   `source: manual:<owner>-<date>`. Same template, same work / personal / follow-ups split.
3. Anchor it to what it is about: a person (their node), or a company / place / passion / term
   via `about`. A pure thought about the owner hangs off the **owner file** `data/_me.md` (at
   the entrance of `data/`, not a node in `people/`), with dated episodes under
   `data/interactions/_me/`. The sweep never writes there; only manual self-capture does.
4. Roll up exactly like Flow A: promote stable facts, rewrite Current state, wire the graph
   (entities + forward edges, then the lint). From here it is indistinguishable from a swept
   entry.
5. **When the owner is talking to you directly, record quietly.** Capture in the same turn,
   without announcing it in every reply ("saved!", "recorded") unless they ask for that: a
   conversation should feel like talking to a person, not to a database. Ask first, once and
   plainly, before saving something intimate, or something genuinely strange (an identity you
   cannot resolve, a fact that contradicts the record).

This is Flow A triggered by the owner instead of a transcript. Not optional polish: the manual
layer is what makes the graph the owner's memory and not a pile of transcripts.

## Media (on demand)

A podcast / video / interview / article / book the owner *consumed* about one or more people is
a one-way, reusable source, not a two-way exchange. Give it a `data/media/<slug>.md` node from
[`templates/media.md`](templates/media.md) (`features` -> the people it covers; the lint writes
`featured_in` back), extract the durable facts up into each person's profile, and keep the raw
notes in the media node. Media nodes are made when the owner drops the artifact, not by the
unattended sweep.

## The "not a slave" principle

External sources are declared as optional in `config.local.yml`:

```yaml
sources:
  - name: work-graph
    path: ../your-work-repo
    read: [people, notes]       # READ ONLY
    scope: work-only            # nothing personal enters from here
```

Empty means it still works. Generic engine, declarative config. This is what makes the skill
adoptable by anyone and adaptable to any setup.

## Rules

- **Personal stories are the priority, always. This is rule zero.** The human layer (life
  stories, background, family, health, feelings, fears, ambitions, character, jokes, what someone
  is going through) is the most valuable thing to record, more than the work content. Mine EVERY
  meeting and EVERY message for it, capture the real words. **Be obsessed and specific: capture
  proper names** by first AND surname where you can: the partner / spouse (name + what they do +
  the state of the relationship + plans together), children (names, ages), parents and siblings,
  close friends and who introduced whom, and the investors / people who funded them or their
  company. Generic ("has a partner", "some investors") is a failed capture: names and specifics
  or it did not happen, and a known-but-unnamed partner or backer is a gap to chase. A work-only
  interaction is a failed capture. Never drop the personal detail to save space.
- **Quotes are facts, reads are guesses. Never promote a guess.** A throwaway remark by the
  owner about someone ("she's been working every single day") is recorded as the quote it is,
  with its context. The sweep does NOT turn it into a diagnosis of what the owner thinks or feels
  ("the owner believes she is overloaded"). An interpretation may be noted in the log, clearly
  marked as the sweep's read, but it never gets promoted into a profile's Current state, and it
  never drives brief guidance (a hook, a "what NOT to raise") unless the owner has said or
  confirmed it. When in doubt, ask instead of asserting: a fabricated "you think X is carrying
  too much" warning in a brief is exactly the kind of thing an owner rejects, and it costs trust
  in the whole graph.
- **Never invent a fact to close a gap.** No inferred surname, no guessed city, no assumed
  partner name. A wrong fact in memory is worse than a missing one: this graph is read before
  real conversations with real people. A gap closes on evidence, never on silence.
- Only 1:1s and the relationships around them, only what serves the relationship. This is not a
  company CRM.
- A person becomes a node only when they recur (you meet them too, or they appear in two or more
  interactions). Below that, they are a text line inside a profile.
- **Media is not an interaction** (see above).
- **The wall.** Never write personal data into an external work graph or into the `_followups`
  work digest. Personal stays in `data/`, private.
- The brief must work with an incomplete graph. Sources enrich, they never block.
