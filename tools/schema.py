"""Frontmatter schema per node type: which top-level keys a node of each type may carry.

Documented in LEGEND.md, section 1b; keep the two in sync. Built from what a real graph uses
(template, LEGEND, the tools that read a key, and keys used by 3+ nodes with one meaning), not
from theory.

The lint (`tools/checks.py`) reports, as SOFT findings only (never mechanical, never in the
gap register, never auto-fixed):
  frontmatter-divergent-field  a key that duplicates a schema key under another name
                               (`born:` / `age:` next to `birthday`): say which key to use
  frontmatter-unknown-field    a key no schema lists (a one-off like `bank:` or `diet:`)
Nothing rewrites node data because of this file. Moving a value to the schema key is a sweep
decision made by hand, with the value kept exactly (unknown stays UNKNOWN).

To allow a new key: add it here and to LEGEND.md 1b in the same commit.
"""

from graph import RULES, SYMMETRIC, EDGE_DATES_KEY

# keys every node type may carry
COMMON = {"name", "aliases", "type", "notion_url", "external_node", EDGE_DATES_KEY}


def _edge_fields(node_type):
    """Forward fields of this type plus the reverse fields other types write onto it."""
    out = {f for s, f, _, _ in RULES if s == node_type}
    out |= {r for _, _, t, r in RULES if t == node_type}
    if node_type == "people":
        out |= set(SYMMETRIC)
    return out


SCHEMA = {
    "people": {
        # skills/remember-people/templates/person.md
        "name", "relationship", "company", "role", "first_met", "cadence", "birthday", "family",
        "interests", "sensitive_topics", "comms_style", "links",
        # contacts and provenance (sweeps, tools/merge.py)
        "phone", "whatsapp_lid", "notion_duplicate",
        # LEGEND 4: known-but-unnamed people are recorded as text gaps
        "partner", "children",
        # legacy, tracked by the lint as `based-not-linked`; `origin` = where they are from
        "based", "origin",
    },
    "companies": {"hq", "sector", "website", "domain"},
    "places": set(),
    "passions": set(),
    "cities": {"country"},
    "terms": set(),
    "groups": {"city"},
    "bonds": set(),
    "roles": set(),
    "events": {"date", "start", "end"},
    "media": {"format", "show", "by", "url", "date", "about"},
}
for _t in SCHEMA:
    SCHEMA[_t] |= COMMON | _edge_fields(_t)

# keys that say the same thing as a schema key under another name: key -> what to use instead
DIVERGENT = {
    "people": {
        "born": "birthday (YYYY-MM-DD, MM-DD; a year alone goes in a comment)",
        "age": "birthday (an age goes stale; keep it as a dated comment)",
        "mail": "links: email",
        "email": "links: email",
        "whatsapp": "whatsapp_lid / phone",
        "phone_work": "phone or links (a second number with a comment)",
        "location": "lives_in (city edge), or based until the city node exists",
        "city_note": "lives_in (city edge), or based until the city node exists",
        "surname": "name (NAME UNKNOWN goes in the gap, LEGEND 4)",
    },
    "terms": {
        "people": "no edge rule for terms -> people (LEGEND 2): link them in the body, or propose a rule",
    },
    "events": {
        "end_date": "end",
        "slug": "nothing: the file name is the slug",
    },
}


def check_node(node):
    """[(kind, key, hint)] for every key of `node` outside its type's schema."""
    allowed = SCHEMA.get(node.type)
    if allowed is None:
        return []
    out = []
    seen = set()
    for e in node.entries:
        k = e.get("key")
        if not k or k in seen or k in allowed:
            continue
        seen.add(k)
        hint = DIVERGENT.get(node.type, {}).get(k)
        if hint:
            out.append(("frontmatter-divergent-field", k, hint))
        else:
            out.append(("frontmatter-unknown-field", k, ""))
    return out
