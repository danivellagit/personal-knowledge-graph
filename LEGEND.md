# LEGEND: the exact shape of the graph

`README.md` says *why* this repo exists. `anatomy.md` says *how the memory is modelled*. This
file is the **contract**: the field-by-field shape that `tools/graph.py` enforces and
`tools/lint.py` checks. If you change the shape, change it here and in `tools/graph.py` in the
same edit, or the next sweep will fight the tooling.

It was written in the original instance after a graph audit found the memory was recording well
and **connecting badly**: about three quarters of the people had no edge to another human, the
introduction graph had a handful of edges, and a hand-run repair pass had silently corrupted
three hub nodes' frontmatter.

Examples below use fictional names (`wren-halvorsen`, `lisbon`, `the-copper-kettle`).

---

## 1. Node types

### Core

| Type | Directory | Born | One node is |
| --- | --- | --- | --- |
| person | `data/people/` | in repo (optionally mirrored from your system of record, e.g. Notion), enriched here | one human |
| company | `data/companies/` | in repo, or mirrored from your system of record | one organisation |
| city | `data/cities/` | in repo, on recurrence | a place people live in or meet in |
| place | `data/places/` | in repo, on recurrence | **a venue**: restaurant, bar, club, gym, coworking |
| passion | `data/passions/` | in repo, on recurrence | a shared interest |
| term | `data/terms/` | in repo, on recurrence | a recurring concept / project / method / running joke |
| group | `data/groups/` | in repo, on recurrence | a crew, community, cohort |
| bond | `data/bonds/` | fixed vocabulary | the *nature* of the owner's tie to someone (family, friend, colleague, partner, dating, advisor, investor, ex) |
| role | `data/roles/` | in repo, when ≥2 people share it | a normalised job title |
| event | `data/events/` | in repo | a trip, offsite, birthday, conference |
| media | `data/media/` | on demand | an artifact *about* people that the owner consumed (podcast, video, interview, article) |
| interaction | `data/interactions/<person>/<date>.md` | every sweep | one day of one relationship |
| owner | `data/_me.md` | manual only | the owner. **Not** a node in `people/`; no outgoing edges |

### Optional modules (only if enabled in `config.local.yml`)

| Type | File | Written by | One node is |
| --- | --- | --- | --- |
| body day | `data/body/body-<date>.md` | `tools/body.py days` | one day of the owner's body (a wearable): numbers, sleep stages, heart by the hour, sessions |
| body week | `data/body/body-week-<YYYY-Www>.md` | `tools/body.py days` | the week over the days: averages, who was seen and written to most, events |
| body log | `data/body/body-log.md` | `tools/body.py table` | the generated one-row-per-day table of every body day |
| food day | `data/food/food-<date>.md` | `tools/food.py add` + the fitness coach | one day of meals: photo, what, ingredients, estimate, where and with whom |
| training day | `data/training/training-<date>.md` | the fitness coach | what the owner did in a session, in their words |
| lab report | `data/body/labs/lab-<date>.md` | by hand, from the PDF | one lab report / visit / scan: every value transcribed, flat key markers in frontmatter |
| labs index | `data/body/labs/labs.md` | by hand, with every new report | the list of every report and the marker-by-date table |
| agent memory | `data/agents/<role>/` | the agent | an agent's own memory; psychologist sessions never propagate |
| agent persona | `agents/<role>/AGENT.md` `persona:` | by hand | the name and profile the owner gives an agent (optional) |

`city` vs `place` is the distinction that keeps getting lost: **Lisbon is a city, The Copper
Kettle is a place.** A place has `in_city`.

---

## 2. Edge rules: the whole table

Every edge is a `[[slug]]` wiki-link in **frontmatter**, **quoted**, written as a **forward +
reverse pair**. You write the forward one (via `tools/graph.py`); `tools/lint.py --fix` writes
the reverse. Body prose links are free-form and are not edges.

