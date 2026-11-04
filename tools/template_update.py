#!/usr/bin/env python3
"""Read the updates of the original template and install only the ones you approve.

Your copy of this repo started from a public template. Its maintainer keeps improving it (new skills, tool fixes,
agent specs, docs). This tool fetches the template from the git remote `upstream`, lists what changed since the
last version you applied, grouped in plain language, and installs only what you say yes to. It NEVER touches your
own data: data/**, config.local.yml, .template-version, tools/life-app/instance.yml and any path you add under
`template.protect` in config.local.yml.

    python3 tools/template_update.py init [--url URL] [--base SHA]    # once: remote `upstream` + .template-version
    python3 tools/template_update.py                                  # = check: fetch + list, DRY RUN, changes nothing
    python3 tools/template_update.py diff 3                           # what item 3 changes (and your own edits)
    python3 tools/template_update.py apply all | apply 1,4-6 | apply skills tools [--commit]
    python3 tools/template_update.py decline 2                        # skip item 2 for good (until it changes again)
    python3 tools/template_update.py status                           # the recorded version, no network
Flags: --json (check: machine-readable list), --remote NAME (default upstream), --branch NAME (default main),
       --with-conflict-markers (apply: write a conflicting file with <<<<<<< markers instead of skipping it),
       --no-fetch (check/apply/diff: use what was fetched last).

How a file is classified (old = the template at your recorded version, new = the template now, yours = your file):
  new / changed / removed   you never edited it: installing replaces it with the template's version
  edited by you             you changed it AND the template changed it: a three-way merge (git merge-file) is tried;
                            "merges cleanly" installs the merge, "CONFLICT" is skipped unless you ask for markers
  already there             your file already equals the new version: nothing to do
Applying a subset moves the recorded version forward and keeps the rest as "deferred": they are offered again next
time, from the version where you left them. `decline` records the exact new content you said no to, so the same
change is never offered again, but a later change to that file is.

The recorded version lives in `.template-version` (JSON, commit it in your own repo). Exit codes: 0 ok (check: no
updates) | 1 error | 2 not initialised | 10 check: updates available.
"""

import argparse
import datetime as dt
import fnmatch
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import config  # noqa: E402

DEFAULT_URL = "https://github.com/danivellagit/personal-knowledge-graph.git"
VERSION_FILE = ".template-version"
PROTECT = ["data/*", "data/**", "config.local.yml", VERSION_FILE, "tools/life-app/instance.yml", ".git/*"]
GROUPS = [  # (key, plain-language title, globs), first match wins
    ("routines", "Agent routines (suggested schedules)", ["agents/*/routines/*"]),
    ("agents", "Agent specs and memory skeletons", ["agents/*"]),
    ("skills", "Skills (what the agents know how to do)", ["skills/*"]),
    ("life-app", "Life App", ["tools/life-app/*"]),
    ("tests", "Tests", ["tools/tests/*"]),
    ("tools", "Tools (scripts)", ["tools/*"]),
    ("boot", "Agent boot files and hooks", ["CLAUDE.md", "AGENTS.md", ".grok/*", ".claude/*"]),
    ("config", "Config template", ["config.example.yml"]),
    ("plumbing", "Repo plumbing (git hooks, ignore rules)", [".githooks/*", ".gitignore", ".gitattributes"]),
    ("docs", "Docs", ["*.md", "docs/*", "LICENSE"]),
    ("other", "Other", ["*"]),
]


class Fail(Exception):
    def __init__(self, code, msg):
        super().__init__(msg)
        self.code = code


def git(*a, check=True, binary=False, inp=None):
    p = subprocess.run(["git", "-C", ROOT] + list(a), capture_output=True, input=inp, text=not binary)
    if check and p.returncode != 0:
        err = p.stderr if not binary else p.stderr.decode("utf8", "replace")
        raise Fail(1, "git %s failed: %s" % (" ".join(a[:3]), err.strip()[:400]))
    return p


