#!/usr/bin/env python3
"""Compact an agent's memory.md: a short current-state file plus monthly archives. Never deletes.

    python3 tools/memory_compact.py <agent> [--before YYYY-MM-DD] [--keep REGEX]...
                                    [--extract "HEADING REGEX=FILE.md"]... [--dry-run]
    python3 tools/memory_compact.py --sizes              # every data/agents/*/memory.md, KB

The rule for every agent is in agents/README.md, rule 10, "Memory: a short memory.md + a monthly
archive".

What moves (every move is verbatim, appended to data/agents/<agent>/memory-archive/YYYY-MM.md):
  - a `## ` section whose heading carries a date (YYYY-MM-DD) older than --before;
  - inside `## Log` / `## Sessions` (any heading starting with those words): every entry (a line
    starting with `- ` or `### `, plus its continuation lines) whose first line carries a date
    older than --before. An entry with no date inherits the previous entry's date.
What stays in memory.md: the frontmatter, the title and intro, every undated section (Agreements,
Open, rules...), any heading marked `<!-- keep -->` or matching --keep (the run adds the marker,
so the choice holds for later runs), recent log entries, and
the generated `## Archive` index at the end (rebuilt on every run).
--extract moves a whole section verbatim to its own reference file next to memory.md (e.g. an
exercise catalogue a routine reads) and leaves the heading plus a one-line pointer.
--before defaults to today minus 7 days. Content is never rewritten: the run checks that every
non-blank line of the old memory.md is in the new memory.md, an archive or an extracted file,
and writes nothing if one is missing.
"""
import argparse
import collections
import datetime
import os
import re
import sys

DATE_RE = re.compile(r"\b(20\d\d-[01]\d-[0-3]\d)\b")
KEEP_MARK = "<!-- keep -->"
INDEX_HEADING = "## Archive (memory-archive/, generated)"
INDEX_END = "<!-- end of the generated archive index: write new memory ABOVE this section (log entries under ## Log) -->"
LOG_RE = re.compile(r"^## (Log|Sessions)\b", re.I)
ROOT = "data/agents"


def first_date(text):
    m = DATE_RE.search(text)
    return m.group(1) if m else None


def split_doc(text):
    """(frontmatter, preamble lines, [(heading, [body lines])]) — fences respected."""
    fm = ""
    m = re.match(r"^---\n.*?\n---\n", text, re.S)
    if m:
        fm, text = m.group(0), text[m.end():]
    lines = text.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    pre, secs, cur, fence = [], [], None, False
    for line in lines:
        if line.lstrip().startswith("```"):
            fence = not fence
        if not fence and line.startswith("## "):
            cur = (line, [])
            secs.append(cur)
            continue
        (cur[1] if cur else pre).append(line)
    return fm, pre, secs


def log_entries(body):
    """(intro lines, [(date or None, [lines])]) for a Log-like section body."""
    intro, entries, last = [], [], None
    for line in body:
        if line.startswith("- ") or line.startswith("### "):
            d = first_date(line) or last
            last = d
            entries.append([d, [line]])
        elif entries:
            entries[-1][1].append(line)
        else:
            intro.append(line)
    return intro, entries


def strip_trailing_blank(lines):
    out = list(lines)
    while out and not out[-1].strip():
        out.pop()
    return out


def build_index(agent, adir):
    out = [INDEX_HEADING, "",
           "Older memory, moved verbatim by `tools/memory_compact.py` (nothing deleted). Search it "
           "before saying something is unknown: `grep -rn \"word\" data/agents/%s/memory-archive/`." % agent,
           ""]
    if not os.path.isdir(adir):
        return out + ["", INDEX_END]
    for f in sorted(os.listdir(adir)):
        if not re.match(r"^\d{4}-\d\d\.md$", f):
            continue
        text = open(os.path.join(adir, f), encoding="utf8").read()
        heads = [h[3:].strip() for h in re.findall(r"^## .*$", text, re.M)
                 if not h.startswith("## Log (archived") and not h.startswith("## Sessions (archived")]
        n_log = len(re.findall(r"^<!-- log entries: (\d+)", text, re.M))
        n_ent = sum(int(x) for x in re.findall(r"^<!-- log entries: (\d+)", text, re.M))
        seen, uniq = set(), []
        for h in heads:
            h = h.replace(KEEP_MARK, "").strip()
            h = h if len(h) <= 80 else h[:77] + "..."
            if h not in seen:
                seen.add(h)
                uniq.append(h)
        line = "- [`memory-archive/%s`](memory-archive/%s)" % (f, f)
        if n_log:
            line += ": %d log entries" % n_ent
        out.append(line + ("" if not uniq else (":" if not n_log else ";") + " sections:"))
        out.extend("  - %s" % h for h in uniq)
    return out + ["", INDEX_END]


