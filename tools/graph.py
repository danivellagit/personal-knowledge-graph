"""Frontmatter + edge primitives for the knowledge graph.

Deliberately dependency-free (no PyYAML on this machine) and deliberately conservative:
it does line-surgery on the frontmatter instead of re-serialising it, so any key it does
not manage comes out byte-identical. Comments survive.

The graph shape it knows about lives in LEGEND.md — keep the two in sync.

Dated edges (LEGEND.md section 2b): an edge can carry optional `since` /
`until` in a separate nested map, so a past job or relation is closed instead of rewritten as
"(ex-Northwind)" prose. The edge itself stays in its link list (reverse edges and lint unchanged):

    works_at:
      - "[[northwind]]"
    edge_dates:
      works_at:
        "[[northwind]]": {since: 2018-03, until: 2021-06}

Dates are YYYY, YYYY-MM or YYYY-MM-DD; `until: UNKNOWN` means "ended, date unknown". An edge
with no entry is simply undated (current, as before). CLI:

    python3 tools/graph.py dates <slug>                       # list the dated edges of a node
    python3 tools/graph.py date <slug> <field> <target> [--since D] [--until D] [--note TEXT]
    python3 tools/graph.py undate <slug> <field> <target>     # remove the dates, keep the edge
    python3 tools/graph.py current <slug> <field> [--on YYYY-MM-DD]   # links current on a day
"""

import datetime
import os
import re
import sys

DATA = "data"

# node types that are directories under data/
NODE_DIRS = [
    "people", "companies", "places", "passions", "cities",
    "terms", "groups", "bonds", "roles", "events", "media",
]

# Edge rules: (source type, forward field, expected target type, reverse field on target).
# Type-aware on purpose. `people` and `events` are reused as field names by several node
# types with DIFFERENT meanings (`people` on a passion reverses to `into`, `people` on an
# event reverses to `events`), so a flat field->field map silently writes the wrong reverse.
RULES = [
    ("people", "lives_in",     "cities",    "residents"),
    ("people", "works_at",     "companies", "people"),
    ("people", "into",         "passions",  "people"),
    ("people", "frequents",    "places",    "regulars"),
    ("people", "member_of",    "groups",    "members"),
    ("people", "relationship", "bonds",     "people"),
    ("people", "role_type",    "roles",     "people"),
    ("people", "introduced_by", "people",   "introduced"),
    ("people", "introduced",   "people",    "introduced_by"),
    ("people", "mentors",      "people",    "mentored_by"),
    ("people", "mentored_by",  "people",    "mentors"),
    ("people", "featured_in",  "media",     "features"),
    ("people", "events",       "events",    "people"),

    ("companies", "people",    "people",    "works_at"),
    ("passions",  "people",    "people",    "into"),
    ("bonds",     "people",    "people",    "relationship"),
    ("roles",     "people",    "people",    "role_type"),
    ("groups",    "members",   "people",    "member_of"),
    ("cities",    "residents", "people",    "lives_in"),
    ("places",    "regulars",  "people",    "frequents"),
    ("media",     "features",  "people",    "featured_in"),

    ("places", "in_city",      "cities",    "places"),
    ("cities", "places",       "places",    "in_city"),

    ("events", "people",       "people",    "events"),
    ("events", "city",         "cities",    "events"),
    ("events", "place",        "places",    "events"),
    ("events", "groups",       "groups",    "events"),
    ("cities", "events",       "events",    "city"),
    ("places", "events",       "events",    "place"),
    ("groups", "events",       "events",    "groups"),
]

# quick lookup: (source type, field) -> (target type, reverse field)
RULE_MAP = {(s, f): (tt, r) for s, f, tt, r in RULES}

# fields that carry edges, for shape checks
EDGE_FIELDS = sorted({f for _, f, _, _ in RULES})

# fields that mean the same thing on both ends
SYMMETRIC = ["knows", "colleagues", "family", "partner_of"]

# every field we are allowed to rewrite (normalise / dedup / extend)
MANAGED = sorted(set(
    [f for _, f, _, _ in RULES] + [r for _, _, _, r in RULES] + SYMMETRIC
))

# generated body sections: field -> heading
BODY_SECTIONS = {
    "people": "People",
    "residents": "Residents",
    "members": "Members",
    "regulars": "Regulars",
}
BODY_MARKER = "_Seen via profiles (data/people)._"

LINK_RE = re.compile(r"\[\[([^\]|#]+)")

