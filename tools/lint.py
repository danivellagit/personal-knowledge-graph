#!/usr/bin/env python3
"""Graph lint.

    python3 tools/lint.py            # report
    python3 tools/lint.py --fix      # apply the mechanical fixes, then verify
    python3 tools/lint.py --gaps     # only the go-and-ask list

Checks live in `checks.py`; the gap register lives in `gaps.py`. This file is the human view
and the only thing allowed to write mechanical fixes.

Why the fixes are in code: a hand-run "close the missing reverse edges" pass once appended items
at the wrong indent and silently corrupted three hub nodes, and nothing noticed for days.
Reverse-edge repair is mechanical work, so it belongs in a script that re-reads what it wrote.
"""

import sys
import os
import collections

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from checks import collect, MECH, GAP, SOFT  # noqa: E402
from config import chdir_repo  # noqa: E402

chdir_repo()

FIX = "--fix" in sys.argv
GAPS_ONLY = "--gaps" in sys.argv

nodes, inter, findings = collect()

applied = collections.Counter()
if FIX:
    for f in findings:
        if f.cls == MECH and f.fix:
            if callable(f.fix):          # e.g. quote the wiki-links in one file
                if f.fix():
                    applied["links quoted"] += 1
            else:
                node, field, slug = f.fix
                if node.add_link(field, slug):
                    applied["edges completed"] += 1
    for n in nodes.values():
        n.normalise_managed()
    for n in nodes.values():
        if n.sync_body_lists():
            applied["body lists resynced"] += 1
    for n in list(nodes.values()) + list(inter):
        if n.dirty and n.write():
            applied["files rewritten"] += 1
    nodes, inter, findings = collect()

by_kind = collections.OrderedDict()
for f in sorted(findings, key=lambda x: (x.cls != MECH, x.priority, x.kind)):
    by_kind.setdefault((f.cls, f.kind), []).append(f)


def dump(cls, cap=12):
    for (c, kind), items in by_kind.items():
        if c != cls:
            continue
        print("\n%s: %s  (%d)" % (c, kind, len(items)))
        for f in items[:cap]:
            print("   ", f.detail)
        if len(items) > cap:
            print("    ... +%d more" % (len(items) - cap))


print("=" * 78)
print("graph lint — %d nodes, %d interactions" % (len(nodes), len(inter)))
print("=" * 78)

n_mech = sum(1 for f in findings if f.cls == MECH)
if not GAPS_ONLY:
    if n_mech:
        dump(MECH)
    else:
        print("\nno mechanical findings — graph shape is clean")
dump(GAP)
if not GAPS_ONLY:
    dump(SOFT, cap=6)

print("\n" + "-" * 78)
print("mechanical: %d   gaps to chase: %d   soft: %d"
      % (n_mech,
         sum(1 for f in findings if f.cls == GAP),
         sum(1 for f in findings if f.cls == SOFT)))
if FIX:
    print("applied: " + (", ".join("%s=%d" % kv for kv in applied.items()) or "nothing"))
elif n_mech:
    print("run  python3 tools/lint.py --fix  to apply the mechanical fixes")
print("gap register:  python3 tools/gaps.py sync   |   today's list: python3 tools/gaps.py today")