def blob(rev, path):
    """bytes of path at rev, or None when it does not exist there"""
    p = git("show", "%s:%s" % (rev, path), check=False, binary=True)
    return p.stdout if p.returncode == 0 else None


def blob_id(rev, path):
    p = git("rev-parse", "-q", "--verify", "%s:%s" % (rev, path), check=False)
    return p.stdout.strip() if p.returncode == 0 else None


def file_mode(rev, path):
    out = git("ls-tree", rev, "--", path, check=False).stdout.split()
    return out[0] if out else None


def local(path):
    p = os.path.join(ROOT, path)
    if os.path.isfile(p):
        with open(p, "rb") as fh:
            return fh.read()
    return None


def protected(path):
    globs = PROTECT + config.get_list("template.protect")
    return any(fnmatch.fnmatch(path, g) for g in globs)


def group_of(path):
    for key, title, globs in GROUPS:
        if any(fnmatch.fnmatch(path, g) for g in globs):
            return key, title
    return "other", "Other"


# ---------------------------------------------------------------- version file

def vpath():
    return os.path.join(ROOT, VERSION_FILE)


def load_version():
    try:
        with open(vpath(), encoding="utf8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        return None


def save_version(v):
    v = dict(v, deferred=dict(sorted((v.get("deferred") or {}).items())), declined=dict(sorted((v.get("declined") or {}).items())))
    with open(vpath(), "w", encoding="utf8") as fh:
        json.dump(v, fh, indent=2, sort_keys=True)
        fh.write("\n")


def need_version():
    v = load_version()
    if not v or not v.get("base"):
        raise Fail(2, "not initialised: run  python3 tools/template_update.py init  (adds the `upstream` remote and "
                      "records the template version you started from)")
    return v


def remote_url(name):
    p = git("remote", "get-url", name, check=False)
    return p.stdout.strip() if p.returncode == 0 else None


def fetch(remote, branch):
    git("fetch", "--quiet", remote, branch)
    return git("rev-parse", "%s/%s" % (remote, branch)).stdout.strip()


def short(sha):
    return (sha or "-")[:7]


def commit_date(sha):
    return git("log", "-1", "--format=%cs", sha, check=False).stdout.strip() or "?"


# ---------------------------------------------------------------- init / status

def norm_url(u):
    u = (u or "").strip().rstrip("/")
    return (u[:-4] if u.endswith(".git") else u).lower()


def cmd_init(a):
    # a second clone of the owner's own private copy carries the template URL in .template-version
    url = a.url or config.get("template.upstream") or (load_version() or {}).get("upstream") or DEFAULT_URL
    have = remote_url(a.remote)
    if have is None and norm_url(remote_url("origin")) == norm_url(url):
        # a plain clone of the template: its `origin` IS the template. Rename it, so nothing ever pushes there and
        # `origin` is free for the owner's own private remote.
        git("remote", "rename", "origin", a.remote)
        print("renamed git remote `origin` (the template) to `%s`; add your own private repo as `origin` if you want "
              "a backup (INSTALL.md, step 2)" % a.remote)
    elif have is None:
        git("remote", "add", a.remote, url)
        print("added git remote `%s` -> %s" % (a.remote, url))
    elif have != url and a.url:
        git("remote", "set-url", a.remote, url)
        print("git remote `%s` now points to %s (was %s)" % (a.remote, url, have))
    else:
        print("git remote `%s` -> %s" % (a.remote, have))
    tracking = git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}", check=False).stdout.strip()
    if tracking.startswith(a.remote + "/"):
        # otherwise `git pull` and the session hooks would pull template changes in without asking
        git("branch", "--unset-upstream")
        print("your branch no longer tracks %s: template changes come in only through this tool, on your yes" % tracking)
    new = fetch(a.remote, a.branch)
    v = load_version() or {}
    if a.base:
        base = git("rev-parse", a.base + "^{commit}").stdout.strip()
    elif v.get("base") and not a.force:
        print("already initialised at %s (use --base SHA or --force to reset it)" % short(v["base"]))
        return 0
    else:
        p = git("merge-base", "HEAD", new, check=False)
        base = p.stdout.strip()
        if not base:
            raise Fail(1, "your history has no commit in common with the template (a copy, not a clone?): pass "
                          "--base <the template commit you started from>, or --base %s if you copied the latest" % short(new))
    v.update({"upstream": remote_url(a.remote), "remote": a.remote, "branch": a.branch, "base": base,
              "applied_at": dt.date.today().isoformat()})
    v.setdefault("deferred", {})
    v.setdefault("declined", {})
    save_version(v)
    behind = git("rev-list", "--count", "%s..%s" % (base, new)).stdout.strip()
    print("recorded template version %s (%s) in %s; the template has %s newer commit(s)" % (
        short(base), commit_date(base), VERSION_FILE, behind))
    print("commit %s in your own repo; check updates any time: python3 tools/template_update.py" % VERSION_FILE)
    return 0


