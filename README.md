# personal-knowledge-graph

A personal knowledge graph you run with an AI agent: the people in your world and everything
that connects them, kept current from your own stream (WhatsApp, meetings, email) and browsable
as a graph.

The value is not storage. It is retrieval and connection: who you know in a city, who climbs,
who introduced whom, where you take people, what was left open with someone before you walk
into the next meeting.

## Rule zero (the charter): the personal detail comes first

**This is the first thing anyone (human or agent) touching this repo must remember.** The whole
reason this graph exists is the human layer, and it must be captured **super-detailed, specific
and personal**, never generic:

- Not just that someone was mentioned, but **who they are**: where they are from, their life
  story, family, health, feelings, fears, ambitions, character, what they are going through.
- Not just what they said, but **the reasons behind their choices**, the **experiences they
  lived**, the **activities they did and do**, told concretely, **in their own words** (quote
  them). "She founded a company" is worthless; "she bootstrapped it for two years after her
  co-founder walked, because she refused to raise on someone else's terms" is the memory.
- The human layer **beats the work content, every time**. Every meeting and every message gets
  mined for it, even a call that was "about work".
- **A work-only log is a failed capture.** If an exchange had a personal beat and the record
  does not show it, the point was missed. **Never compress the personal, specific detail away
  to be tidy or to save space: that detail IS the memory**, and it is exactly what a summary
  throws out. When in doubt, keep more.

