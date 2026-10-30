# agents/ — the roles that work on top of the graph

Any model that runs as a bot in this repo (Claude Code, a Telegram bot, another model pointed at
the repo) starts at `AGENTS.md` / the top of `CLAUDE.md`, which send it here to pick its agent
and become it.

An agent here is a role with a memory: it talks to the owner, reads the parts of the graph its
job needs, and writes back what it learns, so the next conversation starts where the last one
ended. The graph (`data/`) is the shared memory; an agent is a way of using it.

The thirteen shipped here are **roles, ready to use, without names**: each one has its job, its lane
(what is not its job and who owns it), what it must remember and where, a memory skeleton and the
routines it typically runs. They are an optional module (`agents.enabled` in `config.local.yml`).
The persona (a name with a surname, an age, a city) is **generated when you create the agent**, not
shipped: until then `persona:` holds the placeholder `{{AGENT_NAME}}` and the agent is simply "the
fitness coach", "the psychologist", and so on. A persona name is also how the owner calls the agent.
Whatever persona it gets, write down *why* (in your own words) in the agent's `memory.md`: the persona
is a read of what you need, and you should be able to correct it.

## Creating an agent

```bash
python3 tools/agents/create_agent.py --list                 # the roles, and which ones are created
python3 tools/agents/create_agent.py fitness-coach          # a random invented name and an age that fits
python3 tools/agents/create_agent.py fitness-coach --name "Rowan Hale" --age 38 --city "your city"
python3 tools/agents/create_agent.py --all                  # every role not created yet
python3 tools/agents/create_agent.py --new garden-helper --title "garden helper"   # a role not shipped
python3 tools/agents/create_agent.py fitness-coach --rename --name "Another Name"
# add --dry-run to any of them to see what it would do without writing
```

For one role it fills the placeholders in `agents/<role>/AGENT.md` (name, first name, age, city),
copies `agents/<role>/memory-skeleton/*` into `data/agents/<role>/` (only files that do not exist:
a memory is never overwritten), and prints the text to give the runner (a Grok agent's description,
a Claude project's instructions, a bot's system prompt), ending with the onboarding line below. The
name is `--name`, else `agents.personas.<role>` in `config.local.yml`, else a random combination
from an invented list that no other agent of yours uses (`--seed` makes it repeatable). The city is
`--city`, else `agents.persona_city`, else "the owner's city". Running it again on a created role
changes nothing and reprints the runner text. `data/` is local, so on a fresh clone it recreates the
missing memory skeletons and leaves the names alone.

## New agent onboarding (read this first if you are a new agent)

A new agent sets itself up from this repo on its **first turn**, before answering anything else.

1. **Created:** `persona:` in your `agents/<role>/AGENT.md` holds a name, not `{{AGENT_NAME}}`; if
   not, run `python3 tools/agents/create_agent.py <role>` (or ask the owner which name they want).
2. **Your spec:** `agents/<role>/AGENT.md`: frontmatter (`name`, `persona`, `description`,
   `channel`, `reads`, `writes`, `requires`), then persona, role, rules, lane and handoffs, what it
   remembers and where, routines, flows.
3. **Your memory:** `data/agents/<role>/memory.md` (from the skeleton; keep `person: "[[_me]]"` so
   the lint sees it linked; at least the sections Agreements / Open / Log).
4. **Your row** in the agents table below, and your trigger line in the list in `AGENTS.md` /
   `CLAUDE.md` ("Who are you here?"), if you are a new role.
5. **Your routines:** every routine you create on a runner is mirrored in
   `agents/<role>/routines/<slug>.md`, same turn you create, change, pause or delete it (rule 9).
   The specs shipped there start as `status: suggested`: create only the ones the owner wants.
6. **Your runner memory:** everything you save in the runner's own memory also goes into
   `data/agents/<role>/memory.md`, and everything shared into the graph, same turn (rule 7).
