#!/usr/bin/env python3
"""Merge two person nodes that are the same human. `dedup before create`, enforced late.

    python3 tools/merge.py <loser-slug> <survivor-slug> --why "the evidence" [--dry-run]

It keeps happening, always the same shape: a first name saved as a nickname in one source
(`Tobi`, `Wren Globex`) forks into a second node that then accumulates its own interactions, its
own profile and its own Notion page. For example:

  - tobi-lisbon  -> tobia-rinaldi    same city, same shared dates
  - wren-globex  -> wren-hollis      same company, same phone

So it is a tool, not a one-off script. `tools/checks.py` detects the candidates
(`possible-duplicate`); this applies the merge without losing anything:

  - interactions move; when both nodes have the same date, BOTH are kept in one file with
    their own `source:` — they are usually different channels of the same day, not duplicates
  - every inbound `[[loser]]` wiki-link is relinked, across data/ including _followups
  - link fields are unioned; scalar fields prefer the survivor's value, and a genuine
    disagreement is written into the body as a conflict to resolve by hand, never silently
    dropped
  - the loser's name becomes an alias, so the old spelling still resolves
  - if both nodes are mirrored to Notion, the second page is recorded as `notion_duplicate:` —
    this tool never deletes anything there; merge the pages in Notion by hand

Nothing is deleted except the loser's now-empty node file.
"""

import os
import re
import sys
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from graph import Node, load_nodes, links_of, MANAGED  # noqa: E402
from config import chdir_repo  # noqa: E402

SCALAR_PREFER_SURVIVOR = {"name", "notion_url", "external_node"}
NEVER_MERGE = {"name", "notion_url"}


def relink(text, old, new):
    """Rewrite every wiki-link to `old` — plain, aliased `[[old|x]]`, heading `[[old#x]]`, and
    the path links the body layer uses for interactions, `[[interactions/old/2026-10-01]]`."""
    text = re.sub(r"\[\[%s(?=[\]|#\\])" % re.escape(old), lambda m: "[[" + new, text)
    return text.replace("[[interactions/%s/" % old, "[[interactions/%s/" % new)


