# CLAUDE.md: how to work in this repo

Boot sequence and rulebook for any AI agent (Claude Code, Cursor, Codex, Grok, GPT, a Telegram
bot) operating in this repo. Read it before responding to the request. This file is mirrored at
[`AGENTS.md`](AGENTS.md); keep both identical (edit one, copy it over the other).

This repo is a **personal knowledge graph**: the people in the owner's world and everything that
connects them, kept current from their own stream (WhatsApp, meetings, email) and browsable as a
graph. It is built to run mostly unattended: a daily sweep turns WhatsApp / transcripts / mail
into episodic logs, profile rollups and graph edges. You are probably here as that sweep, as a
repair pass on it, as an agent talking to the owner, or because the owner is talking to you.

---

## 0. Rule zero: the personal detail comes first

Before anything else. The whole reason this graph exists is the **human layer**, captured
**super-detailed, specific and personal**, never generic. Not just that someone was mentioned but
**who they are** (origin, life story, family, health, feelings, fears, ambitions, character); not
just what they said but the **reasons, experiences and activities** behind it, in their own words
(quote them). **Be obsessed and specific, capture proper NAMES** by first and last name where you
can: partner / spouse (name, what they do, state of the relationship, plans together), children
(names, ages), parents and siblings, close friends and who introduced whom, and the **investors /
people who funded** them or their company. Generic ("has a partner", "some investors") is a failed
capture, and a known-but-unnamed partner or backer is a gap to chase. The human layer beats the
work content every time, even in a call that was "about work": a work-only log is a failed
capture. Never compress the personal detail away to save space; that detail IS the memory.

---

## 1. Who am I working for?

Read `owner` (display name), `owner_slug` and `owner_language` from
[`config.local.yml`](config.example.yml). The owner's own node is always `data/_me.md`, with
their episodes in `data/interactions/_me/`; `owner_slug` defaults to `_me`, and if it names
another slug (the one other sources use for the owner), the tools treat both as the owner. If
`config.local.yml` does not exist yet, tell the user to `cp config.example.yml config.local.yml`
and edit it, then proceed with what you can.

**Talk to the owner in `owner_language`. Write the repo in English.**

## 2. Who are you here?

The repo is a **knowledge base**, and agents work on top of it. Decide which one you are before
anything else:

- **You are an agent, or a bot talking to the owner** (a Telegram bot, a chat app, another model
  pointed at this repo, a launcher like `/fitness-coach`, or an env var / system prompt naming an
  agent): open `agents/README.md`, find your agent in `agents/<role>/AGENT.md`, and **become that
  agent** for the whole conversation: its role, voice, memory (`data/agents/<role>/`), rules and
  flows. Which one: the name you were given; otherwise the one whose job matches what the owner is
  asking:
  - a food photo, the gym, a match, sleep, recovery → `fitness-coach`
  - "let's do a session", how they feel → `psychologist`
  - their work day, calendar, mail, meetings, follow-ups, priorities → `founder-assistant`
  - a LinkedIn post, a comment, a DM, their profile → `linkedin-coach`

  The owner may give each agent a persona name (set as `persona:` in its `AGENT.md`); a message
  that uses that name means that agent. If none matches, or two do, ask in one line which one.
  Agents are an optional module: if `agents/` is absent, you are the keeper (below). Everything
  else in this file still applies to every agent (the wall, quotes vs reads, never invent,
  always push).
- **You are a sweep, a routine or a repair pass** (a scheduled task, a backfill, a lint fix): you
  are not an agent. Follow your task and the loop below.
- **The owner is talking to you directly, about their life or the repo, with no agent named:**
  you are the keeper of the knowledge base. See "When the owner talks to you directly".

**Read these three before writing anything:**

1. [`README.md`](README.md): rule zero, the personal detail comes first, specific, with names.
2. [`LEGEND.md`](LEGEND.md): the exact field-and-edge contract. This is the one you will violate
   by accident.
3. [`anatomy.md`](anatomy.md): the memory model (episodic / semantic / working), the node map,
   and the optional modules.

Then the skill being invoked: [`skills/remember-people/SKILL.md`](skills/remember-people/SKILL.md)
(the core engine: log, roll up, wire, graph pass, brief),
[`skills/graph-audit/SKILL.md`](skills/graph-audit/SKILL.md) (the weekly look from above), or
[`skills/notion-sync/SKILL.md`](skills/notion-sync/SKILL.md) (optional). `config.local.yml` says
which sources, integrations and modules are actually wired. Empty is fine: every skill still
works, sources only enrich.

---

## 3. The three failures this graph actually has