def compact(agent, before, keep_res, extracts, dry):
    adir_root = os.path.join(ROOT, agent)
    path = os.path.join(adir_root, "memory.md")
    if not os.path.isfile(path):
        sys.exit("no %s" % path)
    original = open(path, encoding="utf8").read()
    fm, pre, secs = split_doc(original)
    adir = os.path.join(adir_root, "memory-archive")
    today = datetime.date.today().isoformat()

    keep, plan = [], []
    to_archive = collections.OrderedDict()      # month -> [lines]
    extracted = {}                              # file -> lines

    def arch(month, lines):
        to_archive.setdefault(month, []).extend(lines)

    stray, log_block = [], []                    # text written after an old index; the Log section
    for head, body in secs:
        if head == INDEX_HEADING:
            # the old index is derived data, rebuilt below; anything after its end marker is
            # memory someone appended at the end of the file: it goes to the Log, never lost
            if INDEX_END in body:
                stray.extend(body[body.index(INDEX_END) + 1:])
            else:                                # marker deleted: keep whatever is not clearly index
                stray.extend(x for x in body if not (x.startswith("Older memory, moved verbatim")
                                                     or x.startswith("- [`memory-archive/")))
            continue
        clean = head.replace(KEEP_MARK, "")
        ex = next((f for rx, f in extracts if re.search(rx, clean)), None)
        first = next((x for x in body if x.strip()), "")
        if ex and first.startswith("Moved verbatim to [`%s`]" % ex):
            ex = None                            # already a pointer from an earlier run
        if ex:
            extracted.setdefault(ex, []).extend([head.replace(" " + KEEP_MARK, "")] + body)
            if KEEP_MARK not in head:
                head = head.rstrip() + " " + KEEP_MARK    # the pointer must survive later runs
            keep.extend([head, "", "Moved verbatim to [`%s`](%s) on %s by `tools/memory_compact.py`: "
                         "read it there when you need it; update it there." % (ex, ex, today), ""])
            plan.append(("extract -> " + ex, head, sum(len(x) + 1 for x in body)))
            continue
        if KEEP_MARK in head or any(re.search(rx, clean) for rx in keep_res):
            if KEEP_MARK not in head and first_date(clean):
                head = head.rstrip() + " " + KEEP_MARK    # persists the decision for later runs
            keep.extend([head] + body)
            plan.append(("keep", head, sum(len(x) + 1 for x in body)))
            continue
        if LOG_RE.match(clean):
            intro, entries = log_entries(body)
            kept_e, moved = [], collections.Counter()
            for d, lines in entries:
                if d and d < before:
                    arch(d[:7], [("LOG", head)] + lines)
                    moved[d[:7]] += 1
                else:
                    kept_e.extend(lines)
            log_block.extend([head] + intro + kept_e)
            plan.append(("log: keep %d, archive %s" % (len(entries) - sum(moved.values()),
                         dict(moved) or 0), head, sum(len(x) + 1 for x in body)))
            continue
        d = first_date(clean)
        if d and d < before:
            arch(d[:7], [head] + body)
            plan.append(("archive " + d[:7], head, sum(len(x) + 1 for x in body)))
        else:
            keep.extend([head] + body)
            plan.append(("keep", head, sum(len(x) + 1 for x in body)))

    # render archive additions: log entries grouped under one "## Log (archived ...)" heading
    additions = {}
    for month, items in to_archive.items():
        out, in_log, n_entries = [], None, 0
        block = []
        for it in items:
            if isinstance(it, tuple):
                n_entries += 1
        for it in items:
            if isinstance(it, tuple):
                if in_log != it[1]:
                    word = "Sessions" if it[1].lower().startswith("## sessions") else "Log"
                    block.append("")
                    block.append("## %s (archived %s, from `%s`)" % (word, today, it[1].strip()))
                    block.append("")
                    in_log = it[1]
                continue
            if isinstance(it, str) and it.startswith("## "):
                in_log = None
                block.append("")
            block.append(it)
        counts = sum(1 for it in items if isinstance(it, tuple))
        out = ["", "<!-- memory_compact run %s: moved from memory.md -->" % today]
        if counts:
            out.append("<!-- log entries: %d -->" % counts)
        out.extend(block)
        additions[month] = out

    # new memory.md: the Log goes last, so a line appended at the end of the file lands in it
    stray = strip_trailing_blank([x for x in stray])
    while stray and not stray[0].strip():
        stray.pop(0)
    if stray and not log_block:
        log_block = ["## Log", ""]
    if log_block:
        keep = strip_trailing_blank(keep) + [""] + strip_trailing_blank(log_block) + stray
    keep = strip_trailing_blank(keep)
    new_lines = pre + keep
    new_lines = strip_trailing_blank(new_lines)

    # verification (before any write): every non-blank original line must land somewhere
    old_c = collections.Counter(l for l in pre + [x for h, b in secs for x in [h] + b] if l.strip())
    # lines of an old generated index are derived, not content
    old_index = []
    for h, b in secs:
        if h == INDEX_HEADING:
            old_index = [h] + (b[:b.index(INDEX_END) + 1] if INDEX_END in b else
                               [x for x in b if x.startswith("Older memory, moved verbatim")
                                or x.startswith("- [`memory-archive/")])
    for l in old_index:
        if l.strip():
            old_c[l] -= 1
    new_c = collections.Counter(l for l in new_lines if l.strip())
    for lines in additions.values():
        new_c.update(l for l in lines if l.strip())
    for lines in extracted.values():
        new_c.update(l for l in lines if l.strip())
    # the only change allowed to a line: a `<!-- keep -->` marker added to a kept heading
    norm = lambda c: collections.Counter({k.replace(" " + KEEP_MARK, "").replace(KEEP_MARK, ""): 0
                                          for k in c}) + collections.Counter(
        [k.replace(" " + KEEP_MARK, "").replace(KEEP_MARK, "") for k, v in c.items() for _ in range(max(v, 0))])
    old_c, new_c = norm(old_c), norm(new_c)
    missing = [l for l, c in old_c.items() if c > 0 and new_c[l] < c]
    if missing:
        print("REFUSED: %d original lines would be lost, nothing written:" % len(missing))
        for l in missing[:10]:
            print("   ", l[:100])
        return 1

    for act, head, size in plan:
        print("%-34s %6d B  %s" % (act[:34], size, head[:80]))
    if dry:
        idx = build_index(agent, adir)
        size = len((fm + "\n".join(new_lines + [""] + idx) + "\n").encode())
        print("dry run: memory.md would be ~%d B (from %d B), archive months %s, extracts %s"
              % (size, len(original.encode()), list(additions), list(extracted)))
        return 0

    os.makedirs(adir, exist_ok=True) if additions else None
    for month, lines in additions.items():
        p = os.path.join(adir, month + ".md")
        if not os.path.exists(p):
            head = ["# %s memory archive, %s" % (agent, month), "",
                    "Related: [[_me]]", "",
                    "Moved verbatim out of `data/agents/%s/memory.md` by `tools/memory_compact.py`. "
                    "Never edited, never deleted; each run is appended at the end." % agent]
            open(p, "w", encoding="utf8").write("\n".join(head) + "\n")
        with open(p, "a", encoding="utf8") as fh:
            fh.write("\n".join(lines) + "\n")
    for f, lines in extracted.items():
        p = os.path.join(adir_root, f)
        prev = open(p, encoding="utf8").read() if os.path.exists(p) else \
            "# %s: %s\n\nRelated: [[_me]]\n\nMoved verbatim out of `memory.md` on %s by `tools/memory_compact.py`.\n" \
            % (agent, f[:-3], today)
        open(p, "w", encoding="utf8").write(prev.rstrip("\n") + "\n\n" + "\n".join(lines).rstrip("\n") + "\n")
    idx = build_index(agent, adir)
    text = fm + "\n".join(new_lines + [""] + idx) + "\n"
    open(path, "w", encoding="utf8").write(text)
    print("%s: %d B -> %d B; archive %s; extracted %s"
          % (path, len(original.encode()), len(text.encode()),
             ", ".join("%s (+%d lines)" % (m, len(v)) for m, v in additions.items()) or "nothing",
             ", ".join(extracted) or "nothing"))
    if len(text.encode()) > 8192:
        print("note: still over 8 KB; mark fewer sections keep, or move a reference section out with --extract")
    return 0