# dated edges (LEGEND.md section 2b)
EDGE_DATES_KEY = "edge_dates"
EDGE_DATE_ATTRS = ("since", "until", "note")
EDGE_DATE_RE = re.compile(r"^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$")
UNKNOWN = "UNKNOWN"


def _split_flow(inner):
    """Split the inside of a one-line flow map on commas outside quotes."""
    parts, buf, q, esc = [], "", None, False
    for ch in inner:
        if q:
            buf += ch
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == q:
                q = None
            continue
        if ch in "\"'":
            q = ch
            buf += ch
            continue
        if ch == ",":
            parts.append(buf)
            buf = ""
            continue
        buf += ch
    if buf.strip():
        parts.append(buf)
    return parts


def _unquote(v):
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        v = v[1:-1]
        if v and '\\"' in v:
            v = v.replace('\\"', '"')
    return v


def parse_flow_map(text):
    """`{since: 2018-03, until: "2021"}` -> dict, or None when it is not a one-line flow map."""
    t = text.strip()
    if not (t.startswith("{") and t.endswith("}")):
        return None
    out = {}
    for part in _split_flow(t[1:-1]):
        if ":" not in part:
            return None
        k, v = part.split(":", 1)
        out[k.strip()] = _unquote(v)
    return out


def date_key(d, end=False):
    """A partial date as a comparable (y, m, d); `end` takes the last day of a partial range."""
    p = [int(x) for x in d.split("-")]
    if len(p) == 1:
        p += [12, 31] if end else [1, 1]
    elif len(p) == 2:
        p += [31] if end else [1]
    return tuple(p)


def _render_flow(attrs):
    bits = []
    for k in EDGE_DATE_ATTRS:
        if k not in attrs or attrs[k] in (None, ""):
            continue
        v = str(attrs[k])
        if k == "note" or not (EDGE_DATE_RE.match(v) or v == UNKNOWN):
            v = '"%s"' % v.replace('"', '\\"')
        bits.append("%s: %s" % (k, v))
    return "{%s}" % ", ".join(bits)


def split_comment(rest):
    """Split 'value   # note' into ('value', '   # note'), quote- and bracket-aware.

    A '#' only starts a comment when it is the first non-space character or is preceded by
    whitespace, and only outside quotes. Written by hand because a naive `(\\s+#.*)?$` regex
    lets the comment be swallowed as the value when the value is empty — which is how
    `knows: # note` came out as a scalar and orphaned its own list items.
    """
    quote = None
    for i, ch in enumerate(rest):
        if quote:
            if ch == quote:
                quote = None
            continue
        if ch in "\"'":
            quote = ch
            continue
        if ch == "#" and (i == 0 or rest[i - 1].isspace()):
            head = rest[:i]
            value = head.rstrip()
            spacing = head[len(value):] or " "
            return value, spacing + rest[i:].rstrip()
    return rest.rstrip(), ""


def links_of(value):
    """Every [[slug]] inside a parsed frontmatter value, in order."""
    out = []
    if value is None:
        return out
    items = value if isinstance(value, list) else [value]
    for it in items:
        for m in LINK_RE.findall(str(it)):
            out.append(m.strip())
    return out