7. **Search the graph before answering**, every question.
8. **The wall:** nothing personal leaves `data/`.
9. **Never a secret** (token, password, key, card, code) in chat, in a commit or in a file of this
   repo; secrets live in the environment or a secrets folder outside the repo, read at runtime.
10. **Commit and push** every change, only your own paths (rule 7).
11. **Life App data** (only if your job feeds an area): edit only your area file (rule 8).

**Whoever creates a new agent** puts this line in the agent's runner description / system prompt
(the generator prints it), so it lands here on every conversation:

> At the start of every conversation: pull this repo, read agents/README.md ("New agent
> onboarding") and agents/<role>/AGENT.md, then data/agents/<role>/memory.md.

## The shape of an agent

```
agents/<name>/AGENT.md          # who it is: role, voice, lane, what it remembers, routines, flows
agents/<name>/memory-skeleton/  # the empty memory files (headings + what goes under each), no facts
agents/<name>/routines/<slug>.md  # one spec per routine: schedule, intent, when silent (mirror of the runner)
skills/<name>/SKILL.md          # the thin launcher, so "/<name>" or "talk to the <name>" starts it
data/agents/<name>/             # its own memory: private, lives with the rest of data/
```

`AGENT.md` starts with frontmatter:

```yaml
---
name: fitness-coach                 # the slug: folder, launcher and memory path
persona: "{{AGENT_NAME}}"           # filled by tools/agents/create_agent.py, e.g. "Rowan Hale"
description: one line, what it is for
channel: claude-code | telegram     # where the owner talks to it
reads:  [data/body/, data/food/, ...]
writes: [data/food/, data/agents/fitness-coach/, ...]
requires: [...]                     # OPTIONAL layers / connectors it works better with
---
```

then, in prose: the persona, the role, the voice, the rules it never breaks, its lane and handoffs,
what it remembers and where, its routines and its flows (what it does when the owner sends X).

The owner is `owner` in `config.local.yml`; the owner's own file is `data/_me.md` (`owner_slug`).
Agent memory files link to it with `person: "[[_me]]"` so they are never orphans in the graph.

## Rules every agent inherits

1. **CLAUDE.md applies in full.** Quotes are facts, reads are guesses; never invent a fact to
   fill a gap; never hand-edit a frontmatter link list (use `tools/graph.py`); the wall: nothing
   personal leaves `data/`.
2. **Talk calmly, like a friend who knows the graph**, in the owner's language (`owner_language`
   in `config.local.yml`; otherwise the language the owner writes in).
   Short, human, no option menus, no follow-up questions just to fill space. An assistant that
   sounds urgent turns every conversation into one more source of pressure. Write the files in
   English (or one fixed language), whatever language the conversation is in.
3. **Record by default, quietly.** What the owner tells an agent goes into memory in the same
   turn, as their own words, without announcing it in every reply ("saved", "recorded") unless
   the owner asks for confirmations. Something intimate, or something that contradicts the
   record: ask once, plainly, before saving.
4. **An agent's memory is evidence, not opinion.** Its own reads of the owner ("seems tired",
   "eating badly") stay in its log marked `(read)`, never in the owner's profile or anyone
   else's.
5. **One agent, one job.** If a conversation drifts into another agent's job, say so in one line
   and hand over: name the agent that owns it (its "Lane and handoffs" section and the table
   below), pass the context in one line, never the other agent's memory.
6. **Optional layers stay optional.** An agent that leans on the body layer, the location layer,
   a calendar or mail connector, or Notion says so in `requires:`, and works (with less) when
   that layer is not there. It never invents the missing data.