Not hypothetical. They were measured in the instance this template was extracted from: the first
two after one month and ~600 interactions, the third some weeks later.

**1. It records well and connects badly.** The episodic and semantic layers came out excellent:
verbatim quotes, real personal beats, self-correcting. The *relational* layer was a star around
the owner: about three quarters of people had no edge to another human, `introduced_by` had a
handful of edges in the whole graph, `places/` had two nodes, more than half the people had no
location. Every sweep works person-by-person, so it produces radial edges and never asks the
cross-person question.

**So: after logging, always run the graph pass.** Who was in the room together? Who introduced
whom? Where was this? That is Flow E in `skills/remember-people/SKILL.md`.

**2. Hand-editing frontmatter corrupts it silently.** A freehand "close the missing reverse edges"
pass appended list items at the wrong indent and duplicated three hub nodes. Obsidian stopped
reading their edges, and nothing noticed for four days: the repair pass broke exactly the nodes
it was repairing.

**So: never hand-edit a frontmatter link list.** Use the tooling.

**3. A hardcoded date made a whole season invisible.** The daily catch-up check asked "does every
day with WhatsApp traffic have a file?", but it started at a hardcoded date, on the belief that
everything earlier was covered by monthly rollups. That was false: about two months of
consecutive days, ~17,000 messages, had no daily file at all, and the rollups "covering" them were
a few dozen month-long prose summaries about a small fraction of the people in the graph. Every
run truthfully reported "no backfill owed", because the detector could not see the region it had
been told to skip.

**So: never give a detector a hardcoded horizon.** `python3 tools/owed_backfill.py` measures what
is still owed and shrinks as the backfill lands; it recomputes instead of remembering. The
backfill runs oldest-first, one commit per day (`git log --grep backfill`).

---

## 4. The loop, every time

```bash
git pull --rebase --autostash origin main   # if you track a private remote (the hook does it)
python3 tools/lint.py            # see the state before you touch anything
python3 tools/gaps.py today      # what this run is supposed to try to close
python3 tools/owed_backfill.py   # days of the stream that still have no log, oldest first

# optional, body layer (anatomy.md, "The body layer"): the last 3 days
FROM=$(date -v-3d +%F 2>/dev/null || date -d '3 days ago' +%F)   # macOS (BSD date) || GNU/Linux
tools/body-pull.sh "$FROM" && python3 tools/body.py ingest && python3 tools/body.py days "$FROM"
#   then, if you mirror to Notion: python3 tools/body.py notion FROM TO
#   and check the labs database for rows with no node in data/body/labs/ (anatomy.md, "The labs")

# optional, location layer (anatomy.md, "The location layer"): the phone's GPS since the last run
tools/location-pull.sh && python3 tools/location.py ingest

# ... do the work: log interactions, roll up profiles, add FORWARD edges ...
# ... the graph pass (Flow E): co-presence, introductions, locations, venues, names, dedup ...
# ... try the gaps on today's list, and record every outcome:
#     gaps.py close <id> -e "the evidence"   |   gaps.py attempt <id> -n "what you checked"
python3 tools/lint.py --fix      # close reverses, dedup, normalise, resync body lists
python3 tools/lint.py            # MUST print "mechanical: 0"
python3 tools/gaps.py sync       # reconcile the register, record the day in history
# commit + push (if you track a private remote)
```

If the work digest `data/_followups/` is missing days that were already swept,
`python3 tools/rebuild_followups.py` regroups them from the interaction files, behind the wall.

You are responsible for the **forward** edge and for the **facts**. The lint is responsible for
the reverse edge and the shape. Do not do its job by hand, and do not consider a run finished
while it still reports mechanical findings.

Writing edges in code (`tools/graph.py` is the only sanctioned frontmatter writer):

```python
import sys; sys.path.insert(0, "tools")
from graph import load_nodes
nodes = load_nodes()
nodes["wren-halvorsen"].add_link("lives_in", "lisbon")
nodes["wren-halvorsen"].write()    # re-reads itself and raises if it broke anything
```

Prose, `## Current state`, profiles and interaction bodies are normal markdown: write those
directly, as richly as rule zero demands.

### Tools at a glance

Run every command from the repo root.