def merge(loser, survivor, why, dry=False):
    nodes = load_nodes()
    if loser not in nodes or survivor not in nodes:
        raise SystemExit("both slugs must exist: %s, %s" % (loser, survivor))
    ln, sn = nodes[loser], nodes[survivor]
    if ln.type != "people" or sn.type != "people":
        raise SystemExit("merge is only for person nodes")
    log = []
    conflicts = []

    # ---------------------------------------------------------- interactions
    src = os.path.join("data", "interactions", loser)
    dst = os.path.join("data", "interactions", survivor)
    if os.path.isdir(src):
        os.makedirs(dst, exist_ok=True)
        for f in sorted(os.listdir(src)):
            if not f.endswith(".md"):
                continue
            sp, dp = os.path.join(src, f), os.path.join(dst, f)
            text = relink(open(sp, encoding="utf8").read(), loser, survivor)
            if dry:
                log.append("would %s %s" % ("merge into" if os.path.exists(dp) else "move to", dp))
                continue
            if os.path.exists(dp):
                old = Node(sp, text)
                keep = open(dp, encoding="utf8").read().rstrip() + "\n"
                body = re.sub(r"^---\n.*?\n---\n", "", text, flags=re.S).strip()
                with open(dp, "w", encoding="utf8") as fh:
                    fh.write("%s\n<!-- merged from the forked node `%s` -->\n"
                             "\n## Same day, other channel (%s)\n\n%s\n"
                             % (keep, loser, old.get("source") or "?", body))
                surv = Node(dp, open(dp, encoding="utf8").read())
                for field in ("with", "about", "at", "city"):
                    u = sorted(set(surv.link_list(field)) | set(old.link_list(field)))
                    if u:
                        surv.set_links(field, u)
                for e in surv.entries:
                    if e.get("key") == "source" and e["kind"] == "scalar":
                        extra = str(old.get("source") or "")
                        if extra and extra not in e["value"]:
                            e["value"] += ", " + extra
                            surv.dirty = True
                surv.write()
                log.append("merged interaction %s (both channels kept)" % f)
            else:
                with open(dp, "w", encoding="utf8") as fh:
                    fh.write(text)
                log.append("moved interaction " + f)
            os.remove(sp)
        if not dry and not os.listdir(src):
            os.rmdir(src)

    # ------------------------------------------------------------ frontmatter
    for e in ln.entries:
        k = e.get("key")
        if not k or k in NEVER_MERGE:
            continue
        lv = ln.get(k)
        if k == "aliases":
            continue
        if k in MANAGED and links_of(lv):
            for t in links_of(lv):
                if t != survivor and not dry:
                    sn.add_link(k, t)
            log.append("union %s: +%s" % (k, ", ".join(links_of(lv))))
            continue
        if isinstance(lv, str) and lv.strip() and lv.strip() not in ("[]", '""'):
            sv = sn.get(k)
            sv = sv.strip() if isinstance(sv, str) else sv
            if not sv or sv in ("[]", '""'):
                if not dry:
                    for se in sn.entries:
                        if se.get("key") == k:
                            se.update({"kind": "scalar", "value": lv})
                            se.pop("items", None)
                            sn.dirty = True
                            break
                    else:
                        sn.entries.append({"key": k, "kind": "scalar", "value": lv,
                                           "comment": ""})
                        sn.dirty = True
                log.append("took %s from the forked node" % k)
            elif str(sv) != str(lv):
                conflicts.append("- `%s`: survivor has %s, forked node had %s" % (k, sv, lv))

    # the loser's name and aliases stay resolvable
    old_names = [str(ln.get("name") or "").strip('"')] + [
        str(a).strip('"') for a in (ln.get("aliases") or [])]
    cur = [str(a).strip('"') for a in (sn.get("aliases") or [])]
    add = [a for a in old_names if a and a not in cur]
    if add and not dry:
        value = "[%s]" % ", ".join(
            ('"%s"' % v if re.search(r"[ ()@,]", v) else v) for v in cur + add)
        for e in sn.entries:
            if e.get("key") == "aliases":
                e.update({"kind": "scalar", "value": value})
                e.pop("items", None)
                break
        else:
            sn.entries.append({"key": "aliases", "kind": "scalar", "value": value, "comment": ""})
        sn.dirty = True
    if add:
        log.append("aliases += " + ", ".join(add))

    # a second Notion page is a fact to reconcile by hand, not to delete
    lu, su = ln.get("notion_url"), sn.get("notion_url")
    if lu and su and lu != su and not dry:
        sn.entries.append({"key": "notion_duplicate", "kind": "scalar", "value": lu,
                           "comment": "  # forked node's Notion page: merge in Notion, "
                                      "then delete this key"})
        sn.dirty = True
        log.append("recorded a duplicate Notion page")
    elif lu and su and lu == su:
        log.append("both nodes already pointed at the SAME Notion page (%s) — conclusive" % lu[-12:])

    # -------------------------------------------------------------- the body
    if not dry:
        loser_body = ln.body.strip()
        note = ["\n\n---\n\n## Merged from the forked node `%s` (%s)\n" % (loser, why)]
        if conflicts:
            note.append("### Conflicts to resolve by hand\n")
            note.extend(conflicts)
            note.append("")
        note.append("<details>\n<summary>Everything the forked node said, kept verbatim"
                    " — fold it into the sections above, then delete this block."
                    "</summary>\n\n%s\n\n</details>\n" % loser_body)
        sn.body = sn.body.rstrip() + "\n".join(note)
        sn.dirty = True
        sn.write()
        os.remove(os.path.join("data", "people", loser + ".md"))
        log.append("removed data/people/%s.md" % loser)

    # ----------------------------------------------------------- inbound links
    for dirpath, _d, files in os.walk("data"):
        if dirpath.endswith("_gaps"):
            continue
        for f in files:
            if not f.endswith(".md"):
                continue
            p = os.path.join(dirpath, f)
            t = open(p, encoding="utf8", errors="ignore").read()
            if relink(t, loser, survivor) == t:
                continue
            if not dry:
                with open(p, "w", encoding="utf8") as fh:
                    fh.write(relink(t, loser, survivor))
            log.append("relinked " + p)

    print("\n".join(log))
    if conflicts:
        print("\n%d field conflict(s) written into the survivor's body for a human to resolve:"
              % len(conflicts))
        print("\n".join(conflicts))
    print("\n%s %s -> %s" % ("DRY RUN:" if dry else "merged", loser, survivor))
    if not dry:
        print("now run:  python3 tools/lint.py --fix && python3 tools/lint.py")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("loser")
    ap.add_argument("survivor")
    ap.add_argument("--why", required=True, help="the evidence, written into the survivor")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    chdir_repo()
    merge(a.loser, a.survivor, a.why, a.dry_run)
