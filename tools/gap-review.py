#!/usr/bin/env python3
"""Weekly gap review: turn the gap register into 10 yes/no questions the owner can answer in a minute,
and apply the answers. A register only grows if the gaps that need the OWNER are never put in
front of them in a form they can answer.

    python3 tools/gap-review.py generate [--date YYYY-MM-DD] [--n 10]   # write the batch
    python3 tools/gap-review.py show [DATE]                              # pending questions
    python3 tools/gap-review.py apply DATE ID=yes|no ... [--dry-run]     # apply the answers

Batch: data/agents/tech-maintainer/gap-review/<date>.md (for the owner, Obsidian) and <date>.json
(machine state: questions, answers, what was applied). Order, by value:
  1. possible duplicates (open `possible-duplicate` gaps): names + aliases + company + city side by
     side; yes = `tools/merge.py <loser> <survivor>`, no = gap dropped, never asked again
  2. provisional filenames (`slug-is-a-placeholder`: the name is known, the slug is a placeholder);
     yes = `tools/rename.py <old> <new> --name ...`, no = never asked again
  3. the oldest, highest-value gaps that need the owner (STALLED first, then priority, then age):
     co-presence (yes = `knows` both ways), stale follow-ups (yes = closed), fact gaps
     (yes = keep chasing / the owner will say it, no = `accepted`)
Unanswered questions of the previous batch are carried over first, with the same id.

Question ids are stable: a hash of the gap they ask about (`dup-1a2b3c`, `ren-...`, `gap-...`),
so `dup-1a2b3c` means the same question in every batch. In `apply`, the batch number (1-10) works
too. Answers: yes / y, no / n, or unknown / ? when the owner does not know
(the gap becomes `accepted`: still unknown, never asked again).

Lesson from the first batch: do not ask "are Alex and Bob the same person?" when nothing says so. A
duplicate question needs genuinely similar names
(`checks.py`, possible-duplicate), never co-occurrence alone, and "do they know each other" needs
at least MIN_COPRESENCE shared conversations.

Hard rule: nothing is merged or renamed without an explicit yes for that exact question id.
`generate` never changes the graph or the register.
"""

import os
import re
import sys
import json
import glob
import hashlib
import argparse
import unicodedata
import datetime
import subprocess

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gaps  # noqa: E402
from graph import load_nodes, load_interactions  # noqa: E402

OUTDIR = os.path.join("data", "agents", "tech-maintainer", "gap-review")
YES = {"yes", "y"}
NO = {"no", "n"}
UNKNOWN = {"unknown", "?"}   # the owner does not know: accepted, never asked again
MIN_COPRESENCE = 3   # "do X and Y know each other?" only after 3+ shared conversations (2026-10-24)
FACT_KINDS = {"no-full-name", "partner-unnamed", "partner-in-prose-only", "based-not-linked",
              "no-location", "proper-noun-no-node", "orphan-light-node"}
ASKABLE = FACT_KINDS | {"copresence-no-path", "followup-never-closed"}


def qid(prefix, key):
    return "%s-%s" % (prefix, hashlib.sha1(key.encode("utf8")).hexdigest()[:6])


def clean(v):
    return str(v or "").strip().strip('"').strip("'")


def slugify(name):
    s = name.lower()
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def plain(v):
    """A display value without the graph's own annotations ("— SURNAME UNKNOWN (gap to chase)")."""
    v = clean(v)
    v = re.split(r"\s+[—-]\s+(?=[A-Z ]*UNKNOWN)|\s*\(gap to chase\)|\s*;\s*saved as", v)[0]
    return "" if "UNKNOWN" in v else v.strip()


def n_en(k, one, many):
    return "%d %s" % (k, one if k == 1 else many)


def who(n, slug, inter_count):
    """One plain line about a person node: name, aliases, company, city, how much is on file."""
    if n is None:
        return "%s (node missing)" % slug
    name = plain(n.get("name")) or slug
    bits = []
    al = []
    for a in (n.get("aliases") or []):
        a = plain(a)
        if a and a.lower() not in (name.lower(), slug) and a not in al:
            al.append(a)
    if al:
        bits.append("alias: " + ", ".join(al[:4]))
    comp = re.split(r"\s*[(;,]|\s+with\s+", plain(n.get("company")))[0].strip()
    if comp:
        bits.append(comp[:40])
    city = n.link_list("lives_in")
    if city:
        bits.append("lives in " + ", ".join(city))
    bits.append(n_en(inter_count.get(slug, 0), "interaction", "interactions"))
    return "%s [[%s]] (%s)" % (name, slug, "; ".join(bits))


