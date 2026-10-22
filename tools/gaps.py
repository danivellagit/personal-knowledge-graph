#!/usr/bin/env python3
"""The gap register: what the memory knows it does not know.

A lint report is disposable — it is recomputed from scratch every run, so a gap that has been
open for three weeks looks exactly like one found this morning. That is the difference between
a report and a memory. This file gives every gap an identity and a history:

    first_seen   when the graph first noticed it was missing something
    last_seen    the last run that still saw it open
    attempts     how many times a sweep actually tried to close it, with notes
    status       open | closed | dropped
    closed_by    the evidence that closed it (never "it disappeared")

Commands:

    python3 tools/gaps.py sync                  # reconcile detector <-> register (daily)
    python3 tools/gaps.py today [--limit 8]     # the chase list for this run
    python3 tools/gaps.py attempt <id> -n "..."  # tried, did not close: record what was checked
    python3 tools/gaps.py close   <id> -e "..."  # closed, with the evidence
    python3 tools/gaps.py drop    <id> -n "..."  # not closeable / not worth it, with the reason
    python3 tools/gaps.py trend                 # opened vs closed over time

Files (all under data/_gaps/, part of your private data):
    register.jsonl   one line per gap, machine-owned, the source of truth
    OPEN.md          generated human view for Obsidian
    history.jsonl    one line per sync: counts by kind, so the trend is real and not a vibe

Rule that makes this safe: **a gap closes on evidence, not on silence.** If a detector stops
reporting a gap, `sync` marks it `closed` with `closed_by: "detector: no longer reported"` — but
if it was a fact-gap (a missing name, a missing city) that is suspicious, and sync says so,
because a fact does not become known by itself.
"""

import os
import sys
import json
import argparse
import datetime
import collections

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from checks import collect, GAP  # noqa: E402
from config import chdir_repo, owner  # noqa: E402

GAPDIR = os.path.join("data", "_gaps")
REGISTER = os.path.join(GAPDIR, "register.jsonl")
HISTORY = os.path.join(GAPDIR, "history.jsonl")
OPEN_MD = os.path.join(GAPDIR, "OPEN.md")

# kinds where "the detector stopped seeing it" is NOT proof it was answered: the fact could
# just as easily have been deleted, renamed, or the person dropped out of the window.
FACT_KINDS = {"no-full-name", "partner-unnamed", "partner-in-prose-only", "no-location",
              "based-not-linked", "copresence-no-path", "dangling-edge"}

STALLED_ATTEMPTS = 3     # tried this often without closing -> stop guessing, ask the owner
NAG_DAYS = 21            # open this long with no attempt -> it is being ignored, not worked


def today_str():
    return datetime.date.today().isoformat()


