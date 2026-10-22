#!/usr/bin/env python3
"""Rebuild missing work follow-up digests from interaction files already in the graph.

    python3 tools/rebuild_followups.py                      # every swept day with no digest
    python3 tools/rebuild_followups.py 2026-06-15 2026-06-16  # only these days
    python3 tools/rebuild_followups.py --from 2026-06-01 --to 2026-06-30

Some days get swept — the interactions exist — but no data/_followups/<date>.md is ever written.
Nothing is re-read from the stream; this only regroups the `## Follow-ups` sections the sweeps
already wrote, applies the wall, and puts what the owner owes first. An existing digest is never
overwritten.

THE WALL. Nothing personal leaves data/ into the work digest. A person is kept out when:
  - it is the owner (`_me`, or `owner_slug` in config.local.yml)
  - their node says so: `wall: personal` (also `private` / `true` / `yes`) in the frontmatter
  - their `relationship:` is one of the personal bonds — default family, partner, ex, dating;
    replace the list with `wall.bonds: "family, partner, ex"` in config.local.yml
  - their slug is listed in `wall.exclude_slugs` in config.local.yml
and a single follow-up is dropped when it matches a sensitive word (compensation, legal, health,
dating, family, money); extend that with `wall.sensitive_words: "word, word"`.
"""
import datetime
import glob
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402
from graph import Node  # noqa: E402

PERSONAL_BONDS = {b.lower() for b in config.get_list(
    "wall.bonds", ("family", "partner", "ex", "dating"))}
WALL_VALUES = {"personal", "private", "true", "yes"}

BASE_SENSITIVE = (r"equity|stock option|cap.?table|salar|compensation|bonus|"
                  r"fired|firing|layoff|resign|dismiss|lawyer|attorney|legal|lawsuit|court|"
                  r"health|therapy|therap|doctor|medical|diagnos|illness|sick|"
                  r"dating|girlfriend|boyfriend|wife|husband|family|divorc|"
                  r"rent|mortgage|loan|debt|bank transfer")
EXTRA = [re.escape(w) for w in config.get_list("wall.sensitive_words")]
SENSITIVE_WORDS = re.compile(r"\b(%s)" % "|".join([BASE_SENSITIVE] + EXTRA), re.I)

OWNER = config.owner()
_names = [re.escape(config.owner_first())] if OWNER != "the owner" else []
# "<first name>: send the deck", "<first name> + team: ...", "I owe them the deck"
OWES = re.compile(r"\bI owe\b" + "".join(r"|\b%s\b\s*[:+]" % n for n in _names), re.I)


def walled():
    """Every person slug the wall keeps out of the work digest, read from the graph itself."""
    out = set(config.owner_slugs()) | {s.lower() for s in config.get_list("wall.exclude_slugs")}
    for p in glob.glob(os.path.join("data", "people", "*.md")):
        n = Node(p, open(p, encoding="utf8", errors="ignore").read())
        if str(n.get("wall") or "").strip().strip("\"'").lower() in WALL_VALUES:
            out.add(n.slug)
        elif PERSONAL_BONDS & {b.lower() for b in n.link_list("relationship")}:
            out.add(n.slug)
    return out


def follow_ups(path):
    """Return whole bullets, continuation lines included.

    Sweeps often write follow-ups as wrapped multi-line bullets. Taking only the first physical
    line cuts them mid-sentence, which is how a first version of this rebuild silently mangled
    every recent day.
    """
    s = open(path, encoding="utf8", errors="ignore").read()
    m = re.search(r"## Follow-ups\n(.*?)(?=\n## |\Z)", s, re.S)
    if not m:
        return []
    out, cur = [], None
    for line in m.group(1).split("\n"):
        if re.match(r"^\s*-\s*\[.\]", line):
            if cur:
                out.append(cur)
            cur = re.sub(r"^\s*-\s*\[.\]\s*", "", line).rstrip()
        elif cur is not None and line.strip() and line.startswith((" ", "\t")):
            cur += " " + line.strip()
        elif cur is not None and not line.strip():
            out.append(cur)
            cur = None
    if cur:
        out.append(cur)
    clean = []
    for b in out:
        b = re.sub(r"\s+", " ", b).strip()
        low = b.lower().lstrip("*_ ")
        if not b or low.startswith("(none") or low.startswith("nothing owed") \
           or low.startswith("nothing to do") or low.startswith("none recoverable") \
           or low.startswith("nothing recoverable") or low.startswith("none —") \
           or low.startswith("(historical) none") or low.startswith("none."):
            continue
        clean.append(b)
    return clean


def build(date, wall):
    people = []
    for p in sorted(glob.glob(os.path.join("data", "interactions", "*", "%s.md" % date))):
        slug = p.split(os.sep)[2]
        if slug in wall:
            continue
        items = [i for i in follow_ups(p) if not SENSITIVE_WORDS.search(i)]
        if items:
            people.append((slug, items))
    if not people:
        return None

    owed, rest = [], []
    for slug, items in people:
        keep = []
        for i in items:
            (owed if OWES.search(i) else keep).append((slug, i))
        if keep:
            rest.append((slug, [t for _, t in keep]))

    L = ["# Work follow-ups — %s (rebuilt %s)" % (date, datetime.date.today().isoformat()), ""]
    L.append("Reconstructed from the interaction files this day already had; the sweep ran but never wrote")
    L.append("its digest. Nothing re-read from the stream. Personal, legal, health and compensation threads")
    L.append("are excluded by the wall and stay only on the people's own nodes.")
    L.append("")
    if owed:
        L.append("## %s owes" % (OWNER if OWNER != "the owner" else "I"))
        L.append("")
        for slug, item in owed:
            L.append("- [ ] %s  → [[%s]]" % (item, slug))
        L.append("")
    for slug, items in rest:
        L.append("## [[%s]]" % slug)
        L.append("")
        for i in items:
            L.append("- [ ] %s" % i)
        L.append("")
    return "\n".join(L).rstrip() + "\n"


def swept_days():
    out = set()
    for p in glob.glob(os.path.join("data", "interactions", "*", "*.md")):
        m = re.match(r"^(\d{4}-\d{2}-\d{2})\.md$", os.path.basename(p))
        if m:
            out.add(m.group(1))
    return sorted(out)


def main():
    config.chdir_repo()
    args = sys.argv[1:]
    lo = args[args.index("--from") + 1] if "--from" in args else None
    hi = args[args.index("--to") + 1] if "--to" in args else None
    explicit = [a for a in args if re.match(r"^\d{4}-\d{2}-\d{2}$", a) and a not in (lo, hi)]
    dates = explicit or [d for d in swept_days()
                         if (not lo or d >= lo) and (not hi or d <= hi)]
    if not dates:
        print("no swept days to rebuild (no data/interactions/*/YYYY-MM-DD.md).")
        return
    wall = walled()
    written = 0
    for d in dates:
        p = os.path.join("data", "_followups", "%s.md" % d)
        if os.path.exists(p):
            if explicit:
                print("exists, skipped:", d)
            continue
        text = build(d, wall)
        if text is None:
            print("no work content, no file:", d)
            continue
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf8") as fh:
            fh.write(text)
        written += 1
        print("wrote", p)
    print("digests written:", written)


if __name__ == "__main__":
    main()