class Node:
    """One markdown node file: ordered frontmatter entries + raw body."""

    def __init__(self, path, text):
        self.path = path
        self.slug = os.path.basename(path)[:-3]
        self.type = path.split(os.sep)[1] if os.sep in path else "?"
        self.entries = []      # list of dicts: key, kind, value, comment, items, raw
        self.body = text
        self.pre = ""
        self.issues = []
        self.dirty = False
        self._parse(text)

    # ---------- parsing ----------

    def _parse(self, text):
        m = re.match(r"^---\n(.*?)\n---\n?", text, re.S)
        if not m:
            self.issues.append("no frontmatter")
            return
        self.body = text[m.end():]
        self.pre = "---\n"
        cur = None
        for line in m.group(1).split("\n"):
            if not line.strip():
                if cur and cur["kind"] == "block":
                    cur = None
                self.entries.append({"key": None, "kind": "raw", "raw": line})
                continue
            if re.match(r"^\s*#", line):
                self.entries.append({"key": None, "kind": "raw", "raw": line})
                continue
            mi = re.match(r"^(\s*)-\s*(.*)$", line)
            if mi:
                indent = len(mi.group(1))
                item_val, item_comment = split_comment(mi.group(2))
                if cur is None or cur["kind"] != "block":
                    self.issues.append("orphan list item: " + line.strip()[:60])
                    self.entries.append({"key": None, "kind": "raw", "raw": line})
                    continue
                if cur["indent"] is None:
                    cur["indent"] = indent
                elif indent != cur["indent"]:
                    self.issues.append(
                        "inconsistent list indent (%d vs %d): %s"
                        % (indent, cur["indent"], line.strip()[:60])
                    )
                cur["items"].append({"value": item_val, "comment": item_comment})
                continue
            mk = re.match(r"^([A-Za-z_][\w\-]*):(.*)$", line)
            if mk:
                key = mk.group(1)
                val, comment = split_comment(mk.group(2))
                val = val.strip()
                if any(e.get("key") == key for e in self.entries):
                    self.issues.append("duplicate key: " + key)
                if val == "":
                    cur = {"key": key, "kind": "block", "items": [], "comment": comment,
                           "indent": None}
                    self.entries.append(cur)
                else:
                    self.entries.append({"key": key, "kind": "scalar", "value": val,
                                         "comment": comment})
                    cur = None
                continue
            # nested map line or anything else: keep verbatim
            self.entries.append({"key": None, "kind": "raw", "raw": line})

    # ---------- reading ----------

    def get(self, key):
        """Parsed value: list for lists, string for scalars, None if absent."""
        for e in self.entries:
            if e.get("key") != key:
                continue
            if e["kind"] == "block":
                return [i["value"] for i in e["items"]]
            v = e["value"]
            if v.startswith("["):
                return [x.strip().strip("\"'") for x in v[1:-1].split(",") if x.strip()]
            if v in ("null", "~"):
                return None
            return v
        return None

    def link_list(self, key):
        return links_of(self.get(key))

    def has_link(self, key, slug):
        return slug in self.link_list(key)

    # ---------- dated edges ----------

    def _edge_dates_span(self):
        """(index of the `edge_dates` entry, index after its last nested line) or (None, None)."""
        for i, e in enumerate(self.entries):
            if e.get("key") == EDGE_DATES_KEY:
                j = i + 1
                while j < len(self.entries):
                    x = self.entries[j]
                    if x["kind"] == "raw" and x["raw"][:1] in (" ", "\t") and x["raw"].strip():
                        j += 1
                        continue
                    break
                return i, j
        return None, None

    def edge_dates_raw(self):
        """[(field, target slug or raw key, attrs dict or None, raw line)] in file order."""
        i, j = self._edge_dates_span()
        out = []
        if i is None:
            return out
        field = None
        for x in self.entries[i + 1:j]:
            line = x["raw"]
            indent = len(line) - len(line.lstrip())
            body, _ = split_comment(line.strip())
            if body.startswith("#") or not body:
                continue
            mf = re.match(r"^([A-Za-z_][\w\-]*):\s*$", body)
            if indent <= 2 and mf:
                field = mf.group(1)
                continue
            mi = re.match(r"^(\"[^\"]*\"|'[^']*'|[^:]+):\s*(.*)$", body)
            if not mi:
                out.append((field, None, None, line))
                continue
            key = _unquote(mi.group(1))
            ls = links_of(key)
            out.append((field, ls[0] if ls else key, parse_flow_map(mi.group(2)), line))
        return out

    def edge_dates(self):
        """{(field, target): {"since": .., "until": .., "note": ..}} for every well-formed entry."""
        return {(f, t): a for f, t, a, _ in self.edge_dates_raw() if f and t and a is not None}

    def edge_date_problems(self):
        """Shape problems of the `edge_dates` map, as text (empty list = fine)."""
        probs = []
        e = next((x for x in self.entries if x.get("key") == EDGE_DATES_KEY), None)
        if e is None:
            return probs
        if e["kind"] != "block" or e["items"]:
            return ["edge_dates must be a nested map (field -> \"[[target]]\": {since, until})"]
        seen = set()
        for field, target, attrs, line in self.edge_dates_raw():
            where = line.strip()[:60]
            if field is None:
                probs.append("edge_dates entry outside a field: %s" % where)
                continue
            if attrs is None:
                probs.append("edge_dates entry is not `\"[[slug]]\": {since: .., until: ..}`: %s" % where)
                continue
            if (field, target) in seen:
                probs.append("edge_dates duplicate entry %s -> %s" % (field, target))
            seen.add((field, target))
            if target not in self.link_list(field):
                probs.append("edge_dates %s -> [[%s]] but %s has no such link" % (field, target, field))
            bad = sorted(set(attrs) - set(EDGE_DATE_ATTRS))
            if bad:
                probs.append("edge_dates %s -> %s: unknown attribute %s" % (field, target, ", ".join(bad)))
            if not attrs.get("since") and not attrs.get("until"):
                probs.append("edge_dates %s -> %s: neither since nor until" % (field, target))
            for k in ("since", "until"):
                v = attrs.get(k)
                if v and not (EDGE_DATE_RE.match(v) or v == UNKNOWN):
                    probs.append("edge_dates %s -> %s: %s '%s' is not YYYY[-MM[-DD]] or UNKNOWN"
                                 % (field, target, k, v))
            s_, u_ = attrs.get("since"), attrs.get("until")
            if s_ and u_ and EDGE_DATE_RE.match(s_) and EDGE_DATE_RE.match(u_) \
                    and date_key(s_) > date_key(u_, end=True):
                probs.append("edge_dates %s -> %s: since %s is after until %s" % (field, target, s_, u_))
        return probs

    def edge_is_current(self, field, target, on=None):
        """True unless the edge's dates say it was not active on `on` (default today).

        Undated edges are current (backward compatible). `until: UNKNOWN` = ended.
        """
        a = self.edge_dates().get((field, target))
        if not a:
            return True
        on = on or datetime.date.today()
        day = (on.year, on.month, on.day)
        u, s_ = a.get("until"), a.get("since")
        if u == UNKNOWN:
            return False
        if u and EDGE_DATE_RE.match(u) and day > date_key(u, end=True):
            return False
        if s_ and EDGE_DATE_RE.match(s_) and day < date_key(s_):
            return False
        return True

    def current_links(self, field, on=None):
        return [t for t in self.link_list(field) if self.edge_is_current(field, t, on)]

    def past_links(self, field, on=None):
        return [t for t in self.link_list(field) if not self.edge_is_current(field, t, on)]

    def set_edge_dates(self, field, target, since=None, until=None, note=None):
        """Create/replace the dates of one existing edge; all three None removes the entry.

        Rewrites only the `edge_dates` block, sorted by field then target. Never touches the
        link list itself: the edge must already exist (add it with add_link first).
        """
        if target not in self.link_list(field):
            raise ValueError("%s has no %s -> [[%s]] edge to date" % (self.slug, field, target))
        for k, v in (("since", since), ("until", until)):
            if v and not (EDGE_DATE_RE.match(v) or v == UNKNOWN):
                raise ValueError("%s '%s' is not YYYY[-MM[-DD]] or UNKNOWN" % (k, v))
        cur = {}
        for f, t, a, line in self.edge_dates_raw():
            if f and t and a is not None:
                cur[(f, t)] = a
            else:
                raise ValueError("%s: edge_dates has a malformed line, fix it first: %s"
                                 % (self.path, line.strip()))
        if since is None and until is None and note is None:
            cur.pop((field, target), None)
        else:
            cur[(field, target)] = {"since": since, "until": until, "note": note}
        i, j = self._edge_dates_span()
        keep_comment = self.entries[i].get("comment", "") if i is not None else ""
        if i is not None:
            del self.entries[i:j]
        else:
            i = len(self.entries)
            while i > 0 and self.entries[i - 1]["kind"] == "raw" and not self.entries[i - 1]["raw"].strip():
                i -= 1
        if cur:
            new = [{"key": EDGE_DATES_KEY, "kind": "block", "items": [], "comment": keep_comment,
                    "indent": 2}]
            for f in sorted({f for f, _ in cur}):
                new.append({"key": None, "kind": "raw", "raw": "  %s:" % f})
                for (f2, t) in sorted(k for k in cur if k[0] == f):
                    new.append({"key": None, "kind": "raw",
                                "raw": '    "[[%s]]": %s' % (t, _render_flow(cur[(f2, t)]))})
            self.entries[i:i] = new
        self.dirty = True
        return True

    # ---------- writing ----------

    def set_links(self, key, slugs, comment=""):
        """Replace/create a link-list field, normalised: block style, deduped, sorted."""
        slugs = sorted(dict.fromkeys(slugs))
        items = [{"value": '"[[%s]]"' % s, "comment": ""} for s in slugs]
        for e in self.entries:
            if e.get("key") == key:
                keep = e.get("comment", "")
                # preserve per-item comments by slug
                old = {}
                if e["kind"] == "block":
                    for i in e["items"]:
                        for s in links_of(i["value"]):
                            if i["comment"]:
                                old[s] = i["comment"]
                for i in items:
                    for s in links_of(i["value"]):
                        if s in old:
                            i["comment"] = old[s]
                e.clear()
                e.update({"key": key, "kind": "block", "items": items,
                          "comment": comment or keep, "indent": 2})
                self.dirty = True
                return
        self.entries.append({"key": key, "kind": "block", "items": items,
                             "comment": comment, "indent": 2})
        self.dirty = True

    def add_link(self, key, slug, comment=""):
        cur = self.link_list(key)
        if slug in cur:
            return False
        self.set_links(key, cur + [slug], comment)
        return True

    def clear_key(self, key):
        """Leave the key present but empty (`at:`), so the template shape survives."""
        for e in self.entries:
            if e.get("key") == key:
                if e["kind"] == "block" and not e["items"]:
                    return False
                e.clear()
                e.update({"key": key, "kind": "block", "items": [], "comment": "", "indent": 2})
                self.dirty = True
                return True
        return False

    def normalise_managed(self):
        """Rewrite every managed link field in canonical form (dedup + block style)."""
        for e in list(self.entries):
            key = e.get("key")
            if key not in MANAGED:
                continue
            val = self.get(key)
            ls = links_of(val)
            if not ls:
                continue
            if key == "aliases":
                continue
            before = (e["kind"], [i["value"] for i in e["items"]] if e["kind"] == "block" else e.get("value"))
            self.set_links(key, ls)
            after = [i["value"] for i in self.entries[[x.get("key") for x in self.entries].index(key)]["items"]]
            if before[0] != "block" or before[1] != after:
                self.dirty = True

    def render_frontmatter(self):
        out = []
        for e in self.entries:
            if e["kind"] == "raw":
                out.append(e["raw"])
            elif e["kind"] == "scalar":
                out.append("%s: %s%s" % (e["key"], e["value"], e.get("comment", "")))
            else:
                indent = e.get("indent") or 2
                if not e["items"]:
                    # A bare `key:` stays bare. It may be an unset scalar (`birthday:`) or the
                    # header of a nested map whose lines we kept verbatim (`links:` + indented
                    # `email:`). Writing `[]` here would corrupt both.
                    out.append("%s:%s" % (e["key"], e.get("comment", "")))
                    continue
                out.append("%s:%s" % (e["key"], e.get("comment", "")))
                for i in e["items"]:
                    out.append("%s- %s%s" % (" " * indent, i["value"], i["comment"]))
        return "---\n" + "\n".join(out) + "\n---\n"

    def sync_body_lists(self):
        """Regenerate the '## People' style body list from the frontmatter it mirrors."""
        changed = False
        for field, heading in BODY_SECTIONS.items():
            ls = self.link_list(field)
            if not ls:
                continue
            pat = re.compile(
                r"(^## %s\n)(?:[ \t]*-[^\n]*\n|\n)*" % re.escape(heading), re.M)
            m = pat.search(self.body)
            if not m:
                continue
            new = m.group(1) + "".join("- [[%s]]\n" % s for s in sorted(ls))
            if self.body[m.start():m.end()] != new:
                self.body = self.body[:m.start()] + new + self.body[m.end():]
                changed = True
        if changed:
            self.dirty = True
        return changed

    def write(self):
        """Write, then re-read and refuse to leave a file we just broke.

        The check is cheap and it is the whole reason this module exists: the hand-run repair
        of 2026-08-01 corrupted three hub nodes precisely because nothing re-read them.
        """
        text = self.render_frontmatter() + self.body
        if os.path.exists(self.path):
            with open(self.path, encoding="utf8", errors="ignore") as fh:
                if fh.read() == text:
                    self.dirty = False
                    return False       # nothing to do; don't touch the mtime
        with open(self.path, "w", encoding="utf8") as fh:
            fh.write(text)
        back = Node(self.path, text)
        if back.issues:
            raise RuntimeError("write broke %s: %s" % (self.path, "; ".join(back.issues)))
        if back.render_frontmatter() != self.render_frontmatter():
            raise RuntimeError("write is not idempotent for %s" % self.path)
        for e in self.entries:
            k = e.get("key")
            if k and k in MANAGED and sorted(links_of(self.get(k))) != sorted(links_of(back.get(k))):
                raise RuntimeError("write lost edges in %s :: %s" % (self.path, k))
        if self.edge_dates() != back.edge_dates():
            raise RuntimeError("write lost edge dates in %s" % self.path)
        self.dirty = False
        return True