**Be obsessed, and be specific: capture proper names.** Generic is a failed capture ("has a
partner", "some investors", "from the south"). Always record, by first AND last name wherever
you can get it:

- their **partner / spouse / girlfriend / boyfriend**: the name, what they do, the state of the
  relationship, plans to move in / marry / have kids;
- their **children** (names, ages) and their **parents and siblings** (names);
- their **close friends**, and **who introduced whom**;
- the **investors and the people who funded them** or their company, and who backs whom;
- where they are **from**, where they **live now**, and their history of cities and moves;
- health, money, feelings, fears, ambitions, hobbies.

Names and specifics, or it did not happen. If you learn a partner or an investor exists but not
the name, that is a **gap to chase**, not a fact to file, and the repo tracks it until it closes
(the gap register, below). This is an obsession, not a checklist you tick once.

The rest of this repo (the graph mechanics) serves this rule; it does not replace it.

---

This repo is the **engine, empty**. Clone it, point it at your own sources, and your agent fills
`data/` (which stays private, on your machine). It is built to be self-explaining: open it with
Claude Code (or any agent that reads `AGENTS.md`) and it already knows how to operate.

**Nothing external is required.** No Notion, no calendar, no wearable, not even WhatsApp: with an
empty `config.local.yml` the graph, the tools, the skills and the agents all work from what you
tell them, and `data/` is the home of every fact. Each source or system you wire in only enriches
it, and each optional tool says "not configured" instead of failing.

## What you get

**The core** (everything else is optional):

- A typed, bidirectional **graph** of people and the entities that connect them (places,
  passions, cities, groups, bonds, roles, events, terms, media). The memory model is in
  [`anatomy.md`](anatomy.md); the exact field-and-edge contract is in [`LEGEND.md`](LEGEND.md).
- **Tooling that keeps the graph honest**, in `tools/`. The lesson that produced it: agents
  record well and connect badly, and a freehand repair of frontmatter corrupts it silently. So
  the shape is enforced by code, not by good intentions:
  - `graph.py`, the only sanctioned frontmatter reader/writer (line surgery, re-verifies itself);
  - `lint.py` (with `checks.py`): mechanical fixes (`--fix` writes every reverse edge, dedups,
    normalises) and the list of gaps to chase. A run is not finished until it prints
    `mechanical: 0`;
  - `gaps.py`, **the gap register**: what the memory knows it does not know, tracked over time
    with first-seen, attempts and the evidence that closed it;
  - `merge.py` and `rename.py`: never fork a person, and let a placeholder slug follow the real
    name once it arrives;
  - `owed_backfill.py`: measures which days of your stream still have no log, instead of
    trusting a hardcoded start date;
  - `rebuild_followups.py`: rebuilds missing work follow-up digests from logs already in the
    graph, applying the wall.
- **Skills** the agent runs:
  - [`remember-people`](skills/remember-people/SKILL.md): logs every exchange, keeps a sharpening
    profile per person, wires the connective entities from your stream, runs the cross-person
    **graph pass**, and produces a pre-meeting brief.
  - [`graph-audit`](skills/graph-audit/SKILL.md): the weekly look from above. The daily sweep
    walks one person at a time and is blind to what is missing *across* people (who keeps sharing
    rooms without being connected, which node type stayed empty, which gap has been open for
    three weeks); this measures the graph as a graph and reports honestly.
  - [`notion-sync`](skills/notion-sync/SKILL.md) (optional): reconciles People / Companies with
    your Notion, if you use it.
- Works great with **Obsidian**: point a vault at this folder and the graph view runs on top of it.

**Optional modules**, opt-in, each documented in [`anatomy.md`](anatomy.md):

- **Agents** (`agents/<role>/AGENT.md`, launched by `skills/<role>/SKILL.md`): twelve ready-made
  roles with a memory that work on top of the graph and talk to you: `fitness-coach`,
  `psychologist`, `founder-assistant`, `linkedin-coach`, `web-builder`, `brand-designer`,
  `accountant`, `health-advisor`, `best-friend`, `tech-maintainer`, `english-teacher`, `recruiter`.
  Each one ships with its lane and handoffs, what it must remember and where (a memory skeleton in
  `agents/<role>/memory-skeleton/`), and the routines it typically runs (`agents/<role>/routines/`).
  The names are not shipped: they are generated when you create the agent,
  `python3 tools/agents/create_agent.py <role>` (or `--name "..."`; details in
  [`agents/README.md`](agents/README.md), "Creating an agent").
- **The body layer**: a wearable's data (sleep, heart, sessions) turned into one node per day,
  joined on time to who you saw and where, plus a food log, a training log and lab reports
  (`tools/body.py`, `tools/body-pull.sh`, `tools/food.py`, `tools/calories.py`).
- **The location layer**: your phone's GPS (via the Overland app and a small receiver you host)
  plus a Google Maps Timeline export, kept off-repo, so a meeting can get a place without anyone
  saying it (`tools/location.py`, `tools/location-pull.sh`).
- **The Life App**: the whole life on one screen. One number, *Life Health*, over seven areas
  (body, health, work, money, relationships, growth, daily life), each fed by the agent that owns
  it through one JSON file in `data/happiness/`. Encrypted whole and published as a ciphertext-only
  site on GitHub Pages; your health numbers live in its Corpo/Salute tabs. It ships with fake sample data, so it
  builds on a fresh clone: `bash tools/life-app/setup.sh` (details in
  [`tools/life-app/README.md`](tools/life-app/README.md)).

## Get started

1. **Clone and configure.**
   ```bash
   git clone <your fork of this repo>
   cd personal-knowledge-graph
   cp config.example.yml config.local.yml   # then edit: owner, owner_slug, the sources you have
   ```
   Every source is optional. With none, you still log exchanges by hand and build the graph.

2. **Connect WhatsApp** (the richest source). Follow [`SETUP-WHATSAPP.md`](SETUP-WHATSAPP.md).
   Calendar, transcripts, and mail are wired the same way in `config.local.yml`.

3. **Open it with your agent and just talk to it.** Try:
   - "prepare the brief for Wren before our call"
   - "log my coffee with Oskar"
   - "run the daily sweep"
   - "lint the graph and show me the oldest open gaps"

   The agent reads [`AGENTS.md`](AGENTS.md) / [`CLAUDE.md`](CLAUDE.md), loads the contract, the
   anatomy and the skills, and knows what to do.

4. **Optional: the Life App on your phone.**
   ```bash
   bash tools/life-app/setup.sh --dry-run        # see what it would do
   bash tools/life-app/setup.sh                  # name, password, sample data, first build
   bash tools/life-app/setup.sh --create-site    # + your own public Pages repo (needs gh auth login)
   ```
   The password stays in `~/.secrets/`, your data in `data/happiness/` (gitignored); only ciphertext
   is ever pushed, and only to the separate site repo.

5. **Optional:** enable the git-sync hook (`.claude/hooks/git-sync.sh`, see `CLAUDE.md`) if you
   keep a private remote, and switch on the modules you want in `config.local.yml`.

## Layout

```
personal-knowledge-graph/
  README.md
  CLAUDE.md / AGENTS.md          # how an agent must work in here (read first; identical files)
  LEGEND.md                      # the field-and-edge contract the tooling enforces
  anatomy.md                     # the memory model, node map, rules, optional modules
  config.example.yml             # copy to config.local.yml (gitignored)
  SETUP-WHATSAPP.md
  tools/
    graph.py                     # the only sanctioned frontmatter reader/writer
    checks.py                    # every check, as data, with stable gap ids
    lint.py                      # mechanical fixes (--fix) + gaps to chase (--gaps)
    gaps.py                      # the gap register: sync / today / attempt / close / drop / trend
    merge.py                     # merge two nodes that are the same human
    rename.py                    # a placeholder slug gets its real name, links intact
    owed_backfill.py             # which days of the stream still have no log
    rebuild_followups.py         # rebuild missing work digests, behind the wall
    body.py  body-pull.sh        # optional: the body layer
    food.py  calories.py         # optional: food log, daily calorie estimate
    location.py  location-pull.sh  # optional: the location layer
    sleep_fields.py              # optional: per-night sleep fields from the wearable CLI
    life-app/                    # optional: the Life App (setup.sh, publish.sh, sample-data/, README)
    happiness.py                 # validate / init / inject / recap data/happiness/*.json for the Life App
    template_sync.py             # maintainers: bring app updates from an upstream instance, leak-checked
    agents/create_agent.py       # optional: create an agent from its role (persona name, memory skeleton)
  skills/
    remember-people/             # the core engine
    graph-audit/                 # the weekly look from above
    notion-sync/                 # optional
    <role>/                      # optional: thin launchers for the agents
  agents/                        # optional: agents/<role>/AGENT.md, memory-skeleton/, routines/
  .claude/hooks/git-sync.sh      # optional: pull on session start, autosave + push on stop
  data/                          # PRIVATE, gitignored by default: your graph + your stream
    _me.md                              # the owner node (the point of view)
    people/  companies/  places/  passions/  cities/  terms/  groups/  events/
    bonds/   roles/   media/
    interactions/<slug>/YYYY-MM-DD.md   # recent, daily
    interactions/<slug>/YYYY-MM.md      # older months, rolled up
    _gaps/                              # the gap register
    _followups/                         # the work digest (no personal content, ever)
    body/  food/  training/  agents/    # only if you enable those modules
    happiness/                          # the Life App's data: one JSON per agent (from sample-data/)
```

## Rules that keep it alive

Node-on-recurrence (a light entity becomes a file only when it recurs), dedup before create
(aliases, never fork the same human), provenance on every fact (`whatsapp:` / `fireflies:` /
`gmail:` / `manual:`), quotes are facts and reads are guesses, the graph pass after every sweep,
and full detail with no self-censoring inside `data/`. See [`anatomy.md`](anatomy.md).

Two of them are enforced by code rather than by good intentions, because good intentions failed
in the instance this template was extracted from: **never hand-edit a frontmatter link list** (a
freehand repair once corrupted three hub nodes and nobody noticed for days), and **a run is not
finished until `python3 tools/lint.py` prints `mechanical: 0`**. The contract the tooling
enforces is [`LEGEND.md`](LEGEND.md); the working rules for agents are [`CLAUDE.md`](CLAUDE.md).

## Privacy, in one line

`data/` is gitignored by default and never leaves your machine. If you keep your copy in a
**private** repo you may choose to commit `data/` as a backup (see the comment in `.gitignore`);
never do that in a public fork. Nothing personal crosses into a work repo or the work digest.
That wall is the point. See [`data/README.md`](data/README.md).

## Credits

The WhatsApp bridge is the open-source [whatsapp-mcp](https://github.com/lharries/whatsapp-mcp)
by lharries (referenced, not bundled). The location layer reads batches from the open-source
[Overland](https://github.com/aaronpk/Overland-iOS) iOS app (referenced, not bundled).
Everything else here is MIT, see [`LICENSE`](LICENSE).