| On this node type | field | points at | reverse field on the target |
| --- | --- | --- | --- |
| person | `lives_in` | city | `residents` |
| person | `works_at` | company | `people` |
| person | `into` | passion | `people` |
| person | `frequents` | place | `regulars` |
| person | `member_of` | group | `members` |
| person | `relationship` | bond | `people` |
| person | `role_type` | role | `people` |
| person | `introduced_by` | person | `introduced` |
| person | `mentors` | person | `mentored_by` |
| person | `featured_in` | media | `features` |
| person | `events` | event | `people` |
| place | `in_city` | city | `places` |
| event | `people` / `city` / `place` / `groups` | person / city / place / group | `events` on each |
| media | `features` | person | `featured_in` |

**Symmetric fields** (same field on both ends, no separate reverse): `knows`, `colleagues`,
`family`, `partner_of`. (`partner:` is a free-text description, the field that carries
`NAME UNKNOWN (gap to chase)` until the name arrives; `partner_of` is the edge once the partner
has a node.)

`role:` is a free-text title ("Co-founder & CEO") and stays a string; `role_type:` carries the
normalised linked node (`["[[co-founder]]"]`) once two or more people share it.

**Interaction frontmatter**: the episodic layer, and the one place a wrong field type quietly
starves a whole node type:

```yaml
person: "[[wren-halvorsen]]"    # the anchor: whose relationship this day belongs to
date: 2030-05-14
setting: chat | call | meeting | in-person | manual
source: whatsapp:<phone> | fireflies:<id> | gmail:<thread> | manual:<owner_slug>-<date>
time:   "18:30-18:41"           # local, only when known; tools/body.py joins the heart to it
body:   "[[body-2030-05-14]]"   # that day's body node (body layer only)
with:   ["[[oskar-lindqvist]]"] # everyone else present. Drives the co-presence check
at:     ["[[the-copper-kettle]]"]  # a PLACE only. Never a city, never a passion
city:   ["[[lisbon]]"]          # where it happened
about:  ["[[term]]", "[[passion]]"]
```

In the original instance `at:` was used for cities and even a passion. That is why `places/` had
**two** nodes after a month: the field that should have forced a venue node was already full.
Cities go in `city:`, passions in `about:`, and `at:` stays empty until there is a real venue.

**Body day frontmatter** (optional body layer): episodic like an interaction, outbound links
only, no reverse edges. Written by `tools/body.py`, never by hand, except the fields a sweep
resolves:

```yaml
type: body-day
person: "[[_me]]"          # the owner node
date: 2030-05-14
source: <wearable>
bed: "23:47"               # every number is a scalar; an unmeasured one stays bare (`hrv_ms:`)
sleep_min: 412
rhr: 58
# ... deep_min rem_min light_min awake_min nap_min hr_sleep_min hrv_ms spo2 spo2_low breathing
#     temp_dev steps km kcal active_light active_moderate active_vigorous zone_min hr_max
#     hr_max_at hr_still_median still_over_100_min sessions
week: "[[body-week-2030-W20]]"     # generated: the week node
prev / next: ["[[body-2030-05-13]]"]   # generated: the chain of days
activities: ["[[climbing]]"]       # generated: a PASSION, from the session type
contacts: [...]       # generated: anchor person of every interaction logged that day
met: [...]            # generated: people of the IN-PERSON interactions that day (+ their `with:`)
city / places: [...]  # generated: `city:` / `at:` of those in-person interactions
events_on_day: [...]  # generated: events dated that day (a calendar fact, not proof of presence)
last_before_sleep / first_after_wake / late_night / top_chats: [...]   # generated from WhatsApp
                      # timestamps joined to the sleep times: who, never what
group_chats: [...]    # generated: the groups most active that day
notion_url: "..."     # optional: the row in your Notion body database; kept across regenerations
with:       ["[[person]]"]         # SWEEP: who was at the sessions that day
at:         ["[[place]]"]          # SWEEP: a PLACE only, same rule as interactions
sessions_open:     ["15:45 Climbing 60min"]   # generated: sessions nobody has attributed yet
sessions_resolved: ["15:45"]                  # SWEEP: HH:MM of a session now attributed (or solo)
```

