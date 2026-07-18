# Agent context: personal-knowledge-graph

Boot sequence for any AI agent (Claude Code, Cursor, Codex) operating in this repo. Run this
before responding to the user's request. This file is mirrored at [`AGENTS.md`](AGENTS.md); keep
both in sync (edit one, copy to the other).

This repo is a **personal knowledge graph**: the people in the owner's world and everything that
connects them, kept current from their own stream (WhatsApp, meetings, email) and browsable as a
graph. The value is retrieval and connection, not storage.

---

## 1. Who am I working for?

Read `owner` from [`config.local.yml`](config.example.yml) (the user copies `config.example.yml`
to `config.local.yml`). That is whose graph this is. If `config.local.yml` does not exist yet,
tell the user to `cp config.example.yml config.local.yml` and edit it, then proceed with what
you can.

## 2. Load the model, in this order

1. [`anatomy.md`](anatomy.md): the graph shape. Node types, the edge table (every forward +
   reverse pair), and the rules that keep it from rotting. **Read this before writing any node.**
2. The skill being invoked:
   - [`skills/remember-people/SKILL.md`](skills/remember-people/SKILL.md): log 1:1s, keep a
     sharpening profile per person, wire the connective entities from the stream, produce the
     pre-meeting brief. This is the core engine.
   - [`skills/notion-sync/SKILL.md`](skills/notion-sync/SKILL.md): optional, reconcile People /
     Companies with Notion if the owner uses it.
3. [`config.local.yml`](config.example.yml): which sources and integrations are actually wired.
   Empty is fine; every skill still works, sources only enrich.

## 3. How the graph works, in short

- **Two anchors** (`person`, `company`) plus **light entities** born from the stream on
  recurrence (`place`, `passion`, `city`, `term`, `group`, `bond`, `role`, `event`) and the
  raw episodic `interaction`. Full table in [`anatomy.md`](anatomy.md).
- **Every relation is a `[[slug]]` wiki-link, written as a forward + reverse pair in the same
  edit.** Under-linking is the default failure; bias toward the link.
- **Three memory layers:** episodic (`data/interactions/<slug>/*.md`, append-only), semantic
  (`data/people/<slug>.md`, sharpens over time), working (the "Current state" block on top).

## 4. Hard rules

- **`data/` is private and gitignored. Never commit it, never let it leak.** It holds real
  people, health, money, family. Nothing personal ever crosses into a work repo or any shared
  surface. That wall is the whole point.
- **Node-on-recurrence.** A light entity becomes a file only when it recurs (2+ mentions or 2+
  days). Below that it stays plain text inside the interaction. Stops the swamp.
- **Dedup before create.** Resolve against `aliases:` first; the same entity under different
  spellings or ids must land on ONE node. Never fork.
- **Provenance on every fact.** Cite the source inline: `whatsapp:<phone>`, `fireflies:<id>`,
  `gmail:<thread>`. A fact seen once is not a stable fact.
- **Bidirectional-link lint before a sweep is done.** Every forward edge has its reverse; fix
  dangling edges.
- **Frontmatter edges are lists of scalars, never lists of maps** (a normalizer flattens maps).
- **Full detail inside `data/`, discreet outside.** Record everything privately; the only
  boundary is the wall to the outside world.
- **Fail soft.** If a source is down, log what you got and move on. The skills are idempotent
  and safe to re-run.

## 5. Sources

Wire them in `config.local.yml`; each is optional.

- **WhatsApp** (the richest): the local [whatsapp-mcp](https://github.com/lharries/whatsapp-mcp)
  bridge. Setup in [`SETUP-WHATSAPP.md`](SETUP-WHATSAPP.md).
- **Calendar / transcripts / mail:** for cadence, auto-logging meetings, and person-to-person
  mail. Skip automated mail (newsletters, `no-reply@`, receipts, notifications).

## 6. Tone and discipline

- Do the task; do not add abstractions the graph does not need. v1 is minimal on purpose.
- The brief looks at the human first, then ramifies through the graph. It must work with an
  incomplete graph; sources enrich, they never block.
- Do not claim a sweep is done before the bidirectional-link lint passes.