| what | command |
| --- | --- |
| check the graph | `python3 tools/lint.py` (`--fix` applies mechanical fixes, `--gaps` the go-and-ask list) |
| the gap register | `python3 tools/gaps.py sync / today / attempt / close / drop / trend` |
| what the backfill still owes | `python3 tools/owed_backfill.py` (`--all` includes quiet days) |
| merge two nodes that are one human | `python3 tools/merge.py <loser> <survivor> --why "..." [--dry-run]` |
| a placeholder slug gets its real name | `python3 tools/rename.py <old> <new> --name "Real Name" --why "..."` |
| rebuild missing work digests | `python3 tools/rebuild_followups.py` |
| body: pull raw, rebuild store, write days | `tools/body-pull.sh YYYY-MM-DD && python3 tools/body.py ingest && python3 tools/body.py days FROM TO` |
| body: what happened in a time window | `python3 tools/body.py window 2030-05-14T18:30:00 2030-05-14T19:15:00` |
| a meal photo into the food log | `python3 tools/food.py add <photo> [--time HH:MM]`, fill the block, then `python3 tools/food.py table` |
| daily calorie estimate next to the wearable's | `python3 tools/calories.py day YYYY-MM-DD [--write]` |
| location: pull and rebuild the store | `tools/location-pull.sh && python3 tools/location.py ingest`, then `day YYYY-MM-DD` / `summary` |

Never run a login or re-authorisation for an external account (a wearable CLI, a mail account,
the WhatsApp bridge) yourself: if access is lost, tell the owner to do it.

---

## 5. Gaps are the product, not the noise

A lint report is disposable: it is recomputed from scratch, so a gap open for three weeks looks
exactly like one found this morning. **The register in `data/_gaps/` is the memory of what the
memory does not know**, and maintaining it is part of the job, not a report about the job.

```bash
python3 tools/gaps.py today                  # the chase list for this run
python3 tools/gaps.py close <id> -e "..."    # closed, WITH the evidence
python3 tools/gaps.py attempt <id> -n "..."  # tried and failed: say what you actually checked
python3 tools/gaps.py drop <id> -n "..."     # not real / not worth it, with the reason
python3 tools/gaps.py trend                  # are gaps net closing or net opening?
```

Every gap carries `first_seen`, `last_seen`, `attempts` and, when it closes, `closed_by`. Read
`data/_gaps/OPEN.md` in Obsidian; never edit it by hand.

The rules:

- **Never invent a fact to close a gap.** No inferred surname, no guessed city, no assumed
  partner name. A wrong fact in memory is worse than a missing one, and this graph is read
  before real conversations with real people.
- **A gap closes on evidence, never on silence.** If a gap simply stops being reported, `sync`
  closes it with `"detector: no longer reported"` and, for fact-gaps, **flags it as suspicious**:
  a name does not become known by itself, so it usually means the node was renamed, merged or
  deleted. Go and check, then re-close it with the real reason.
- **Record the gap in the data too**, so a human reading the node sees it:
  `partner: "NAME UNKNOWN (gap to chase) - wife from Porto, met at university"`. An empty field
  says nothing and asks nothing.
- **An attempt is worth recording even when it fails.** "checked the WhatsApp address book and
  mail, the contact is saved under a nickname only" is what stops the next three runs repeating
  the same dead end, and after 3 attempts the gap is flagged **STALLED**, which means stop
  guessing and ask the owner directly.
- **Open >21 days with zero attempts** is flagged too: that gap is being ignored, not worked.

The one that matters most: **`introduced_by` is stated once and never repeated.** If a person
first appears with "intro from X" / "through X" / "X connected us", capture it that day or lose it
permanently.

## 6. Never fork a person

Three merges in the first month of the original instance, always the same shape: a first name
saved as a nickname in one source forks into a second node that then grows its own interactions,
its own profile and its own Notion page.

| merged | into | tell |
| --- | --- | --- |
| `theo-gym` | `theodore-brennan` | a nickname in one source, the full name in another |
| `priya-acme` | `priya-sato` | same company, same introducer, same coffee |
| `jules-supplier` | `julia-okafor` | **identical `notion_url`**, same phone |

(Fictional names; the shapes are real.)

When a placeholder slug finally gets its real name, rename it with
`python3 tools/rename.py <old> <new> --name "Real Name" --why "..."`: it relinks everything,
keeps the old spellings as aliases and carries the gap history across. Then tell `notion-sync`:
Notion still has the old page title.

`tools/checks.py` reports duplicates as `possible-duplicate`. Resolve them with
`python3 tools/merge.py <loser> <survivor> --why "..."` (try `--dry-run` first): it keeps both
channels of a shared day, relinks every inbound link, unions the edges, and writes genuine field
conflicts into the survivor's body instead of dropping them. Then fold the merged block into the
prose by hand and delete it.

## 7. Quotes are facts, reads are guesses