def load_nodes(root=DATA):
    nodes = {}
    for d in NODE_DIRS:
        p = os.path.join(root, d)
        if not os.path.isdir(p):
            continue
        for f in sorted(os.listdir(p)):
            if not f.endswith(".md"):
                continue
            fp = os.path.join(p, f)
            nodes[f[:-3]] = Node(fp, open(fp, encoding="utf8", errors="ignore").read())
    return nodes


def load_body(root=DATA):
    """Every body day (data/body/body-YYYY-MM-DD.md) as a Node. Written by tools/body.py."""
    out = []
    base = os.path.join(root, "body")
    if not os.path.isdir(base):
        return out
    for f in sorted(os.listdir(base)):
        if re.match(r"^body-\d{4}-\d\d-\d\d\.md$", f):
            fp = os.path.join(base, f)
            n = Node(fp, open(fp, encoding="utf8", errors="ignore").read())
            n.date = f[5:15]
            out.append(n)
    return out


def load_interactions(root=DATA):
    """Every interaction file as a Node (slug = person/date)."""
    out = []
    base = os.path.join(root, "interactions")
    if not os.path.isdir(base):
        return out
    for person in sorted(os.listdir(base)):
        d = os.path.join(base, person)
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if not f.endswith(".md"):
                continue
            fp = os.path.join(d, f)
            n = Node(fp, open(fp, encoding="utf8", errors="ignore").read())
            n.person = person
            n.date = f[:-3]
            out.append(n)
    return out