Regenerating a day keeps `with`, `at`, `sessions_resolved` and the `## Notes` section; everything
between the `body:generated` markers is rewritten. Interactions are linked from the body by path,
`[[interactions/wren-halvorsen/2030-05-14]]`, because interaction basenames repeat.

**Lab report frontmatter** (optional): `type: lab-report`, `person`, `date`, `drawn`,
`category`, `lab`, `site`, `notion_url` (optional), `pdf` (an off-repo path), `out_of_range`,
then flat numeric markers with fixed keys: `wbc rbc hb hct plt hba1c_pct hba1c_mmol glucose urea
creatinine egfr uric_acid chol_total ldl hdl trig alt crp tsh ft3 ft4 homocysteine insulin`. Add
new keys only for new tests, and keep the same key for the same test across reports. Values are
read from the PDF, never from a summary of it.

---

## 3. Invariants

The lint enforces these. A run is not finished until `python3 tools/lint.py` reports
**`mechanical: 0`**.

1. **Every forward edge has its reverse.** No exceptions, no "I'll get it next time".
2. **Every edge points at the declared type.** `lives_in` → a city node, not a place.
3. **Every frontmatter wiki-link is quoted.** `person: "[[wren-halvorsen]]"`, never
   `person: [[wren-halvorsen]]`: unquoted, YAML parses nested arrays, Obsidian registers no
   reference and the file is an orphan (`unquoted-link`).
4. **No duplicate link inside a field**, and every link list is block style, 2-space indent,
   sorted:
   ```yaml
   knows:
     - "[[ines-moreau]]"
     - "[[oskar-lindqvist]]"
   ```
5. **A bare key stays bare.** `birthday:` is unset, not `[]`. `links:` is a nested map header.
6. **Body `## People` / `## Residents` / `## Members` lists mirror their frontmatter field.**
   They are generated; do not hand-curate them.
7. **Every frontmatter link resolves to a node**, or it is a reported gap.
8. **Nothing is unattached.** Every `.md` under `data/` has at least one wiki-link in or out
   (`orphan-file`), the `_followups/` digests included.
9. **Never hand-edit a frontmatter link list.** Use `tools/graph.py` or `tools/lint.py --fix`.
   Appending a list item by hand at the wrong indent is exactly how three hub nodes got
   corrupted in the original instance, and Obsidian then stopped reading their edges entirely,
   silently, for four days.
10. **A person's birthday is in their file.** `birthday:` holds `YYYY-MM-DD`, or `MM-DD` when the
    year is unknown, with a comment naming its source (`# from the owner, 2030-05-14`,
    `# from Notion People`). Another system (a Notion People database, a contacts app) is a
    source, never the home. Match a row to a node by phone or email, never by first name alone;
    never overwrite a non-empty birthday: if they disagree, keep the file's value and record the
    conflict as a gap.

---

## 4. Connection rules (what the audit was actually about)

Recording is not connecting. These are the rules that make the graph a network instead of a
star around the owner.

- **Co-presence is evidence.** Two people in the same interaction (`with:`) on **≥2 separate
  days** know each other. If there is no path between them in the graph, add `knows` both ways.
- **A shared hub counts as a path.** If both work at the same company, or are in the same group
  or event, they are already connected: do **not** add a direct edge, it is noise. The lint
  separates these two cases and only the pathless one is a real hole.
- **Names or it did not happen.** A person node whose `name` is one word or a placeholder
  (`theo-gym`, `priya-acme`) is a gap to chase, not a finished node.
- **A known-but-unnamed partner, child, parent or investor is a gap, not a fact.** Record what
  is known and say the name is missing, literally:
  `partner: "NAME UNKNOWN (gap to chase) - wife from Porto, met at university, architect"`.
  The lint greps for `NAME UNKNOWN` and keeps asking. An empty field asks nothing.