A remark by the owner is recorded as the quote it is, with its context. It never becomes a
diagnosis of what they think or feel about someone. An interpretation may be noted in a log,
clearly marked as the sweep's read, but it never gets promoted into a profile's Current state and
never drives brief guidance unless the owner has confirmed it. (The lesson: a passing line about
a colleague's workload became a fabricated "you think he is carrying too much" warning in a
brief, which the owner flatly rejected.)

The same rule holds for numbers in the optional body layer: **a number is a fact, its meaning is
not.** A heart rate of 112 while sitting still is recorded as exactly that, never as "stressed".

## 8. When the owner talks to you directly

Not every run is the unattended sweep. Sometimes the owner is in the session, talking about their
own life. The principle, in the owner's spirit: *record what I tell you and talk to me calmly;
otherwise talking to you turns into a source of anxiety, and it feels like talking to a robot
that is busy saving memory.*

- **Record silently.** Whatever they tell you (a date, how it went, a fact about someone) goes
  into that day's log and the person's Current state in the same turn, as their first-hand words,
  then commit, **without ever mentioning it in the reply**: no "noted", no "recorded". Not every
  line needs a write: a repeated feeling already on the record does not.
- **Something intimate: ask first, once, plainly** ("I won't save this one automatically, shall
  I?"). Also ask when something is genuinely strange: an identity you cannot resolve, a fact
  that contradicts the record, something harmful if wrong.
- **Talk like a person, back and forth.** Short, fast, in their language, picking up the right
  context from the graph. No headers, no option menus, no follow-up questions just to fill space.
- The other rules do not relax: quotes are facts, reads are guesses, and a missing detail (a
  name, a gender, who was there) stays missing until they say it. Never fill it by assumption.
- **Every conversation is saved:** what they said and what was built or decided goes into that
  day's `data/interactions/_me/<date>.md`.

## 9. Hard rules

- **The wall.** Full detail (dating, health, money, legal, family, gossip, real quotes) belongs
  inside `data/`. Nothing personal crosses into a work repo, any shared surface, or the
  `_followups` work digest. `data/` is gitignored by default; an owner who keeps their copy in a
  **private** repo may commit it as a backup (see `.gitignore`), never in a public one.
- **Node-on-recurrence.** A light entity becomes a file only when it recurs (2+ mentions or 2+
  days). Below that it stays plain text inside the interaction. Stops the swamp.
- **Dedup before create.** Resolve against `aliases:` first; the same entity under different
  spellings or ids must land on ONE node. Never fork (section 6).
- **Provenance on every fact.** Cite the source inline: `whatsapp:<phone>`, `fireflies:<id>`,
  `gmail:<thread>`, `manual:<owner_slug>-<date>`. A fact seen once is not a stable fact.
- **Every frontmatter wiki-link is quoted** (`person: "[[wren-halvorsen]]"`), and **nothing is
  unattached**: every file under `data/` links somewhere or is linked from somewhere.
- **Frontmatter edges are lists of scalars, never lists of maps**, written via `tools/graph.py`.
- **Fail soft.** If a source is down, log what you got and move on. The skills are idempotent
  and safe to re-run.
- **The brief looks at the human first**, then ramifies through the graph. It must work with an
  incomplete graph; sources enrich, they never block.

## 10. Git: pull when you arrive, commit and push every time

This applies when the owner keeps the repo in a private remote. The lesson that wrote it: dozens
of commits piled up unpushed on one machine while other sessions pushed theirs.

- **Arrive:** `git pull --rebase --autostash origin main` before touching anything. The optional
  SessionStart hook does it; check it worked.
- **After every piece of work:** commit with a real message, then push. Not at the end of the
  session: after each change. The optional Stop hook (`.claude/hooks/git-sync.sh push`) is only
  the safety net that autosaves and pushes whatever a turn left behind. Wire both hooks in
  `.claude/settings.json` as `bash "$CLAUDE_PROJECT_DIR/.claude/hooks/git-sync.sh" pull` (and
  `push`).
- **If you are not Claude Code**, the hooks do not run for you: pull before you start and commit
  + push yourself after every change.
- `data/_gaps/history.jsonl` merges with `merge=union` (`.gitattributes`): it is an append-only
  ledger, both sides' lines are kept. Any other conflict: resolve it, never drop the other side.

## 11. Commits

One commit per run, present tense, saying what the run *found*, not that it ran:
`sweep: 2030-05-14`, `lint: close 8 missing reverse edges`, `fix: Wren is Lisbon-based`. When
`data/` is tracked (private copy), the sweep commits its own work; when it is gitignored (the
default), only engine changes are committed.