def cmd_status(a):
    v = need_version()
    print("upstream:   %s (%s/%s)" % (v.get("upstream"), v.get("remote"), v.get("branch")))
    print("version:    %s (%s), recorded %s" % (short(v["base"]), commit_date(v["base"]), v.get("applied_at")))
    print("deferred:   %d file(s)   declined: %d file(s)" % (len(v.get("deferred") or {}), len(v.get("declined") or {})))
    return 0


# ---------------------------------------------------------------- items

def merge3(mine, old, new):
    """git merge-file on bytes -> (merged bytes, clean?)"""
    with tempfile.TemporaryDirectory() as d:
        paths = []
        for n, data in (("mine", mine), ("old", old or b""), ("new", new)):
            p = os.path.join(d, n)
            with open(p, "wb") as fh:
                fh.write(data)
            paths.append(p)
        p = subprocess.run(["git", "merge-file", "-p", "-L", "yours", "-L", "template (old)", "-L", "template (new)"]
                           + paths, capture_output=True)
        if p.returncode < 0 or p.returncode > 127:
            raise Fail(1, "git merge-file failed")
        return p.stdout, p.returncode == 0


def items(v, new):
    base = v["base"]
    if git("cat-file", "-t", base, check=False).stdout.strip() != "commit":
        raise Fail(1, "recorded version %s is not in the fetched history (template history rewritten?): "
                      "init --base <sha> --force" % short(base))
    cand = {}
    for line in git("diff", "--name-only", "--no-renames", base, new).stdout.splitlines():
        if line:
            cand[line] = base
    for path, old in (v.get("deferred") or {}).items():
        cand.setdefault(path, old)
    out, skipped_protected, already, declined = [], [], [], []
    for path in sorted(cand):
        old_rev = cand[path]
        if protected(path):
            skipped_protected.append(path)
            continue
        o, n, mine = blob(old_rev, path), blob(new, path), local(path)
        nid = blob_id(new, path) or "deleted"
        if (v.get("declined") or {}).get(path) == nid:
            declined.append(path)
            continue
        if mine == n:
            already.append(path)
            continue
        kind = "new" if o is None else ("removed" if n is None else "changed")
        it = {"path": path, "kind": kind, "old_rev": old_rev, "new_id": nid}
        if mine == o:
            it["state"] = "clean"
        elif mine is None:
            it["state"] = "deleted by you"
        elif n is None:
            it["state"] = "edited by you, removed upstream"
        else:
            merged, clean = merge3(mine, o, n)
            it["state"] = "merges cleanly" if clean else "CONFLICT"
        it["group"], it["title"] = group_of(path)
        out.append(it)
    order = [g[0] for g in GROUPS]
    out.sort(key=lambda i: (order.index(i["group"]), i["path"]))
    for n_, it in enumerate(out, 1):
        it["id"] = n_
    return out, skipped_protected, already, declined