def why_it(detail):
    d = detail.split(" — ", 1)[-1]
    out = []
    if "nickname node" in d:
        out.append("one of the two has only a first name or a nickname")
    if "same company" in d:
        out.append("same company")
    if "same city" in d:
        out.append("same city")
    if "same phone" in d:
        out.append("same phone")
    if "same email" in d:
        out.append("same email")
    m = re.search(r"(\d+) shared", d)
    if m:
        out.append("%s in common" % n_en(int(m.group(1)), "day", "days"))
    return ", ".join(out) or d


def batches():
    return sorted(glob.glob(os.path.join(OUTDIR, "*.json")))


def load_batch(date):
    p = os.path.join(OUTDIR, "%s.json" % date)
    if not os.path.exists(p):
        raise SystemExit("no batch %s (have: %s)" % (date, ", ".join(
            os.path.basename(b)[:-5] for b in batches()) or "none"))
    return json.load(open(p, encoding="utf8"))


def answered_before():
    """Every question id ever answered, so a 'no' is never asked again."""
    out = {}
    for b in batches():
        for q in json.load(open(b, encoding="utf8"))["questions"]:
            if q.get("answer"):
                out[q["id"]] = q["answer"]
    return out


# ------------------------------------------------------------------- generate

def build_candidates():
    from checks import collect, SOFT, name_is_incomplete, slug_is_placeholder
    nodes, inter, findings = collect()
    inter_count = {}
    for ix in inter:
        inter_count[ix.person] = inter_count.get(ix.person, 0) + 1
    reg = gaps.load()
    live = {f.id for f in findings}
    # only what the detectors still report today: a gap the register has not synced yet (or a
    # detector fixed since) must not become a question
    openg = [r for r in reg.values() if r["status"] == "open" and r["id"] in live]
    out = []

    # 1. duplicates
    for r in sorted(openg, key=lambda r: (r["first_seen"], r["id"])):
        if r["kind"] != "possible-duplicate":
            continue
        a, b = r["id"].split(":", 1)[1].split("|")
        na, nb = nodes.get(a), nodes.get(b)
        if na is None or nb is None:
            continue

        def weak(s, n):
            return slug_is_placeholder(s) or name_is_incomplete(n.get("name"))
        # survivor: the node with the real name; tie -> the one with more history
        rank = sorted([(weak(a, na), -inter_count.get(a, 0), a), (weak(b, nb), -inter_count.get(b, 0), b)])
        survivor, loser = rank[0][2], rank[1][2]
        out.append({
            "id": qid("dup", r["id"]), "type": "duplicate", "gap": r["id"],
            "loser": loser, "survivor": survivor,
            "text": "Are %s and %s the same person? Why I ask: %s. If yes, I merge "
                    "`%s` into `%s`."
                    % (who(nodes[loser], loser, inter_count), who(nodes[survivor], survivor, inter_count),
                       why_it(r["detail"]), loser, survivor),
            "if_yes": "merge: python3 tools/merge.py %s %s" % (loser, survivor),
            "if_no": "gap dropped: two different people, never asked again",
        })

    # 2. provisional filenames
    for f in findings:
        if f.cls != SOFT or f.kind != "slug-is-a-placeholder":
            continue
        old = f.id.split(":", 1)[1]
        n = nodes.get(old)
        if n is None:
            continue
        name = clean(n.get("name"))
        new = slugify(name)
        if not new or new == old or new in nodes:
            continue
        out.append({
            "id": qid("ren", f.id), "type": "rename", "finding": f.id,
            "old": old, "new": new, "name": name,
            "text": "The file for %s is still called `%s`. Rename it to `%s`?" % (name, old, new),
            "if_yes": "python3 tools/rename.py %s %s --name \"%s\"" % (old, new, name),
            "if_no": "left as is, never asked again",
        })

    # 3. the rest that needs the owner: STALLED first, then priority, then oldest
    def score(r):
        return (len(r.get("attempts", [])) < gaps.STALLED_ATTEMPTS, r.get("priority", 5),
                r["first_seen"], r["id"])
    for r in sorted((r for r in openg if r["kind"] in ASKABLE), key=score):
        k, s = r["kind"], r.get("subject") or ""
        tried = len(r.get("attempts", []))
        tag = " (cercato %d volte senza risultato)" % tried if tried else ""
        if k == "copresence-no-path":
            a, b = r["id"].split(":", 1)[1].split("|")
            if a not in nodes or b not in nodes:
                continue
            m = re.match(r"\s*(\d+)", r["detail"])
            if not m or int(m.group(1)) < MIN_COPRESENCE:
                continue
            q = {"type": "copresence", "a": a, "b": b,
                 "text": "Do %s and %s know each other directly? They were together in %s%s."
                         % (who(nodes[a], a, inter_count), who(nodes[b], b, inter_count),
                            n_en(int(re.match(r"\s*(\d+)", r["detail"]).group(1)),
                                 "conversation", "conversations"), tag),
                 "if_yes": "`knows` both ways, gap closed",
                 "if_no": "gap dropped: co-present only, no direct link"}
        elif k == "followup-never-closed":
            q = {"type": "followup",
                 "text": "Are all the points of the follow-up [[%s]] (%s) done or dead?%s"
                         % (s[:-3] if s.endswith(".md") else s, r["detail"].split(" — ", 1)[-1], tag),
                 "if_yes": "gap closed (owner: done or dead)",
                 "if_no": "stays open, noted that some items are still live"}
        else:
            q = {"type": "fact",
                 "text": "Is it worth chasing? %s%s. (yes = stays open and you tell me if you know; "
                         "no = set aside)" % (describe(r), tag),
                 "if_yes": "stays open, attempt noted: ask the owner directly",
                 "if_no": "gap accepted (not chased any more)"}
        q.update({"id": qid("gap", r["id"]), "gap": r["id"]})
        out.append(q)
    return out


