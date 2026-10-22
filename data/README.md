# data/ (private, gitignored by default)

Everything in this folder is the owner's and stays on their machine. It is gitignored on
purpose: it holds real people, real conversations, health, money, family, the lot. Never copy it
into a work repo or any shared surface. That boundary is the whole point.

An owner who keeps their copy of this repo **private** may choose to commit `data/` as a backup
(remove the `data/` lines in `../.gitignore`). Then the git history holds the data, so that repo
must never be made public. Never do it in a public fork.

The skills and tools create these folders as they discover entities from the stream. You do not
need to make them by hand; this is the map.

The point of view the whole graph is written from is the owner file, `_me.md`, which
sits here at the entrance rather than in `people/`: the owner is not a
counterpart.

```
data/
  _me.md                       the owner: durable profile + current state
  people/<slug>.md             one profile per person (semantic + working memory)
  companies/<slug>.md          one per company (mirrored from your system of record, if any)
  interactions/<slug>/         one file per exchange day, append-only
      2030-05-14.md              recent: daily
      2030-03.md                 old: rolled up monthly
  interactions/_me/            the owner's own episodes: self-thoughts, every chat with an agent
  cities/ places/ passions/    light entities, born here from the stream on recurrence
  terms/ groups/ events/
  bonds/ roles/ media/
  _followups/YYYY-MM-DD.md     the work digest per sweep (no personal content, ever)
  _gaps/                       the gap register: what the memory knows it does not know
      register.jsonl             machine-owned, one line per gap
      OPEN.md                    generated human view (never edit by hand)
      history.jsonl              append-only, one line per sync (merge=union)

  # optional modules, only if enabled
  body/                        body-<date>.md, body-week-<YYYY-Www>.md, body-log.md, labs/
  food/                        food-<date>.md, photos/, food-log.md, ingredients.md
  training/                    training-<date>.md
  agents/<role>/               each agent's own memory
```

Raw streams of the optional modules (wearable samples, GPS points, lab PDFs) and their SQLite
stores live **outside** the repo; only facts derived from them land here.

## The two rules that keep it a graph and not a folder

**1. Nothing is unattached.** Every file links to something and something links back. A file with
no inbound and no outbound wiki-link is a bug, not a style choice: it is invisible in the Obsidian
graph and unreachable from any brief. `python3 tools/lint.py` reports it as `orphan-file` and the
run is not finished until the count is zero.

**2. Wiki-links in frontmatter MUST be quoted.**

```yaml
person: "[[wren-halvorsen]]"   # correct: a string containing a link
person: [[wren-halvorsen]]     # WRONG: YAML reads nested arrays, Obsidian sees no link
```

This is not cosmetic. In the instance this template was extracted from, nearly every interaction
file was written the unquoted way for a month, so every one of them was an orphan in the graph
view and the tooling could not read their `person:` anchor either. The tooling was tolerant with
a regex and Obsidian was not, so nothing complained. `lint.py --fix` now quotes them and
`unquoted-link` fails the lint if it ever comes back.

Other invariants: one profile per person in `people/<slug>.md`; slugs match between a person's
profile and their `interactions/<slug>/` folder; every forward edge has its reverse (written by
`lint.py --fix`, never by hand). Contract: [`../LEGEND.md`](../LEGEND.md). Node map and memory
model: [`../anatomy.md`](../anatomy.md).

Schemas: [`../skills/remember-people/templates/`](../skills/remember-people/templates/).