def describe(it):
    s = {"clean": "", "merges cleanly": "  EDITED BY YOU: merges cleanly with your edits",
         "CONFLICT": "  EDITED BY YOU: CONFLICT (see: diff %d)" % it["id"],
         "deleted by you": "  you deleted it locally (apply brings it back)",
         "edited by you, removed upstream": "  EDITED BY YOU, removed by the template (apply deletes it)"}[it["state"]]
    return "  [%d] %-8s %s%s" % (it["id"], it["kind"], it["path"], s)


def prepare(a):
    v = need_version()
    remote, branch = v.get("remote", a.remote), v.get("branch", a.branch)
    new = git("rev-parse", "%s/%s" % (remote, branch)).stdout.strip() if a.no_fetch else fetch(remote, branch)
    return (v, new) + items(v, new)


def cmd_check(a):
    v, new, its, prot, already, declined = prepare(a)
    commits = git("log", "--format=%h %cs %s", "%s..%s" % (v["base"], new)).stdout.splitlines()
    if a.json:
        print(json.dumps({"base": v["base"], "new": new, "commits": commits, "items": its, "protected": prot,
                          "already": already, "declined": declined}, indent=2))
        return 10 if its else 0
    if not its:
        print("Template: up to date (version %s, %s).%s" % (short(new), commit_date(new),
              " %d file(s) already match locally." % len(already) if already else ""))
        if new != v["base"]:
            print("(nothing left to install; record it with:  python3 tools/template_update.py apply all)")
        return 0
    print("Template updates: %d commit(s) since your version %s (%s) -> %s (%s)" % (
        len(commits), short(v["base"]), commit_date(v["base"]), short(new), commit_date(new)))
    for c in commits[:20]:
        print("    " + c)
    if len(commits) > 20:
        print("    ... %d more (git log %s..%s)" % (len(commits) - 20, short(v["base"]), short(new)))
    print("\nWhat you can install (DRY RUN: nothing was changed):")
    last = None
    for it in its:
        if it["group"] != last:
            print("\n %s  [%s]" % (it["title"], it["group"]))
            last = it["group"]
        print(describe(it))
    if prot:
        print("\nNever touched (your own data and config): %s" % ", ".join(prot))
    if already:
        print("Already up to date locally: %d file(s)" % len(already))
    if declined:
        print("Declined earlier, unchanged since: %d file(s)" % len(declined))
    print("\nInstall:  python3 tools/template_update.py apply all   |  apply 1,3-5  |  apply %s" % its[0]["group"])
    print("Look first: diff <n>.   Skip for good: decline <n>.")
    return 10


def select(its, sel):
    if not sel:
        raise Fail(1, "say what: all, item numbers (1,3-5), group names (%s) or paths" % ", ".join(g[0] for g in GROUPS))
    chosen = set()
    for tok in ",".join(sel).split(","):
        tok = tok.strip()
        if not tok:
            continue
        if tok == "all":
            chosen.update(i["id"] for i in its)
        elif re.match(r"^\d+-\d+$", tok):
            x, y = map(int, tok.split("-"))
            chosen.update(range(x, y + 1))
        elif tok.isdigit():
            chosen.add(int(tok))
        elif any(tok == g[0] for g in GROUPS):
            chosen.update(i["id"] for i in its if i["group"] == tok)
        elif any(tok == i["path"] for i in its):
            chosen.update(i["id"] for i in its if i["path"] == tok)
        else:
            raise Fail(1, "unknown item %r (run check for the list)" % tok)
    bad = [c for c in chosen if c < 1 or c > len(its)]
    if bad:
        raise Fail(1, "no item %s (there are %d)" % (", ".join(map(str, sorted(bad))), len(its)))
    return [i for i in its if i["id"] in chosen]


def write_path(path, data, mode):
    p = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as fh:
        fh.write(data)
    if mode == "100755":
        os.chmod(p, 0o755)


