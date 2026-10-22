---
name: Tessa Marlowe
aliases: [Tessa, T. Marlowe]           # every spelling / nickname a source uses: dedup resolves through these
relationship:                          # list of [[bond]] links; a second one only if clearly warranted
  - "[[customer]]"
company: Acme Ltd
role: Head of Digital                  # free text; `role_type` carries the normalized node once it recurs
role_type:
  - "[[head-of-digital]]"
works_at:
  - "[[acme]]"
lives_in:
  - "[[lisbon]]"                       # an edge, not prose. Unknown -> leave bare, it is a gap
introduced_by:
  - "[[priya-halden]]"                 # stated once, never repeated: capture it the day they appear
knows:                                 # symmetric; co-presence on 2+ days with no other path
  - "[[jonah-whitlock]]"
into:
  - "[[sailing]]"
first_met: 2025-03-11
cadence: monthly                       # monthly | quarterly | ad-hoc
birthday: 06-14                        # MM-DD. Unknown -> leave the key bare, never []
partner: "NAME UNKNOWN (gap to chase) - architect, met at university"
family:
  - "Theo, son, 6, plays football"     # text: a detail, not a node; a node once they recur
interests: [sailing, Douro wine, chess]
sensitive_topics: ["2024 reorg (layoffs on her team)"]
comms_style: "direct, no small talk, likes numbers"
links:
  linkedin: https://www.linkedin.com/in/...
notion_url:                            # OPTIONAL, written by notion-sync if you use Notion
external_node: false                   # true if this person also exists in a configured source
---

# Tessa Marlowe

<!-- Every frontmatter link is QUOTED and written through tools/graph.py, never by hand.
     You write the forward edge; `tools/lint.py --fix` writes the reverse on the other node. -->

## Current state
<!-- working memory: the few live things the brief uses first. Rewritten on each rollup.
     Only facts and the owner's own words here: a read by the sweep never lands in this block. -->
- Last left off on: ...
- Open follow-ups: ...
- Open with next time: ...

## Who they are
<!-- semantic memory: stable summary that sharpens over time, not a meeting log. -->
One or two lines: who they are, why they matter to you, how you met and through whom.

## Personal
Partner, children, parents, close friends, where they are from, what they are going through.
Proper names, or an explicit NAME UNKNOWN gap.

## What matters to them
Work and life: the levers, the ambitions, the fears.

## History
Individual meetings live in `data/interactions/tessa-marlowe/`. Not repeated here.
