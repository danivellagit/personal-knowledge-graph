#!/usr/bin/env python3
"""Rename a node's slug once its real name is known, keeping every link intact.

    python3 tools/rename.py <old-slug> <new-slug> [--name "Real Name"] [--why "..."] [--dry-run]

Placeholder slugs are made on purpose: the sweep has to file someone the day they appear, and
`man-from-gym` beats losing them. But once the real name arrives, the slug has to follow, or the
graph keeps a nickname as an identity — and the next fork starts exactly there
(`wren-globex` living next to `wren-hollis`).

What it does: moves the node file and the interaction directory, rewrites every inbound
`[[old]]` wiki-link across `data/`, keeps the old slug and the old display name as `aliases:`
so the previous spelling still resolves, and sets the new `name:` if given.

It does NOT touch Notion. If people are mirrored there (`notion_url:`), a renamed person needs
`notion-sync` to update the page title on its next run — the script prints the reminder.
"""

import os
import re
import sys
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from graph import Node, load_nodes  # noqa: E402
from config import chdir_repo  # noqa: E402
from merge import relink  # noqa: E402


def rename(old, new, name=None, why="", dry=False):
    nodes = load_nodes()
    if old not in nodes:
        raise SystemExit("no such node: " + old)
    if new in nodes:
        raise SystemExit("%s already exists — this is a merge, not a rename. Use tools/merge.py"
                         % new)
    n = nodes[old]
    log = []

    old_name = str(n.get("name") or "").strip('"')
    keep = [old] + ([old_name] if old_name else [])
    cur = [str(a).strip('"') for a in (n.get("aliases") or [])]
    aliases = cur + [k for k in keep if k and k not in cur]

    if not dry:
        value = "[%s]" % ", ".join(('"%s"' % v if re.search(r"[ ()@,]", v) else v) for v in aliases)
        if not any(e.get("key") == "aliases" for e in n.entries):
            n.entries.append({"key": "aliases", "kind": "scalar", "value": value, "comment": ""})
            n.dirty = True
        for e in n.entries:
            if e.get("key") == "aliases":
                e.update({"kind": "scalar", "value": value})
                e.pop("items", None)
                n.dirty = True
            elif e.get("key") == "name" and name:
                e.update({"kind": "scalar", "value": name if " " not in name else '"%s"' % name})
                n.dirty = True
        if why:
            n.body = n.body.rstrip() + "\n\n<!-- slug renamed %s -> %s: %s -->\n" % (old, new, why)
            n.dirty = True
        n.path = os.path.join("data", n.type, new + ".md")
        n.slug = new
        n.write()
        os.remove(os.path.join("data", n.type, old + ".md"))
    log.append("node: data/%s/%s.md -> data/%s/%s.md" % (n.type, old, n.type, new))
    if name:
        log.append("name: %r -> %r" % (old_name, name))
    log.append("aliases keep the old spellings: %s" % ", ".join(keep))

    src = os.path.join("data", "interactions", old)
    dst = os.path.join("data", "interactions", new)
    if os.path.isdir(src):
        if not dry:
            os.rename(src, dst)
        log.append("interactions: %s -> %s (%d files)"
                   % (src, dst, len([f for f in os.listdir(dst if not dry else src)
                                     if f.endswith(".md")])))

    # Carry the gap history across. Gap ids embed the slug (`loc:olmo`), so without this a
    # rename silently resets first_seen and the attempt log for every OTHER gap that person
    # still has — the register would look like the gaps were solved and new ones appeared.
    reg_path = os.path.join("data", "_gaps", "register.jsonl")
    if os.path.exists(reg_path):
        import json
        rows = [json.loads(l) for l in open(reg_path, encoding="utf8") if l.strip()]
        moved = 0
        for r in rows:
            parts = r["id"].split(":", 1)
            if len(parts) == 2 and old in re.split(r"[|]", parts[1]):
                r["id"] = parts[0] + ":" + re.sub(r"(^|(?<=\|))%s((?=\|)|$)" % re.escape(old),
                                                  new, parts[1])
                r.setdefault("renamed", []).append({"from": old, "to": new})
                if r.get("subject") == old:
                    r["subject"] = new
                r["question"] = r["question"].replace(old, new)
                moved += 1
        if moved and not dry:
            with open(reg_path, "w", encoding="utf8") as fh:
                for r in rows:
                    fh.write(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n")
        if moved:
            log.append("gap register: %d entr%s kept their history across the rename"
                       % (moved, "y" if moved == 1 else "ies"))

    touched = 0
    for dirpath, _d, files in os.walk("data"):
        if dirpath.endswith("_gaps"):
            continue
        for f in files:
            if not f.endswith(".md"):
                continue
            p = os.path.join(dirpath, f)
            t = open(p, encoding="utf8", errors="ignore").read()
            if relink(t, old, new) == t:
                continue
            if not dry:
                with open(p, "w", encoding="utf8") as fh:
                    fh.write(relink(t, old, new))
            touched += 1
    log.append("relinked %d file(s)" % touched)

    print("\n".join(log))
    print("\n%s %s -> %s" % ("DRY RUN:" if dry else "renamed", old, new))
    if not dry:
        if n.get("notion_url"):
            print("NOTE: Notion still shows the old title — notion-sync must update the page "
                  "on its next run (%s)" % n.get("notion_url"))
        print("now run:  python3 tools/lint.py --fix && python3 tools/lint.py")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("old")
    ap.add_argument("new")
    ap.add_argument("--name", help="the real display name")
    ap.add_argument("--why", default="", help="provenance, written into the node")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    chdir_repo()
    rename(a.old, a.new, a.name, a.why, a.dry_run)
