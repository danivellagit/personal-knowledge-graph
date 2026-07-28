# personal-knowledge-graph

A personal knowledge graph you run with an AI agent: the people in your world and everything
that connects them, kept current from your own stream (WhatsApp, meetings, email) and browsable
as a graph.

The value is not storage. It is retrieval and connection: who you know in a city, who plays
padel, who introduced whom, where you take people, what was left open with someone before you
walk into the next meeting.

## Rule zero (the charter): the personal detail comes first

**This is the first thing anyone (human or agent) touching this repo must remember.** The whole
reason this graph exists is the human layer, and it must be captured **super-detailed, specific
and personal**, never generic:

- Not just that someone was mentioned, but **who they are**: where they are from, their life
  story, family, health, feelings, fears, ambitions, character, what they are going through.
- Not just what they said, but **the reasons behind their choices**, the **experiences they
  lived**, the **activities they do**, told concretely, **in their own words** (quote them).
  "She founded a company" is worthless; "she bootstrapped it for two years after her co-founder
  walked, because she refused to raise on someone else's terms" is the memory.
- **Be obsessed, and be specific: capture proper names.** Generic is a failed capture ("has a
  partner", "some investors", "from the south"). Always record, by first AND last name wherever
  you can: their **partner / spouse / girlfriend / boyfriend** (name, what they do, the state of
  the relationship, plans to move in / marry / have kids); their **children** (names, ages) and
  **parents / siblings**; their **close friends** and **who introduced whom**; the **investors
  and people who funded** them or their company; where they are **from** and **live now**. If you
  learn a partner or an investor exists but not the name, that is a **gap to chase**, not a fact
  to file.
- The human layer **beats the work content, every time**, even in a call that was "about work".
  **A work-only log is a failed capture.** Never compress the personal, specific detail away to
  be tidy or save space: that detail IS the memory, and it is exactly what a summary throws out.
  When in doubt, keep more. This is an obsession, not a checklist you tick once.

The rest of this repo (the graph mechanics) serves this rule; it does not replace it.


This repo is the **engine, empty**. Clone it, point it at your own sources, and your agent fills
`data/` (which stays private, on your machine). It is built to be self-explaining: open it with
Claude Code (or any agent that reads `AGENTS.md`) and it already knows how to operate.

## What you get

- A typed, bidirectional **graph** of people and the entities that connect them (places,
  passions, cities, groups, bonds, roles, events, terms). Full map in [`anatomy.md`](anatomy.md).
- Two **skills** the agent runs:
  - [`remember-people`](skills/remember-people/SKILL.md): logs every 1:1, keeps a sharpening
    profile per person, wires the connective entities from your stream, and produces a
    pre-meeting brief.
  - [`notion-sync`](skills/notion-sync/SKILL.md) (optional): reconciles People / Companies with
    your Notion, if you use it.
- Works great with **Obsidian**: point a vault at this folder and the graph view runs on top of it.

## Get started

1. **Clone and configure.**
   ```bash
   git clone <your fork of this repo>
   cd personal-knowledge-graph
   cp config.example.yml config.local.yml   # then edit: owner + the sources you have
   ```
   Every source is optional. With none, you still log 1:1s and build the graph by hand.

2. **Connect WhatsApp** (the richest source). Follow [`SETUP-WHATSAPP.md`](SETUP-WHATSAPP.md).
   Calendar, transcripts, and mail are wired the same way in `config.local.yml`.

3. **Open it with your agent and just talk to it.** Try:
   - "prepare the brief for Mario before our call"
   - "log my 1:1 with Giulia"
   - "run the daily sweep"

   The agent reads [`AGENTS.md`](AGENTS.md) / [`CLAUDE.md`](CLAUDE.md), loads the anatomy and the
   skills, and knows what to do.

## Privacy, in one line

`data/` is gitignored and never leaves your machine. Keep this repo (or your fork) private if
you ever commit anything under `data/`. Nothing personal crosses into a work repo. That wall is
the point. See [`data/README.md`](data/README.md).

## Credits

The WhatsApp bridge is the open-source [whatsapp-mcp](https://github.com/lharries/whatsapp-mcp)
by lharries (referenced, not bundled). Everything else here is MIT, see [`LICENSE`](LICENSE).