def cmd_apply(a):
    v, new, its, prot, already, declined = prepare(a)
    pick = select(its, a.items) if its else []
    done, skipped = [], []
    for it in pick:
        path = it["path"]
        o, n, mine = blob(it["old_rev"], path), blob(new, path), local(path)
        if it["state"] == "CONFLICT" and not a.with_conflict_markers:
            skipped.append(it)
            continue
        if n is None:
            if os.path.exists(os.path.join(ROOT, path)):
                os.remove(os.path.join(ROOT, path))
        elif it["state"] in ("merges cleanly", "CONFLICT"):
            merged, _ = merge3(mine, o, n)
            write_path(path, merged, file_mode(new, path))
        else:
            write_path(path, n, file_mode(new, path))
        done.append(it)
    deferred = dict(v.get("deferred") or {})
    for it in its:
        if it in done:
            deferred.pop(it["path"], None)
        else:
            deferred[it["path"]] = it["old_rev"]
    v.update(base=new, applied_at=dt.date.today().isoformat(), deferred=deferred)
    save_version(v)
    for it in done:
        print("installed [%d] %s%s" % (it["id"], it["path"], " (WITH CONFLICT MARKERS: resolve by hand)"
                                       if it["state"] == "CONFLICT" else ""))
    for it in skipped:
        print("skipped   [%d] %s: conflicts with your edits (diff %d; or apply %d --with-conflict-markers)" % (
            it["id"], it["path"], it["id"], it["id"]))
    left = len(its) - len(done)
    print("recorded template version %s in %s; %d item(s) deferred for next time" % (short(new), VERSION_FILE, left))
    if a.commit:
        paths = [VERSION_FILE] + [i["path"] for i in done]
        git("add", "-A", "--", *paths)
        msg = "template: install %d update(s) from %s (%s)" % (len(done), short(new), commit_date(new))
        p = git("commit", "-m", msg, "--", *paths, check=False)
        print(p.stdout.strip() or p.stderr.strip())
    elif done:
        print("review with  git diff , then commit (only these paths + %s)" % VERSION_FILE)
    return 0


def cmd_decline(a):
    v, new, its, prot, already, declined = prepare(a)
    pick = select(its, a.items)
    dec = dict(v.get("declined") or {})
    deferred = dict(v.get("deferred") or {})
    for it in pick:
        dec[it["path"]] = it["new_id"]
        deferred.pop(it["path"], None)
        print("declined [%d] %s (offered again only if the template changes it again)" % (it["id"], it["path"]))
    v.update(declined=dec, deferred=deferred)
    save_version(v)
    return 0


def cmd_diff(a):
    v, new, its, prot, already, declined = prepare(a)
    for it in select(its, a.items):
        path = it["path"]
        print("=== [%d] %s (%s, %s)" % (it["id"], path, it["kind"], it["state"]))
        p = git("diff", "--no-color", it["old_rev"], new, "--", path, check=False)
        print("--- what the template changed:\n" + (p.stdout or "(nothing)"))
        if it["state"] not in ("clean",):
            p = git("diff", "--no-color", it["old_rev"], "--", path, check=False)
            print("--- your own edits to it:\n" + (p.stdout or "(file deleted or untracked locally)"))
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("mode", nargs="?", default="check", choices=["init", "check", "status", "diff", "apply", "decline"])
    p.add_argument("items", nargs="*")
    p.add_argument("--url")
    p.add_argument("--base")
    p.add_argument("--force", action="store_true")
    p.add_argument("--remote", default="upstream")
    p.add_argument("--branch", default="main")
    p.add_argument("--json", action="store_true")
    p.add_argument("--no-fetch", action="store_true")
    p.add_argument("--commit", action="store_true")
    p.add_argument("--with-conflict-markers", action="store_true")
    a = p.parse_args(argv)
    try:
        return {"init": cmd_init, "check": cmd_check, "status": cmd_status, "diff": cmd_diff,
                "apply": cmd_apply, "decline": cmd_decline}[a.mode](a)
    except Fail as e:
        print("template_update: %s" % e, file=sys.stderr)
        return e.code


if __name__ == "__main__":
    sys.exit(main())