def describe(r):
    s, k = r.get("subject") or "", r["kind"]
    return {
        "no-full-name": "The surname of [[%s]]" % s,
        "partner-unnamed": "The name of the partner of [[%s]]" % s,
        "partner-in-prose-only": "The partner of [[%s]], to link as a node" % s,
        "based-not-linked": "The city of [[%s]], to link as a node" % s,
        "no-location": "Where [[%s]] lives" % s,
        "proper-noun-no-node": "What is \"%s\" (place, city, company)" % s,
        "orphan-light-node": "The node [[%s]], linked to nothing" % s,
    }.get(k, r["question"])


def cmd_generate(a):
    date = a.date or datetime.date.today().isoformat()
    os.makedirs(OUTDIR, exist_ok=True)
    path = os.path.join(OUTDIR, "%s.json" % date)
    if os.path.exists(path) and not a.force:
        raise SystemExit("batch %s exists (use --force to rebuild it; answers in it are kept)" % date)
    done = answered_before()
    cands = {q["id"]: q for q in build_candidates()}
    picked = []
    if a.force and os.path.exists(path):
        # rebuilding a batch keeps what the owner already answered, as it was
        picked = [q for q in json.load(open(path, encoding="utf8"))["questions"] if q.get("answer")]
    # carry over unanswered questions of earlier batches whose subject is still live
    for b in reversed(batches()):
        if os.path.basename(b) == "%s.json" % date and not a.force:
            continue
        if os.path.basename(b) > "%s.json" % date:
            continue
        for q in json.load(open(b, encoding="utf8"))["questions"]:
            if not q.get("answer") and q["id"] in cands and q["id"] not in [p["id"] for p in picked]:
                bdate = json.load(open(b, encoding="utf8"))["date"]
                picked.append(dict(cands[q["id"]], **({"carried_from": bdate} if bdate != date else {})))
        break
    for q in cands.values():
        if len(picked) >= a.n:
            break
        if q["id"] in done or q["id"] in [p["id"] for p in picked]:
            continue
        picked.append(q)
    picked = picked[:a.n]      # answered ones come first, so they are never cut
    reg = gaps.load()
    openn = sum(1 for r in reg.values() if r["status"] == "open")
    batch = {"date": date, "open_gaps": openn, "questions": picked}
    if os.path.exists(path):
        old = {q["id"]: q for q in json.load(open(path))["questions"]}
        for q in picked:
            for k in ("answer", "answered_on", "applied"):
                if k in old.get(q["id"], {}):
                    q[k] = old[q["id"]][k]
    save_batch(batch)
    print("wrote %s.md (%d questions, %d gaps open)" % (os.path.join(OUTDIR, date), len(picked), openn))
    for i, q in enumerate(picked, 1):
        print("%2d. [%s] %s" % (i, q["id"], strip_links(q["text"])))


def strip_links(t):
    return re.sub(r"\[\[([^\]|]+)\]\]", r"\1", t)