def load():
    if not os.path.exists(REGISTER):
        return {}
    out = {}
    with open(REGISTER, encoding="utf8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                r = json.loads(line)
                out[r["id"]] = r
    return out


def save(reg):
    os.makedirs(GAPDIR, exist_ok=True)
    rows = sorted(reg.values(), key=lambda r: (r["status"] != "open", r["first_seen"], r["id"]))
    with open(REGISTER, "w", encoding="utf8") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n")


def age(r, today=None):
    today = today or datetime.date.today()
    return (today - datetime.date.fromisoformat(r["first_seen"])).days


# ------------------------------------------------------------------------ sync

def cmd_sync(args):
    nodes, inter, findings = collect()
    live = {f.id: f for f in findings if f.cls == GAP}
    reg = load()
    day = today_str()
    opened, closed, suspicious = [], [], []

    for gid, f in live.items():
        r = reg.get(gid)
        if r is None:
            reg[gid] = {
                "id": gid, "kind": f.kind, "subject": f.subject,
                "question": f.question or f.detail, "detail": f.detail,
                "priority": f.priority, "first_seen": day, "last_seen": day,
                "status": "open", "attempts": [], "closed_by": None, "closed_on": None,
            }
            opened.append(gid)
        else:
            r["last_seen"] = day
            r["detail"] = f.detail
            r["priority"] = f.priority
            if r["status"] == "dropped":
                # a human judged this one not real / not worth chasing. The detector will keep
                # emitting it forever (nothing in the data changed), so honouring that judgement
                # is the whole point of the status. Never resurrect it automatically.
                continue
            if r["status"] != "open":
                # a CLOSED gap that came back is different: it means the fix did not hold, or
                # the fact was wrong. Reopen it and keep the record that it had been closed.
                r.setdefault("reopened", []).append({"on": day, "was": r["status"],
                                                     "had_been_closed_by": r.get("closed_by")})
                r["status"] = "open"
                r["closed_by"] = None
                r["closed_on"] = None
                opened.append(gid + " (reopened)")

    for gid, r in reg.items():
        if r["status"] != "open" or gid in live:
            continue
        r["status"] = "closed"
        r["closed_on"] = day
        r["closed_by"] = "detector: no longer reported"
        closed.append(gid)
        if r["kind"] in FACT_KINDS:
            suspicious.append(gid)

    save(reg)
    write_open_md(reg)

    counts = collections.Counter(r["kind"] for r in reg.values() if r["status"] == "open")
    os.makedirs(GAPDIR, exist_ok=True)
    with open(HISTORY, "a", encoding="utf8") as fh:
        fh.write(json.dumps({"date": day, "opened": len(opened), "closed": len(closed),
                             "open_total": sum(counts.values()), "by_kind": dict(counts)},
                            ensure_ascii=False, sort_keys=True) + "\n")

    print("gap register — %s" % day)
    print("  opened this run: %d" % len(opened))
    for g in opened[:10]:
        print("     + " + g)
    print("  closed this run: %d" % len(closed))
    for g in closed[:10]:
        print("     - " + g)
    if suspicious:
        print("\n  !! %d fact-gaps vanished without recorded evidence." % len(suspicious))
        print("     A name does not become known by itself. Check these were really answered")
        print("     and not just deleted or renamed:")
        for g in suspicious[:10]:
            print("       ? " + g)
    print("\n  open now: %d" % sum(counts.values()))
    for k, c in counts.most_common():
        print("     %-26s %d" % (k, c))


# ----------------------------------------------------------------------- today

def cmd_today(args):
    reg = load()
    openg = [r for r in reg.values() if r["status"] == "open"]
    if not openg:
        print("nothing open. Run sync first.")
        return

    def score(r):
        # chase first: high priority, then oldest, then least attempted
        return (r.get("priority", 5), -age(r), len(r.get("attempts", [])))

    stalled = [r for r in openg if len(r.get("attempts", [])) >= STALLED_ATTEMPTS]
    ignored = [r for r in openg if age(r) >= NAG_DAYS and not r.get("attempts")]
    pick = sorted([r for r in openg if r not in stalled], key=score)[:args.limit]

    print("TODAY'S CHASE LIST (%d of %d open)\n" % (len(pick), len(openg)))
    for r in pick:
        print("  [%s]  p%d, open %dd, %d attempts"
              % (r["id"], r.get("priority", 5), age(r), len(r.get("attempts", []))))
        print("      %s" % r["question"])
    if ignored:
        print("\nOPEN >%dd AND NEVER ATTEMPTED (%d) — these are being ignored, not worked:"
              % (NAG_DAYS, len(ignored)))
        for r in sorted(ignored, key=lambda x: x["first_seen"])[:10]:
            print("  [%s] %dd — %s" % (r["id"], age(r), r["question"]))
    if stalled:
        print("\nSTALLED (%d attempts+, %d gaps) — stop guessing, ask %s directly or drop:"
              % (STALLED_ATTEMPTS, len(stalled), owner()))
        for r in stalled:
            notes = "; ".join(a.get("note", "") for a in r["attempts"][-2:])
            print("  [%s] %s\n      tried: %s" % (r["id"], r["question"], notes))
    print("\nrecord the outcome:  gaps.py attempt <id> -n '...'   |   gaps.py close <id> -e '...'")


# ------------------------------------------------------------- attempt / close

def _get(reg, gid):
    if gid not in reg:
        raise SystemExit("unknown gap id: %s (see data/_gaps/OPEN.md)" % gid)
    return reg[gid]


def cmd_attempt(args):
    reg = load()
    r = _get(reg, args.id)
    r.setdefault("attempts", []).append({"on": today_str(), "note": args.note})
    save(reg)
    write_open_md(reg)
    print("attempt %d recorded on %s" % (len(r["attempts"]), args.id))
    if len(r["attempts"]) >= STALLED_ATTEMPTS:
        print("  -> stalled. Ask %s directly, or drop it with a reason." % owner())


def cmd_close(args):
    reg = load()
    r = _get(reg, args.id)
    r["status"] = "closed"
    r["closed_on"] = today_str()
    r["closed_by"] = args.evidence
    save(reg)
    write_open_md(reg)
    print("closed %s\n  evidence: %s" % (args.id, args.evidence))


def cmd_drop(args):
    reg = load()
    r = _get(reg, args.id)
    r["status"] = "dropped"
    r["closed_on"] = today_str()
    r["closed_by"] = "dropped: " + args.note
    save(reg)
    write_open_md(reg)
    print("dropped %s" % args.id)


# ----------------------------------------------------------------------- trend

def cmd_trend(args):
    if not os.path.exists(HISTORY):
        print("no history yet — run sync")
        return
    rows = [json.loads(l) for l in open(HISTORY, encoding="utf8") if l.strip()]
    per_day = collections.OrderedDict()
    for r in rows:
        per_day[r["date"]] = r          # last sync of the day wins
    print("date         opened  closed   open")
    prev = None
    for d, r in per_day.items():
        delta = "" if prev is None else " (%+d)" % (r["open_total"] - prev)
        print("%s   %4d    %4d   %4d%s" % (d, r["opened"], r["closed"], r["open_total"], delta))
        prev = r["open_total"]
    if len(per_day) >= 2:
        first, last = list(per_day.values())[0], list(per_day.values())[-1]
        net = last["open_total"] - first["open_total"]
        verdict = ("net closing" if net < 0 else "net opening" if net > 0 else "flat")
        print("\n%s over %d syncs (%+d)" % (verdict, len(per_day), net))


# --------------------------------------------------------------------- OPEN.md

def write_open_md(reg):
    openg = [r for r in reg.values() if r["status"] == "open"]
    closed = [r for r in reg.values() if r["status"] == "closed"]
    dropped = [r for r in reg.values() if r["status"] == "dropped"]
    by_kind = collections.defaultdict(list)
    for r in openg:
        by_kind[r["kind"]].append(r)

    L = []
    L.append("# Gaps — what this memory knows it does not know\n")
    L.append("Generated by `tools/gaps.py`. **Do not edit by hand** — record outcomes with\n"
             "`gaps.py attempt|close|drop`, so the history survives.\n")
    L.append("_%s — %d open, %d closed, %d dropped._\n"
             % (today_str(), len(openg), len(closed), len(dropped)))
    L.append("A gap closes on **evidence**, never on silence. Never invent a fact to close one:\n"
             "this graph is read before real conversations with real people.\n")

    for kind in sorted(by_kind, key=lambda k: (min(r.get("priority", 5) for r in by_kind[k]), k)):
        rows = sorted(by_kind[kind], key=lambda r: r["first_seen"])
        L.append("\n## %s (%d)\n" % (kind, len(rows)))
        for r in rows:
            att = len(r.get("attempts", []))
            flags = []
            if att >= STALLED_ATTEMPTS:
                flags.append("**STALLED**")
            if age(r) >= NAG_DAYS and not att:
                flags.append("**never attempted**")
            if r.get("reopened"):
                flags.append("reopened %dx" % len(r["reopened"]))
            L.append("- `%s` — %s  \n  open %dd (since %s), %d attempts %s"
                     % (r["id"], r["question"], age(r), r["first_seen"], att, " ".join(flags)))
            for a in r.get("attempts", [])[-2:]:
                L.append("    - tried %s: %s" % (a["on"], a.get("note", "")))

    if closed:
        L.append("\n## Recently closed\n")
        for r in sorted(closed, key=lambda r: r.get("closed_on") or "", reverse=True)[:20]:
            L.append("- `%s` — closed %s: %s" % (r["id"], r.get("closed_on"), r.get("closed_by")))
    if dropped:
        L.append("\n## Dropped\n")
        for r in dropped:
            L.append("- `%s` — %s" % (r["id"], r.get("closed_by")))

    os.makedirs(GAPDIR, exist_ok=True)
    with open(OPEN_MD, "w", encoding="utf8") as fh:
        fh.write("\n".join(L) + "\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("sync").set_defaults(func=cmd_sync)
    t = sub.add_parser("today")
    t.add_argument("--limit", type=int, default=8)
    t.set_defaults(func=cmd_today)
    a = sub.add_parser("attempt")
    a.add_argument("id")
    a.add_argument("-n", "--note", required=True)
    a.set_defaults(func=cmd_attempt)
    c = sub.add_parser("close")
    c.add_argument("id")
    c.add_argument("-e", "--evidence", required=True)
    c.set_defaults(func=cmd_close)
    d = sub.add_parser("drop")
    d.add_argument("id")
    d.add_argument("-n", "--note", required=True)
    d.set_defaults(func=cmd_drop)
    sub.add_parser("trend").set_defaults(func=cmd_trend)
    args = ap.parse_args()
    chdir_repo()
    args.func(args)


if __name__ == "__main__":
    main()