# ---------------------------------------------------------------------- CLI (dated edges)

def _cli(argv):
    import argparse
    ap = argparse.ArgumentParser(prog="tools/graph.py", description="Dated edges (LEGEND.md 2b).")
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("dates", help="list the dated edges of a node")
    a.add_argument("slug")
    a = sub.add_parser("date", help="set since/until on an existing edge")
    a.add_argument("slug"); a.add_argument("field"); a.add_argument("target")
    a.add_argument("--since"); a.add_argument("--until"); a.add_argument("--note")
    a.add_argument("--dry-run", action="store_true")
    a = sub.add_parser("undate", help="remove the dates of an edge (the edge stays)")
    a.add_argument("slug"); a.add_argument("field"); a.add_argument("target")
    a.add_argument("--dry-run", action="store_true")
    a = sub.add_parser("current", help="links of a field current on a day")
    a.add_argument("slug"); a.add_argument("field"); a.add_argument("--on")
    args = ap.parse_args(argv)

    nodes = load_nodes()
    n = nodes.get(args.slug)
    if n is None:
        print("no node %s under data/" % args.slug, file=sys.stderr)
        return 2
    if args.cmd == "dates":
        for (f, t), at in sorted(n.edge_dates().items()):
            print("%s -> [[%s]]  %s%s" % (f, t, _render_flow(at),
                                          "" if n.edge_is_current(f, t) else "  (past)"))
        for p_ in n.edge_date_problems():
            print("PROBLEM: " + p_)
        return 1 if n.edge_date_problems() else 0
    if args.cmd == "current":
        on = datetime.date.fromisoformat(args.on) if args.on else None
        for t in n.current_links(args.field, on):
            print(t)
        return 0
    if args.cmd == "date" and not (args.since or args.until):
        print("give --since and/or --until (YYYY, YYYY-MM, YYYY-MM-DD, or UNKNOWN)", file=sys.stderr)
        return 2
    try:
        if args.cmd == "date":
            n.set_edge_dates(args.field, args.target, args.since, args.until, args.note)
        else:
            n.set_edge_dates(args.field, args.target)
    except ValueError as e:
        print("refused: %s" % e, file=sys.stderr)
        return 2
    if args.dry_run:
        sys.stdout.write(n.render_frontmatter())
        return 0
    n.write()
    print("%s: %s -> [[%s]] %s" % (n.path, args.field, args.target,
                                   _render_flow(n.edge_dates().get((args.field, args.target), {}))
                                   if args.cmd == "date" else "dates removed"))
    return 0


if __name__ == "__main__":
    sys.exit(_cli(sys.argv[1:]))
