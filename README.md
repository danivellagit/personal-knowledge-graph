# personal-knowledge-graph

A personal knowledge graph you run with an AI agent: the people in your world and everything
that connects them, kept current from your own stream (WhatsApp, meetings, email) and browsable
as a graph.

The value is not storage. It is retrieval and connection: who you know in a city, who plays
padel, who introduced whom, where you take people, what was left open with someone before you
walk into the next meeting.

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
