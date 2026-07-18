---
name: remember-people
description: A chief-of-staff for one-to-one meetings. Before a 1:1 it prepares a brief on the person (work + personal), keeps an append-only log of every meeting, and suggests when to see them next. The staff that remembered everything.
---

# remember-people

## What it does, in one line

It puts the right person back in front of you five minutes before you walk in: who they are,
when you last met, what was left open, two or three personal hooks to open with, what NOT to
raise, and how often you should be in touch.

The value is not storage. It is retrieval at the right moment.

## The type system (a linked graph)

The person and the interaction are the two anchors, but they live inside a wider graph of
connective entities discovered from the stream. **The full node map, the edge table (every
forward + reverse pair), and the rules live in [`anatomy.md`](../../anatomy.md).** Read it
before writing nodes. Short version:

| Thing | A type? | Where it lives |
| --- | --- | --- |
| **person** | yes, a node with a file | `data/people/<slug>.md` |
| **interaction** | yes, a node with a file | `data/interactions/<slug>/YYYY-MM-DD.md` (recent) or `YYYY-MM.md` (old rollup) |
| **company** | yes (anchor, optionally mirrored) | `data/companies/<slug>.md` |
| **place / passion / city / term / group / event** | yes, born in repo on recurrence | `data/<type>/<slug>.md` |
| relation (any node to any node) | no, an **edge** | forward + reverse wiki-link pair in frontmatter |
| meeting transcript / chat / mail | no, a **source** | referenced by id, never stored whole |
| brief | no, an **ephemeral view** | generated on demand, never saved |

The brief (Flow B) looks at the human first; the graph lets it ramify (who they know, where you
meet them, what you share) instead of reading isolated files. Keep the discipline:
**node-on-recurrence** (a light entity becomes a file only when it recurs, two or more),
**dedup before create** (aliases, never fork), and **every edge written as a forward + reverse
pair**. See [`anatomy.md`](../../anatomy.md).

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
3. Append a new file to `data/interactions/<slug>/YYYY-MM-DD.md`. Never overwrite.
4. **Rollup** in the same write: promote any new stable fact into the profile (semantic),
   rewrite the "Current state" section (working), close resolved follow-ups.

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

Older meetings stay in the archive, recalled only on demand ("what did we discuss in March?").

## Flow C: "daily sweep" (unattended)

Runs once a day, no human in the loop. It turns the last day of meetings and mail into
episodic logs + profile rollups, so Flow B always has fresh memory to read.

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
   (kebab-case of the name). One counterpart at a time; group a thread under its main person.
3. **Log (episodic).** Append `data/interactions/<slug>/YYYY-MM-DD.md` from the template.
   Never overwrite. If a file for that person + date exists, append a new dated block or merge,
   do not duplicate. Separate work / personal / follow-ups as always.
4. **Rollup (semantic + working).** Create or sharpen `data/people/<slug>.md`: promote new
   stable facts into the profile, rewrite "Current state", tick resolved follow-ups.
5. **Wire the graph: create the connective entities, do not just log people.** This is not
   optional: every sweep must actively extract and connect, per [`anatomy.md`](../../anatomy.md).
   For each interaction, scan for and create-on-recurrence the light entities, then wire every
   edge as a forward + reverse pair:
   - **cities** (where people live / you meet), **places** (restaurants, bars, clubs, gyms),
     **passions** (padel, wine, running), **groups** (communities, crews), **events** (trips,
     offsites, birthdays), **bonds** (the nature of the tie), **roles** (normalized job title,
     on recurrence).
   - **terms**: the type that stays empty if you do not push for it. A term is a recurring
     concept / project / theme / running-joke that is not a person, place, passion or company:
     a method or framework, an ongoing matter, a positioning idea. Create one once it recurs
     (two or more mentions, or two or more people).
   - Dedup before create (aliases, never fork); cite provenance; run the bidirectional-link
     lint before the sweep is done (every forward edge has its reverse).
   If you use a system of record (e.g. Notion), the A-entities (people, companies) reconcile
   with it in the separate `notion-sync` skill, which runs right after this sweep.
6. **Node-creation policy** comes from config (`sweep.create_nodes`): `on-recurrence`
   (default, the discipline rule) or `always` (a node for everyone, even one-offs).
7. **Enrichment (optional, cheap).** On a *new* node, one lightweight external lookup
   (LinkedIn / personal site) to seed role + company. Never block on it.
8. Data is gitignored: write files, do not commit. Fail soft: if a source is down, log what
   you got and move on. Idempotent by design, safe to re-run.

The sweep is Flow A run in batch on a timer. Same rules, no chat.

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

- Only 1:1s, only what serves the relationship. This is not a company CRM.
- A person becomes a node only when they recur (you meet them too, or they appear in two or more
  interactions). Below that, they are a text line inside a profile.
- Never write personal data into an external work graph. Personal stays in `data/`, private.
- The brief must work with an incomplete graph. Sources enrich, they never block.
- v1 is minimal: one file per person + append-only log + the two flows. Nothing more.
