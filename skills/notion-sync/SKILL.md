---
name: notion-sync
description: Reconcile the A-entities (people, companies) between this graph and your Notion workspace. If a person or company exists in the repo graph but is missing from Notion, create the Notion record AND the local mirror stub, in pair (create-on-first-mention). Notion stays the source of record; the repo mirrors it read-only. Runs daily after the remember-people sweep, or on demand. Optional: skip this skill entirely if you do not use Notion.
---

# notion-sync

> **Optional skill.** It only applies if you keep your canonical People / Companies in Notion.
> If you do not use Notion, delete this skill folder; the graph works standalone.

## What it does, in one line

Keeps the canonical People / Companies lists whole: any human or company that shows up in the
graph but is not yet in Notion gets created there (and mirrored back), so the record never
falls behind the stream. Notion is the master for these two types; this repo mirrors them.

## The split it enforces

- **Notion = source of record** for `people` and `companies` (heavy, official).
- **This repo = a read-only mirror** of those two types, for wiki-linking inside the graph.
- All other node types (places, passions, cities, terms, groups, events, bonds, roles) are
  born in the repo and are NOT this skill's job: they belong to `remember-people`.

## Notion targets

Set your own database data-source ids in `config.local.yml` and read them here:

```yaml
notion:
  people_datasource: "collection://<your People data-source id>"
  companies_datasource: "collection://<your Companies data-source id>"
```

Always fetch the data source first to read its live schema (property names + types). Map only
to properties that exist; never invent a property.

## Flow: reconcile (per type, people then companies)

1. **List the graph side.** Every `data/people/<slug>.md` (and `data/companies/<slug>.md`).
2. **List the Notion side.** Query the People (then Companies) data source; build a match key
   from the title (name) + any aliases.
3. **Match** each repo node to a Notion row by name / alias (fuzzy, case-insensitive). Resolve
   before creating, never fork a duplicate. Three outcomes:
   - **Match found, repo has no `notion_url`:** write the Notion page url into the repo node's
     frontmatter (`notion_url:`). Pull down canonical fields that are empty in the repo
     (company, role, city): enrich, never overwrite a value the repo already has.
   - **No match (missing in Notion):** CREATE the Notion page (see guardrails), then write its
     url back into the repo node as `notion_url:`. This is create-on-first-mention, in pair.
   - **In Notion, not in repo:** out of scope here (the repo mirror grows from the stream via
     remember-people, not by pulling all of Notion down).

## Create guardrails (important: this writes to your system of record)

- **Only** the People and Companies databases. Never touch Finance, Health, Documents, Goals,
  or any other surface.
- **Minimal fields only** on create: the title (full name), and, only if a clean property
  exists and the repo node has the value, `role` (job title text), `company` (relation, if the
  company row exists), and a link (LinkedIn / site). Leave everything else blank.
- **Never overwrite** an existing Notion value. Create-or-enrich-blank only.
- **Never delete** or archive a Notion row.
- **In pair, always:** a Notion create must be followed by writing `notion_url:` back into the
  repo node. Never create one side without the other.
- **The wall:** never copy sensitive personal content (health, money, legal, dating, gossip)
  from `data/` into Notion. Only the flat identity fields above. The rich private detail stays
  in the repo, gitignored.

## When it runs

Daily, right after the `remember-people` sweep (so it reconciles the people that sweep just
created / updated). Also on demand. Idempotent and fail-soft: if Notion is unreachable, log
what you could not reconcile and move on; never crash the run, never double-create.

## Report

End with a one-line count: people / companies matched, urls backfilled, created in Notion,
skipped (and why).
