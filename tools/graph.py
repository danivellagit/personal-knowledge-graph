"""Frontmatter + edge primitives for the knowledge graph.

Deliberately dependency-free (no PyYAML on this machine) and deliberately conservative:
it does line-surgery on the frontmatter instead of re-serialising it, so any key it does
not manage comes out byte-identical. Comments survive.

The graph shape it knows about lives in LEGEND.md — keep the two in sync.
"""

import os
import re

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