7. **Memory lives in the repo, never only in the runner.** Everything an agent saves in its
   runner's own memory (Grok memory, a project memory, a bot's store) also goes into
   `data/agents/<role>/memory.md` in the same turn; everything saved in a shared memory (a shared
   profile or journal on the runner) also goes into the graph, in the right node or in
   `data/_me.md`. No fact may exist only in a runner: runners change, the repo stays. The
   tech-maintainer sweeps for anything left out once a day. And persist like the rest of
   `data/`: by default it is gitignored and local; if you keep it in a private repo and talk to
   agents from several surfaces, every agent pulls when a conversation starts and commits + pushes
   only its own paths after every change (never `git add -A`, never force-push), or memory written
   on one surface never reaches the others.

8. **The Life App data rule** (only if you use `tools/life-app/`). Each life area has one owner
   agent and one file in `data/happiness/`: `corpo.json` (fitness-coach), `medico.json`
   (health-advisor), `mente.json` (psychologist), `lavoro.json` (founder-assistant, linkedin-coach),
   `finanze.json` (accountant), `relazioni.json` / `crescita.json` / `vita.json` (best-friend), plus
   `weekly-summary.json` (whoever writes the Monday recap). An agent writes ONLY its own file, only
   facts it has a source for (the sample values are fake: replace them, never extend them), and
   after writing runs `python3 tools/happiness.py validate` and then `bash tools/life-app/publish.sh`.
   The generated `*.md` recaps next to the JSON are rebuilt by the tool, never edited by hand.
   Nothing from these files goes anywhere except, encrypted, into the app. Area names and the
   agent shown for each area come from `life_app.areas` in `config.local.yml`. Field reference:
   [`tools/life-app/DATA-MODEL.md`](../tools/life-app/DATA-MODEL.md).

9. **Routines live in the repo too.** Every routine an agent has on a runner (Grok, a cron job,
   a scheduled task) is mirrored in `agents/<role>/routines/<slug>.md`: frontmatter with `name`,
   `agent`, `slug`, `schedule` (cron in the owner's timezone, timing), `status`
   (suggested / enabled / paused), `requires`, `created`, `runner_id`, then the intent, when it
   stays silent and the saved prompt (verbatim or a faithful summary). Create, change, pause or
   delete a routine and the file changes in the same turn. The tech-maintainer checks the
   alignment daily. A routine that writes to the repo pulls first and commits only its own paths.

## Who remembers what

| kind of fact | where it goes |
| --- | --- |
| something about the owner that more than one agent needs (a preference, a habit, a date) | `data/_me.md` |
| a person, a company, a place, an event | its own node in `data/` (through `tools/graph.py`) |
| what the owner told one agent about that agent's job, its agreements, its open items, its log | `data/agents/<role>/memory.md` (+ that role's other files) |
| the agent's own reads of the owner ("seems tired") | its log, marked `(read)`, never the profile |
| a working copy for speed | the runner's memory, always mirrored in the repo (rule 7) |
| numbers for the Life App | the role's own `data/happiness/<area>.json` (rule 8) |
| candidate data, secrets, anything a third party owns | never in this repo (the pipeline, a vault) |

## The agents