def sizes():
    if not os.path.isdir(ROOT):
        print(f"no {ROOT}/ yet (create an agent first)")
        return 0
    for a in sorted(os.listdir(ROOT)):
        p = os.path.join(ROOT, a, "memory.md")
        if os.path.isfile(p):
            ad = os.path.join(ROOT, a, "memory-archive")
            arch = sum(os.path.getsize(os.path.join(ad, f)) for f in os.listdir(ad)) if os.path.isdir(ad) else 0
            s = os.path.getsize(p)
            print("%-20s memory.md %6.1f KB   archive %6.1f KB%s"
                  % (a, s / 1024, arch / 1024, "   <- over 15 KB, compact it" if s > 15 * 1024 else ""))
    return 0


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("agent", nargs="?")
    ap.add_argument("--before", default=(datetime.date.today() - datetime.timedelta(days=7)).isoformat())
    ap.add_argument("--keep", action="append", default=[])
    ap.add_argument("--extract", action="append", default=[])
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sizes", action="store_true")
    a = ap.parse_args(argv)
    if a.sizes:
        return sizes()
    if not a.agent:
        ap.error("agent required")
    if not re.match(r"^\d{4}-\d\d-\d\d$", a.before):
        ap.error("--before must be YYYY-MM-DD")
    ex = []
    for e in a.extract:
        if "=" not in e or not e.rsplit("=", 1)[1].endswith(".md") or "/" in e.rsplit("=", 1)[1]:
            ap.error("--extract wants 'HEADING REGEX=file.md' (a file next to memory.md)")
        rx, f = e.rsplit("=", 1)
        if f in ("memory.md",):
            ap.error("cannot extract into memory.md")
        ex.append((rx, f))
    return compact(a.agent, a.before, a.keep, ex, a.dry_run)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