def live_links(text, names):
    """Keep [[x]] only when x still resolves (a merge or rename since generation unlinks it)."""
    return re.sub(r"\[\[([^\]|]+)\]\]", lambda m: m.group(0) if m.group(1) in names else m.group(1), text)


def save_batch(batch):
    date = batch["date"]
    names = set()
    for _d, _s, files in os.walk("data"):
        names.update(f[:-3] for f in files if f.endswith(".md"))
    with open(os.path.join(OUTDIR, "%s.json" % date), "w", encoding="utf8") as fh:
        json.dump(batch, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write("\n")
    L = ["# Gap review %s" % date, "",
         "Related: [[_me]], [[OPEN]]", "",
         "Ten yes/no questions for the owner, generated by `tools/gap-review.py` from the gap register "
         "(%d gaps open). Do not edit by hand: answers go through "
         "`python3 tools/gap-review.py apply %s <id>=yes|no ...` (or `<n>=yes`). Nothing is merged "
         "or renamed without an explicit yes." % (batch["open_gaps"], date), "",
         "| n | id | question | yes | no | answer |", "| --- | --- | --- | --- | --- | --- |"]
    for i, q in enumerate(batch["questions"], 1):
        ans = q.get("answer") or ""
        if ans and q.get("applied"):
            ans += " (applied %s)" % q.get("answered_on", "")
        L.append("| %d | `%s` | %s | %s | %s | %s |" % (
            i, q["id"], (strip_links(q["text"]) if q.get("applied") else live_links(q["text"], names)).replace("|", "/"), q["if_yes"].replace("|", "/"),
            q["if_no"].replace("|", "/"), ans))
    L.append("")
    with open(os.path.join(OUTDIR, "%s.md" % date), "w", encoding="utf8") as fh:
        fh.write("\n".join(L))


def cmd_show(a):
    bs = batches()
    if not bs:
        raise SystemExit("no batches yet: run generate")
    batch = load_batch(a.date) if a.date else json.load(open(bs[-1], encoding="utf8"))
    print("gap review %s" % batch["date"])
    for i, q in enumerate(batch["questions"], 1):
        print("%2d. [%s] %s%s" % (i, q["id"], strip_links(q["text"]),
                                 "  -> " + q["answer"] if q.get("answer") else ""))


# ---------------------------------------------------------------------- apply

def run(cmd, dry):
    print("  $ " + " ".join(cmd))
    if dry:
        return True
    r = subprocess.run(cmd)
    return r.returncode == 0


def cmd_apply(a):
    batch = load_batch(a.date)
    qs = batch["questions"]
    by_id = {q["id"]: q for q in qs}
    todo = []
    for tok in a.answers:
        if "=" not in tok:
            raise SystemExit("bad answer %r: use <id>=yes|no" % tok)
        k, v = tok.split("=", 1)
        v = v.strip().lower()
        if k.isdigit() and 1 <= int(k) <= len(qs):
            k = qs[int(k) - 1]["id"]
        if k not in by_id:
            raise SystemExit("no question %s in batch %s" % (k, a.date))
        if v not in YES | NO | UNKNOWN:
            raise SystemExit("answer for %s must be yes, no or unknown, got %r" % (k, v))
        todo.append((by_id[k], True if v in YES else False if v in NO else None))
    day = datetime.date.today().isoformat()
    graph_changed = False
    for q, yes in todo:
        if q.get("applied"):
            print("[%s] already applied (%s), skipped" % (q["id"], q.get("answer")))
            continue
        label = {True: "yes", False: "no", None: "unknown"}[yes]
        print("[%s] %s -> %s" % (q["id"], q["type"], label.upper()))
        ok = apply_unknown(q, a.date, a.dry_run) if yes is None else apply_one(q, yes, a.date, a.dry_run)
        graph_changed |= bool(ok and yes and q["type"] in ("duplicate", "rename", "copresence"))
        if ok and not a.dry_run:
            q.update({"answer": label, "answered_on": day, "applied": True})
        elif not ok:
            print("  !! not applied; fix and rerun this id")
    if not a.dry_run:
        save_batch(batch)
        if graph_changed:
            run([sys.executable, "tools/lint.py", "--fix"], False)
            r = subprocess.run([sys.executable, "tools/lint.py"], capture_output=True, text=True)
            print([l for l in r.stdout.splitlines() if l.startswith("mechanical:")][-1:])
        print("\nnow commit what changed (in your worktree):  git status --short, then "
              "tools/wt.sh sync tech-maintainer \"gap review %s: ...\" <paths>" % a.date)


def gap_set(gid, status, note, dry):
    reg = gaps.load()
    if gid not in reg:
        print("  gap %s no longer in the register, nothing to mark" % gid)
        return True
    r = reg[gid]
    print("  gap %s: %s (%s)" % (gid, status, note))
    if dry:
        return True
    if status == "attempt":
        r.setdefault("attempts", []).append({"on": gaps.today_str(), "note": note})
    else:
        r["status"] = status
        r["closed_on"] = gaps.today_str()
        r["closed_by"] = ("dropped: " if status == "dropped" else
                          "accepted: " if status == "accepted" else "") + note
    gaps.save(reg)
    gaps.write_open_md(reg)
    return True


def apply_unknown(q, date, dry):
    src = "Owner, gap review %s (%s)" % (date, q["id"])
    if q["type"] == "rename":
        print("  left as is")
        return True
    return gap_set(q["gap"], "accepted", "%s: he does not know; never ask again" % src, dry)


def apply_one(q, yes, date, dry):
    src = "Owner, gap review %s (%s)" % (date, q["id"])
    t = q["type"]
    if t == "duplicate":
        if not yes:
            return gap_set(q["gap"], "dropped", "%s: not the same person" % src, dry)
        nodes = load_nodes()
        if q["loser"] not in nodes or q["survivor"] not in nodes:
            print("  one of %s / %s no longer exists (merged or renamed since)" % (q["loser"], q["survivor"]))
            return False
        if not run([sys.executable, "tools/merge.py", q["loser"], q["survivor"],
                    "--why", "%s: same person" % src], dry):
            return False
        gap_set(q["gap"], "closed", "%s: same person, merged %s into %s"
                % (src, q["loser"], q["survivor"]), dry)
        # the loser's other gaps did not get answered, its node is gone: say so, so sync does
        # not flag them as "vanished without evidence"
        reg = gaps.load()
        for gid, r in reg.items():
            if r["status"] == "open" and gid != q["gap"] and q["loser"] in re.split(r"[:|]", gid):
                print("  gap %s: closed (node merged)" % gid)
                if not dry:
                    r.update({"status": "closed", "closed_on": gaps.today_str(),
                              "closed_by": "%s: node %s merged into %s; the survivor's own gaps "
                                           "carry on" % (src, q["loser"], q["survivor"])})
        if not dry:
            gaps.save(reg)
            gaps.write_open_md(reg)
        return True
    if t == "rename":
        if not yes:
            print("  left as is")
            return True
        if q["old"] not in load_nodes():
            print("  %s no longer exists" % q["old"])
            return False
        return run([sys.executable, "tools/rename.py", q["old"], q["new"], "--name", q["name"],
                    "--why", "%s: slug was a placeholder" % src], dry)
    if t == "copresence":
        if not yes:
            return gap_set(q["gap"], "dropped", "%s: they do not know each other directly" % src, dry)
        if not dry:
            nodes = load_nodes()
            na, nb = nodes[q["a"]], nodes[q["b"]]
            na.add_link("knows", q["b"])
            nb.add_link("knows", q["a"])
            na.write()
            nb.write()
        print("  knows: %s <-> %s" % (q["a"], q["b"]))
        return gap_set(q["gap"], "closed", "%s: they know each other, `knows` added" % src, dry)
    if t == "followup":
        if yes:
            return gap_set(q["gap"], "closed", "%s: items done or dead" % src, dry)
        return gap_set(q["gap"], "attempt", "%s: some items still live" % src, dry)
    if t == "fact":
        if yes:
            return gap_set(q["gap"], "attempt", "%s: worth chasing, ask the owner directly" % src, dry)
        return gap_set(q["gap"], "accepted", "%s: not worth chasing" % src, dry)
    print("  unknown question type %s" % t)
    return False


def main():
    root = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True,
                          text=True).stdout.strip()
    if root:
        os.chdir(root)
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("generate")
    g.add_argument("--date")
    g.add_argument("--n", type=int, default=10)
    g.add_argument("--force", action="store_true")
    g.set_defaults(func=cmd_generate)
    s = sub.add_parser("show")
    s.add_argument("date", nargs="?")
    s.set_defaults(func=cmd_show)
    p = sub.add_parser("apply")
    p.add_argument("date")
    p.add_argument("answers", nargs="+")
    p.add_argument("--dry-run", action="store_true")
    p.set_defaults(func=cmd_apply)
    a = ap.parse_args()
    a.func(a)


if __name__ == "__main__":
    main()