- **Who introduced whom is the highest-value edge in the graph** and the easiest to lose: it is
  stated once, in one message, and never repeated. Capture `introduced_by` on the day the person
  first appears or it is gone.
- **A location is an edge, not prose.** `based:` free text is a gap; `lives_in` is the edge.
  Create the city node when someone actually lives there.

---

## 5. Tools

```bash
python3 tools/lint.py           # report: mechanical findings + gaps to chase
python3 tools/lint.py --fix     # apply ONLY the mechanical fixes, then re-verify
python3 tools/lint.py --gaps    # just the go-and-ask list
```

`tools/graph.py` is the frontmatter reader/writer every script must use. It does line surgery
rather than re-serialising, so unmanaged keys, comments and spacing survive byte-for-byte.
`Node.write()` re-reads what it just wrote and raises if the parse broke, if the render is not
idempotent, or if an edge was lost. `tools/checks.py` holds every check as data, each finding
with a **stable id** (`partner-unnamed:<slug>`), which is what lets the gap register track it
across days.

One-off data migrations live in `tools/migrations/<date>-<name>.py` and carry their evidence
inline.

**The gap register** (`data/_gaps/`) is the persistent memory of what the graph does not know:
one tracked entry per unknown, with `first_seen`, `attempts`, and `closed_by` when it closes.
`tools/gaps.py sync|today|attempt|close|drop|trend`. `register.jsonl` is the machine-owned source
of truth, `OPEN.md` the generated human view, `history.jsonl` (append-only, `merge=union`) makes
the trend real. A gap closes on **evidence**, never on silence.

**The backfill detector**: `tools/owed_backfill.py` compares days with stream traffic against days
with an interaction file and lists what is still owed, oldest first. It measures the region from
the data every time; it never starts at a typed-in date.

**Merging** two nodes that turned out to be the same human: `tools/merge.py <loser> <survivor>
--why "..."`. Never fork a person; three forks happened in the original instance's first month.

**Renaming** a placeholder slug once the real name arrives: `tools/rename.py <old> <new>
--name "Real Name" --why "..."`. Placeholder slugs are legitimate (the sweep must file someone
the day they appear), but the slug has to follow the name, or a nickname stays an identity and
that is where the next fork starts. The tool keeps the old slug and old display name as aliases,
carries the person's gap history across (gap ids embed the slug), and reminds you that Notion
still holds the old page title.

**The work digest**: `data/_followups/<date>.md`, grouped under `## [[slug]]` headings, holds
only work follow-ups. `tools/rebuild_followups.py` rebuilds missing days from interactions
already in the graph and applies the wall: the owner, nodes marked `wall: personal`, people tied by a personal bond, plus
`wall.exclude_slugs` and `wall.sensitive_words` from `config.local.yml`.

**The body layer** (optional): `tools/body-pull.sh` (raw, off-repo) → `tools/body.py ingest`
(a local SQLite store, off-repo) → `tools/body.py days` (day and week nodes + `body-log.md`) →
`tools/body.py notion` / `rows` (rows for an optional Notion mirror; `link-notion DATE URL`
stores the row's URL on the day). `tools/body.py window START END` answers "what was the heart
doing during this call". The lint turns every `sessions_open` item into a
`body-session-unattributed` gap. `tools/food.py` writes the food log; `tools/calories.py` puts a
daily calorie estimate next to the wearable's.

**The location layer** (optional): `tools/location-pull.sh` (Overland batches, off-repo) →
`tools/location.py ingest` (a local SQLite store, off-repo) → `day DATE` / `summary`.

**Two classes of finding, never mixed:**

- **MECHANICAL**: provably right, `--fix` applies it. Shape, reverses, dedup, quoting, body
  lists.
- **GAP**: needs a human or a re-read of the stream. Lint reports it and never guesses.
  **Never invent a fact to make the lint quiet.**