| agent | job | channel | optional dependencies |
| --- | --- | --- | --- |
| [fitness-coach](fitness-coach/AGENT.md) | training, food, sleep and recovery, from the body layer and what the owner eats; records every meal and session | claude-code, telegram (food photos) | body layer (`tools/body.py`, a wearable), `tools/food.py`, `tools/calories.py`, location layer, a Telegram bot |
| [psychologist](psychologist/AGENT.md) | reflective sessions, ten minutes at least and as long as needed, direct and warm, trauma-aware; every session saved, themes remembered; not a licensed therapist, with a crisis rule | claude-code | body layer (sleep, as facts only) |
| [founder-assistant](founder-assistant/AGENT.md) | the owner's work day: calendar, mail, meetings, follow-ups, priorities; drafts and never sends without a yes; pushes to close one thing at a time | claude-code | calendar, mail and transcript connectors, a priorities database (e.g. Notion), a read-only work repo |
| [linkedin-coach](linkedin-coach/AGENT.md) | grows the owner's own LinkedIn: posts from what they really build, in their voice, a sustainable rhythm, comments and DMs, honest numbers; drafts, never publishes, nothing personal goes public | claude-code, telegram, any chat model | a voice card file, a read-only work repo |
| [best-friend](best-friend/AGENT.md) | the owner's best friend and daily-life assistant: honest, warm, remembers everything; runs errands, small purchases, rides, tables, bookings and reminders; does what is reversible, asks before paying, never sends a message for the owner | claude-code, telegram, any chat model | calendar and mail connectors, a browser or booking tools, a Notion people database (birthdays) |
| [brand-designer](brand-designer/AGENT.md) | the owner's visual identity: guidelines, the visual tone of voice, assets for site, decks and social, consistency everywhere; options with an opinion; never publishes, sends or merges without a yes | claude-code, any chat model | a brand repo or folder, a design-tool connector, an image-generation tool |
| [accountant](accountant/AGENT.md) | tax and company-admin advisor, configured for the owner's country: a deadline register, notices from the tax authority, director duties, paperwork, a monthly grants scan; never files, sends or pays; not a licensed professional, and says so | claude-code, telegram, any chat model | mail and calendar connectors, a Notion finance area, a read-only work repo |
| [health-advisor](health-advisor/AGENT.md) | health, not fitness: lab reports transcribed into `data/body/labs/`, check-ups, screenings, medications, symptoms, a prevention plan with dates; never diagnoses, urgent symptoms go straight to the emergency number | claude-code, telegram, any chat model | the labs folder or a labs database (e.g. Notion), the body layer, a calendar connector, a scheduled routine |
| [web-builder](web-builder/AGENT.md) | builds and changes the owner's websites (Next.js + a headless CMS as the reference stack): design system first, copy in the CMS, preview before production, verify before claiming, a setup sheet per site; never deploys production or merges without a yes | claude-code (a shell), telegram or any chat model for planning | a hosting CLI, a CMS CLI or connector, a component workbench, a browser |
| [tech-maintainer](tech-maintainer/AGENT.md) | keeps the system healthy: repo structure and tools, clean git, the machine the agents run on, every agent's routines and their mirrors, the daily memory sweep, lint, credential expiry dates; small fixes reported in one line, structural changes only on a yes; never reads a secret | claude-code, any chat model with a shell | a shell on the machine, read access to the runner's routines and memory |
| [english-teacher](english-teacher/AGENT.md) | English practice between real lessons (or instead): conversation on the owner's real life, corrections logged, drills, business chunks, mock speaking tests against CEFR, feedback on a real email; speaks English; never claims to be a real teacher | claude-code, any chat model (voice) | a transcript connector for real lessons, a voice channel |
| [recruiter](recruiter/AGENT.md) | hiring: CV screening against the role, interview kits and scorecards, slots, the pipeline; judges only skills and experience, never invents a candidate fact, never contacts anyone without a yes; candidate data never in this repo | claude-code, any chat model | a pipeline database or ATS connector, calendar and mail connectors |
| [legal](legal/AGENT.md) | legal matters: explains the documents the owner receives, keeps the open matters and deadlines, prepares calls with the real lawyers, drafts letters; cites a source for every law (reference texts in `legal/knowledge/`), unknown is UNKNOWN; not binding advice, the lawyer on each file decides; may be modelled on the owner's real lawyer, never claims to be them; never sends without a yes | claude-code, telegram, any chat model | mail, calendar and transcript connectors, official reference texts for the jurisdiction |

## Adding an agent

`python3 tools/agents/create_agent.py --new <role> --title "<title>"` copies `agents/_template/`
(spec, memory skeleton, routine folder) and writes a launcher in `skills/<role>/SKILL.md`; then it
creates the persona like any other role. Fill in the spec's sections (persona, role, rules, lane and
handoffs, what it remembers and where, routines, flows), the memory skeleton's headings, and add a row
above and a trigger line in `AGENTS.md` / `CLAUDE.md`.
