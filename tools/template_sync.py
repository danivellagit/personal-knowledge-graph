#!/usr/bin/env python3
"""Bring the shared app/tooling code from a PRIVATE knowledge repo into a worktree of this PUBLIC template.

The Life App is meant to be the SAME code in both repos: everything personal lives in config.local.yml (gitignored)
and in data/ (gitignored here), never in the code. This script copies only the allowlisted shared paths, then
proves the result is anonymous and still builds, and commits to a sync branch. Nothing leaves the machine unless
asked: --push pushes the sync branch; --merge (only after every check passed) fast-forwards main to it, never forced.

    python3 tools/template_sync.py --source ~/my-knowledge --template ~/wt/template            # check + commit
    python3 tools/template_sync.py --source ... --template ... --dry-run                       # report only
    python3 tools/template_sync.py --source ... --template ... --push                          # + push sync branch
    python3 tools/template_sync.py --source ... --template ... --verify --require-gitleaks --push --merge   # daily

    python3 tools/template_sync.py --source ~/my-knowledge --detect [--template ~/wt/template] [--dry-run]  # daily, first
    python3 tools/template_sync.py --source ~/my-knowledge --resolve <id> [<id> ...]                         # after applying

--detect does not copy anything: it lists every change in the source since the last scan (added, modified, deleted,
renamed) that is NOT a generic SYNC file - agents, their rules, memory headings and routines, skills, tools, docs, the
data/ layout (structure only) - as PENDING items in a list and a report, classified by <source>/tools/template_sync.map.yml
(exclude / generic / anonymize / structure). Anonymizing needs judgment, so these are applied by hand, never verbatim.

Steps of the copy (any failure stops the run with exit code != 0 and nothing committed):
  1. source: read files from the source repo's last COMMIT (git show HEAD:path), never its working tree
  2. template: must be a clean git worktree; create/reset the branch sync/life-app-<YYYY-MM-DD> from origin/<--base>
  3. copy every allowlisted file that differs (SYNC); HOLD paths are template-owned and never overwritten;
     PENDING paths are reported but not copied while the source still carries personal values in them
  4. leak check over every tracked + new file of the template worktree:
       - denylist built AT RUNTIME from the source repo (never written here): owner name/short/aliases from
         data/_me.md, every full name in data/people/, company names in data/companies/, agent personas
         (persona: in agents/*/AGENT.md), every author email in the source git log, plus the optional private
         list <source>/tools/template_sync.denylist (one term per line)
       - generic patterns: emails (except noreply/example), phone numbers, /Users/<name>, the source repo path,
         agent store ids, GitHub tokens
       - gitleaks dir over the worktree (if gitleaks is installed; --require-gitleaks makes it mandatory)
       - file and folder names of the whole worktree against the same denylist
       - images: only files on IMAGE_OK may exist under synced paths, and no image may be byte-identical to any
         image in the source repo outside the shared icons (e.g. personal photos / assets)
  5. build with SAMPLE data in a throwaway copy (own HOME, own password, data/happiness from sample-data):
     tools/happiness.py init + tools/life-app/publish.sh --no-push; with --verify also tools/life-app/verify.mjs
  6. commit on the sync branch with --author 'Name <user@users.noreply.github.com>' as author AND committer
     (a GitHub noreply address is required), then check the identity and message of every new commit (base..HEAD)
     against the denylist; --push pushes the sync branch, --merge then fast-forwards main to it (plain push)
"""
import argparse, datetime, fnmatch, hashlib, json, os, re, shutil, subprocess, sys, tempfile

# ---- what is shared (paths relative to the repo root; globs) -------------------------------------------------
SYNC = [
    "tools/life-app/.gitignore", "tools/life-app/build.mjs", "tools/life-app/shell.html", "tools/life-app/sw.js",
    "tools/life-app/manifest.webmanifest", "tools/life-app/package.json", "tools/life-app/package-lock.json",
    "tools/life-app/area-modules.mjs", "tools/life-app/grok-canvas-shim.js", "tools/life-app/make_icons.py",
    "tools/life-app/training.mjs", "tools/life-app/training-patches.mjs", "tools/life-app/steps-patches.mjs",
    "tools/life-app/archive.mjs", "tools/life-app/archive-patches.mjs",
    "tools/life-app/*.fragments.txt", "tools/life-app/icons/*.png", "tools/life-app/src/*.ts", "tools/life-app/src/*.tsx",
    "tools/life-app/src/*.mjs", "tools/life-app/src/*.jsx", "tools/life-app/tests/*", "tools/life-app/life_config.py",
    "tools/happiness_eval.mjs", "tools/config.py", "tools/template_sync.py", "tools/template_sync.gitleaks.toml",
]
# template-owned: written for template users (or the template's own copy of the health page; an instance may build
# from a page kept elsewhere, life_app.health_page), never overwritten by a sync
HOLD = [
    "tools/life-app/README.md", "tools/life-app/DATA-MODEL.md", "tools/life-app/sample-data/*",
    "tools/life-app/src/health/*", "tools/life-app/publish.sh", "tools/life-app/setup.sh", "tools/life-app/verify.mjs",
    "tools/life-app/make_sample_data.py", "tools/happiness.py",
]
# shared in principle, but the source still has personal values in them: reported, not copied. Add a file here only
# while the source repo has not moved its personal values into config/data yet (empty since 2026-10-26).
PENDING = []
# instance files never copied (the instance's own committed config, secrets, generated output, private verifiers)
NEVER = ["tools/life-app/instance.yml", "config.local.yml", "*/node_modules/*", "*/out/*", "*/salt.txt", "*/verify_*.py", "*/verify.py",
         "*.pyc", "*/publish_life_app.sh"]
IMAGE_OK = ["tools/life-app/icons/*.png"]
IMG_EXT = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".bmp", ".tif", ".tiff", ".avif")
TEXT_SKIP = ("package-lock.json",)
# identity of every commit this script makes: --author "Name <user@users.noreply.github.com>" (or TEMPLATE_SYNC_AUTHOR,
# or the template worktree's git config). The email MUST be a GitHub noreply address; the name is the only personal
# value allowed in commit metadata, and in LICENSE (the copyright line) the only file where it may appear.
NOREPLY = re.compile(r"^[A-Za-z0-9._+-]+@users\.noreply\.github\.com$")
LICENSE_FILES = ("LICENSE",)
GITLEAKS_CFG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "template_sync.gitleaks.toml")


def run(cmd, cwd=None, check=True, env=None, capture=True):
    p = subprocess.run(cmd, cwd=cwd, env=env, text=True, capture_output=capture)
    if check and p.returncode != 0:
        raise SystemExit("FAILED: %s\n%s%s" % (" ".join(cmd), p.stdout or "", p.stderr or ""))
    return p


def git(repo, *a, check=True):
    return run(["git", "-C", repo, *a], check=check).stdout


def match(path, globs):
    return any(fnmatch.fnmatch(path, g) for g in globs)


def source_files(src):
    names = git(src, "ls-tree", "-r", "--name-only", "HEAD").splitlines()
    return [n for n in names if match(n, SYNC) and not match(n, NEVER)]


def show(src, path):
    return subprocess.run(["git", "-C", src, "show", "HEAD:" + path], capture_output=True, check=True).stdout


# ---- denylist (built from the source repo at runtime, kept in memory only) ----------------------------------
def fm(text):
    m = re.match(r"---\n(.*?)\n---", text, re.S)
    return m.group(1) if m else ""


def owner_name(src):
    me = os.path.join(src, "data", "_me.md")
    m = re.search(r"^name:\s*(.+)$", fm(open(me, encoding="utf-8").read()), re.M) if os.path.exists(me) else None
    return m.group(1).strip().strip('"') if m else None


def denylist(src):
    terms = set()
    me = os.path.join(src, "data", "_me.md")
    if os.path.exists(me):
        f = fm(open(me, encoding="utf-8").read())
        for k in ("name", "short"):
            m = re.search(r"^%s:\s*(.+)$" % k, f, re.M)
            if m: terms.add(m.group(1).strip().strip('"'))
        m = re.search(r"^aliases:\s*\[(.*)\]", f, re.M)
        if m: terms.update(a.strip().strip('"') for a in m.group(1).split(",") if a.strip())
    for sub, minlen in (("people", 0), ("companies", 5)):
        d = os.path.join(src, "data", sub)
        if os.path.isdir(d):
            for fn in os.listdir(d):
                if fn.endswith(".md") and fn != "README.md":
                    name = fn[:-3].replace("-", " ").strip()
                    if sub == "people" and " " in name:
                        terms.add(name)
                    elif sub == "companies" and len(name) > minlen:
                        # one-word company names that are also plain words (translated, amazon) only count Capitalised
                        terms.add(name if " " in name else name.capitalize())
    for root in ("agents",):
        d = os.path.join(src, root)
        if os.path.isdir(d):
            for a in os.listdir(d):
                p = os.path.join(d, a, "AGENT.md")
                if os.path.exists(p):
                    m = re.search(r"^persona:\s*([^#\n]+)", open(p, encoding="utf-8").read(), re.M)
                    if m and "Firstname" not in m.group(1):
                        full = re.sub(r"\(.*?\)", "", m.group(1)).strip()
                        terms.add(full); terms.add(full.split()[0])
    for e in git(src, "log", "--format=%ae%n%ce").splitlines():
        if e and "noreply" not in e: terms.add(e.strip())
    extra = os.path.join(src, "tools", "template_sync.denylist")
    if os.path.exists(extra):
        terms.update(l.strip() for l in open(extra, encoding="utf-8") if l.strip() and not l.startswith("#"))
    return sorted(t for t in terms if len(t) >= 3)


GENERIC = [
    ("email", re.compile(r"[A-Za-z0-9._%+-]+@(?!users\.noreply\.github\.com|noreply\.|example\.)[A-Za-z0-9.-]+\.[a-z]{2,}")),
    ("phone", re.compile(r"(?<![\w.])\+?\d{2,3}[ .-]?\d{3}[ .-]?\d{3,4}[ .-]?\d{3,4}(?![\w.])")),
    ("home path", re.compile(r"/Users/[A-Za-z]|/home/(?!box\b|runner\b|user\b)[a-z]+/")),
    ("store id", re.compile(r"store-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")),
    ("github token", re.compile(r"\b(ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{20,}")),
]


def compile_terms(terms):
    return [(t, re.compile(r"(?<![A-Za-z0-9])%s(?![A-Za-z0-9])" % re.escape(t), re.I if "@" in t or " " in t else 0)) for t in terms]


def text_hits(text, pats):
    return [label for label, rx in pats + GENERIC if rx.search(text)]


def name_scan(tpl, terms):
    """file and folder names of the whole worktree"""
    pats, hits = compile_terms(terms + [t.replace(" ", "-") for t in terms if " " in t]), []
    for f in git(tpl, "ls-files", "--cached", "--others", "--exclude-standard").splitlines():
        if text_hits(f.replace("_", " "), pats) or text_hits(f, pats): hits.append("%s [file name]" % f)
    return hits


def meta_scan(tpl, rev_range, terms, name, email):
    """author/committer of every commit in rev_range (the new commits only) must be exactly name <noreply email>;
    the message must not match the denylist at all"""
    pats, hits = compile_terms(terms), []
    for c in git(tpl, "rev-list", rev_range).split():
        an, ae, cn, ce = git(tpl, "show", "-s", "--format=%an%n%ae%n%cn%n%ce", c).splitlines()[:4]
        body = git(tpl, "show", "-s", "--format=%B", c)
        if (an, ae, cn, ce) != (name, email, name, email) or not NOREPLY.match(ae) or not NOREPLY.match(ce):
            hits.append("commit %s: author/committer %s <%s> / %s <%s> is not %s <%s>" % (c[:8], an, ae, cn, ce, name, email))
        if text_hits(body, pats):
            hits.append("commit %s: message matches the denylist" % c[:8])
    return hits


def author(tpl, given):
    raw = given or os.environ.get("TEMPLATE_SYNC_AUTHOR") or "%s <%s>" % (
        git(tpl, "config", "user.name", check=False).strip(), git(tpl, "config", "user.email", check=False).strip())
    m = re.match(r"^\s*(.+?)\s*<([^>]+)>\s*$", raw)
    if not m or not NOREPLY.match(m.group(2)):
        raise SystemExit("FAILED: commit identity %r: give --author 'Name <user@users.noreply.github.com>' (noreply email only)" % raw)
    return m.group(1), m.group(2)


def leak_scan(tpl, src, terms, owner=None):
    allowed_owner = re.search(r"github\.com[:/]([^/]+/[^/.\s]+)", git(tpl, "remote", "get-url", "origin", check=False) or "")
    allow = [allowed_owner.group(1)] if allowed_owner else []
    files = git(tpl, "ls-files", "--cached", "--others", "--exclude-standard").splitlines()
    pats = compile_terms(terms)
    pats.append(("source path", re.compile(re.escape(os.path.abspath(src)))))
    hits = []
    for f in files:
        p = os.path.join(tpl, f)
        if not os.path.isfile(p) or f.lower().endswith(IMG_EXT) or f.endswith(TEXT_SKIP): continue
        try: text = open(p, encoding="utf-8").read()
        except (UnicodeDecodeError, OSError): continue
        for a in allow: text = text.replace(a, "<template-repo>")
        if f in LICENSE_FILES and owner:   # the owner's name may stand in the copyright line, nothing else may
            text = re.sub(r"(?m)^(Copyright \(c\) \d{4}(-\d{4})? )%s\s*$" % re.escape(owner), r"\1<owner>", text)
        for n, line in enumerate(text.splitlines(), 1):
            for label, rx in pats + GENERIC:
                if rx.search(line):
                    hits.append("%s:%d [%s] %s" % (f, n, label if label in dict(GENERIC) or label == "source path" else "denylist", line.strip()[:140]))
    return hits


def image_check(tpl, src, changed):
    bad = []
    personal = {}
    for n in git(src, "ls-tree", "-r", "--name-only", "HEAD").splitlines():
        if n.lower().endswith(IMG_EXT) and not match(n, IMAGE_OK):
            personal[hashlib.sha256(show(src, n)).hexdigest()] = n
    for f in git(tpl, "ls-files", "--cached", "--others", "--exclude-standard").splitlines():
        if not f.lower().endswith(IMG_EXT): continue
        h = hashlib.sha256(open(os.path.join(tpl, f), "rb").read()).hexdigest()
        if h in personal: bad.append("%s is byte-identical to the source's %s" % (f, personal[h]))
        if f in changed and not match(f, IMAGE_OK): bad.append("%s: image not on the IMAGE_OK list" % f)
    return bad


def gitleaks(tpl, required):
    if not shutil.which("gitleaks"):
        if required: raise SystemExit("FAILED: gitleaks not installed (--require-gitleaks)")
        print("   gitleaks not installed: skipped (install it, or pass --require-gitleaks in routines)"); return []
    with tempfile.TemporaryDirectory() as tmp:
        stage = os.path.join(tmp, "tree")
        files = git(tpl, "ls-files", "--cached", "--others", "--exclude-standard").splitlines()
        for f in files:
            s = os.path.join(tpl, f)
            if os.path.isfile(s):
                os.makedirs(os.path.dirname(os.path.join(stage, f)), exist_ok=True); shutil.copy2(s, os.path.join(stage, f))
        rep = os.path.join(tmp, "r.json")
        cfg = ["--config", GITLEAKS_CFG] if os.path.exists(GITLEAKS_CFG) else []
        p = run(["gitleaks", "dir", stage, "--no-banner", "--redact", "--report-format", "json", "--report-path", rep, *cfg], check=False)
        if p.returncode == 0: return []
        try: found = json.load(open(rep))
        except Exception: return ["gitleaks failed: %s" % (p.stderr or p.stdout)[-400:]]
        return ["gitleaks %s %s:%s" % (x.get("RuleID"), x.get("File", "").replace(stage + "/", ""), x.get("StartLine")) for x in found]


def build_check(tpl, verify):
    with tempfile.TemporaryDirectory(prefix="tsync-") as tmp:
        kb = os.path.join(tmp, "kb")
        files = git(tpl, "ls-files", "--cached", "--others", "--exclude-standard").splitlines()
        for f in files:
            s = os.path.join(tpl, f)
            if os.path.isfile(s):
                d = os.path.join(kb, f); os.makedirs(os.path.dirname(d), exist_ok=True); shutil.copy2(s, d)
        nm = os.path.join(tpl, "tools", "life-app", "node_modules")
        if not os.path.isdir(nm):   # once per template clone (gitignored there)
            run(["npm", "ci", "--no-audit", "--no-fund", "--silent"], cwd=os.path.join(tpl, "tools", "life-app"))
        os.symlink(nm, os.path.join(kb, "tools", "life-app", "node_modules"))
        home = os.path.join(tmp, "home"); os.makedirs(os.path.join(home, ".secrets"))
        pw = os.path.join(home, ".secrets", "life-app-password"); open(pw, "w").write("sync-check-password\n")
        env = dict(os.environ, HOME=home, LIFE_APP_PASSWORD_FILE=pw, LIFE_APP_CACHE=os.path.join(home, ".cache", "life-app"))
        for k in ("LIFE_APP_REPO", "LIFE_LOG_TOKEN_FILE"): env.pop(k, None)
        run(["python3", "tools/happiness.py", "init"], cwd=kb, env=env)
        p = run(["bash", "tools/life-app/publish.sh", "--no-push"], cwd=kb, env=env, check=False)
        if p.returncode != 0: raise SystemExit("FAILED: build with sample data\n" + (p.stdout + p.stderr)[-3000:])
        if not os.path.exists(os.path.join(kb, "tools", "life-app", "out", "site", "index.html")):
            raise SystemExit("FAILED: build produced no out/site/index.html")
        print("   build with sample data: ok")
        if verify:
            p = run(["node", "tools/life-app/verify.mjs"], cwd=kb, env=env, check=False)
            if p.returncode != 0 or "ALL_OK" not in p.stdout: raise SystemExit("FAILED: verify.mjs\n" + (p.stdout + p.stderr)[-3000:])
            print("   verify.mjs (headless phone, password, every tab): ok")


# ---- architecture change detection (--detect): what changed in the source since the last scan --------------
# The copy above only handles SYNC paths (generic code, verbatim). Everything else that shapes the system (agents,
# their rules and routines, skills, tools, docs, the data/ layout) needs judgment to anonymize, so it is never
# copied: --detect lists it as PENDING items for the routine run to regenerate by hand in the template.
# The mapping lives in the SOURCE repo (<source>/tools/template_sync.map.yml, never synced): one `key: <json>` line
# per setting and one `- <json>` line per rule. State, pending list and report paths come from that file.
MAP_FILE = os.path.join("tools", "template_sync.map.yml")
DATED = re.compile(r"\d{4}-\d{2}(-\d{2})?")


def load_map(src):
    path = os.path.join(src, MAP_FILE)
    if not os.path.exists(path): raise SystemExit("FAILED: no %s in the source repo" % MAP_FILE)
    cfg, rules = {}, []
    for n, line in enumerate(open(path, encoding="utf-8"), 1):
        t = line.strip()
        if not t or t.startswith("#") or t == "rules:": continue
        try:
            if t.startswith("- "): rules.append(json.loads(t[2:]))
            else:
                k, v = t.split(":", 1); cfg[k.strip()] = json.loads(v.strip())
        except ValueError as e:
            raise SystemExit("FAILED: %s:%d: %s" % (MAP_FILE, n, e))
    for r in rules:
        r["_rx"] = glob_rx(r["source"])
    cfg["rules"] = rules
    return cfg


def glob_rx(g):
    out, i = "", 0
    while i < len(g):
        if g.startswith("**/", i): out += "(.*/)?"; i += 3
        elif g.startswith("**", i): out += "(.*)"; i += 2
        elif g[i] == "*": out += "([^/]*)"; i += 1
        else: out += re.escape(g[i]); i += 1
    return re.compile("^%s$" % out)


def classify(path, cfg):
    """-> (mode, template target, rule) for one source path"""
    aliases = cfg.get("aliases", {})
    def target(rule, m):
        t = rule.get("template", path)
        for i, grp in enumerate(m.groups(), 1):
            grp = (grp or "").rstrip("/")
            if i == 1: grp = aliases.get(grp, grp)
            t = t.replace("{%d}" % i, grp)
        return t
    if path in (cfg.get("state"), cfg.get("pending"), cfg.get("report")): return "exclude", None, {"why": "detector state"}
    for r in cfg["rules"]:
        if r["mode"] == "exclude" and r["_rx"].match(path): return "exclude", None, r
    if match(path, NEVER): return "exclude", None, {"why": "NEVER list"}
    if match(path, SYNC): return "generic", path, {"note": "SYNC list: copied verbatim by the sync step"}
    if match(path, HOLD): return "anonymize", path, {"note": "HOLD: template-owned version, update it by hand"}
    for r in cfg["rules"]:
        m = r["_rx"].match(path)
        if m and r["mode"] != "exclude": return r["mode"], target(r, m), r
    return "unclassified", path, {"note": "no rule: port it anonymized, or add a rule to the map"}


def headings(src, rev, path):
    p = subprocess.run(["git", "-C", src, "show", "%s:%s" % (rev, path)], capture_output=True, text=True)
    if p.returncode != 0: return set()
    return {l[3:].strip() for l in p.stdout.splitlines() if l.startswith("## ") and not DATED.search(l)}


def tree(src, rev, prefix):
    out = git(src, "ls-tree", "--name-only", rev, prefix.rstrip("/") + "/", check=False)
    return set(out.split())


def detect(src, tpl, since, dry, today):
    cfg = load_map(src)
    st_path, pend_path, rep_path = (os.path.join(src, cfg[k]) for k in ("state", "pending", "report"))
    state = json.load(open(st_path)) if os.path.exists(st_path) else {}
    head = git(src, "rev-parse", "HEAD").strip()
    base = since or state.get("last_scanned")
    pending = json.load(open(pend_path)) if os.path.exists(pend_path) else []
    if not base:
        raise SystemExit("FAILED: no last_scanned in %s: run --detect --baseline once (marks HEAD as synced)" % cfg["state"])
    if git(src, "cat-file", "-t", base, check=False).strip() != "commit":
        raise SystemExit("FAILED: last_scanned %s is not a commit of the source (history rewritten?): pass --since" % base[:10])
    print("== detect: %s..%s" % (base[:10], head[:10]))
    raw = git(src, "diff", "--name-status", "-M", base, head).splitlines()
    commits = git(src, "log", "--format=%h", "%s..%s" % (base, head)).split()
    found, auto, struct_seen = [], [], set()
    tpl_has = lambda t: bool(tpl and t and os.path.exists(os.path.join(tpl, t.split(" ")[0])))
    for line in raw:
        parts = line.split("\t")
        st, paths = parts[0][0], parts[1:]
        kind = {"A": "add", "M": "modify", "D": "delete", "R": "rename", "C": "add", "T": "modify"}.get(st, "modify")
        path = paths[-1]
        mode, tgt, rule = classify(path, cfg)
        old = paths[0] if kind == "rename" else None
        if old:
            omode, otgt, _ = classify(old, cfg)
            if mode == "exclude" and omode == "exclude": continue
            if mode == "exclude": path, mode, tgt, kind = old, omode, otgt, "delete"
            elif omode == "exclude": kind, old = "add", None
        if mode == "exclude": continue
        if mode == "structure":
            what = rule.get("what")
            if what == "headings":
                before, after = headings(src, base, old or path), headings(src, head, path)
                if kind in ("add", "delete") or before != after:
                    det = []
                    if kind == "add": det.append("new memory file")
                    if kind == "delete": det.append("memory file removed")
                    det += ["+ section: %s" % h for h in sorted(after - before)] if kind != "delete" else []
                    det += ["- section: %s" % h for h in sorted(before - after)] if kind != "add" else []
                    found.append(dict(kind="structure", mode=mode, source=path, template=tgt, detail="; ".join(det)))
                continue
            if what == "files":
                if kind in ("add", "delete", "rename"):
                    found.append(dict(kind="structure", mode=mode, source=path, template=tgt, old_source=old,
                                      detail={"add": "file added", "delete": "file removed", "rename": "file renamed"}[kind]))
                continue
            # folders: only a data/<x>/ that appears or disappears
            top = "/".join(path.split("/")[:2])
            if top in struct_seen: continue
            struct_seen.add(top)
            b, h = tree(src, base, "data"), tree(src, head, "data")
            if top in h and top not in b: found.append(dict(kind="structure", mode=mode, source=top + "/", template=tgt, detail="new folder in data/"))
            elif top in b and top not in h: found.append(dict(kind="structure", mode=mode, source=top + "/", template=tgt, detail="folder removed from data/"))
            continue
        if mode == "generic" and kind in ("add", "modify"):
            auto.append(path); continue
        item = dict(kind=kind, mode=mode, source=path, template=tgt, note=rule.get("note") or rule.get("why", ""))
        if old: item["old_source"] = old; item["old_template"] = classify(old, cfg)[1]
        if kind == "delete": item["template_exists"] = tpl_has(tgt)
        found.append(item)
    # merge into the pending list (keyed by source path; a file added then deleted before it was applied cancels out)
    idx = {(p["source"], p["kind"] == "structure"): p for p in pending}
    for f in found:
        key = (f["source"], f["kind"] == "structure")
        f = {k: v for k, v in f.items() if v not in (None, "")}
        prev = idx.get(key)
        if prev and prev["kind"] == "add" and f["kind"] == "delete" and not prev.get("old_source"):
            pending.remove(prev); idx.pop(key); continue
        if prev:
            kind = prev["kind"] if (prev["kind"] == "add" and f["kind"] == "modify") else f["kind"]
            if prev["kind"] == "delete" and f["kind"] == "add": kind = "modify"
            if f["kind"] == "structure" and prev.get("detail") and f.get("detail") and f["detail"] not in prev["detail"]:
                f["detail"] = prev["detail"] + "; " + f["detail"]
            prev.update(f, kind=kind, last_seen=today, commits=(prev.get("commits", []) + commits)[-10:])
        else:
            f.update(id=hashlib.sha1(("%s|%s|%s" % (f["source"], f["kind"], today)).encode()).hexdigest()[:8],
                     first_seen=today, last_seen=today, commits=commits[-10:])
            pending.append(f); idx[key] = f
    print("   %d change(s) since the last scan: %d pending item(s) touched, %d generic file(s) left to the sync step"
          % (len(raw), len(found), len(auto)))
    print("   pending now: %d" % len(pending))
    for p in pending:
        print("   PENDING %s %-9s %-11s %s -> %s" % (p["id"], p["kind"], p["mode"], p["source"], p.get("template") or "-"))
    if dry:
        print("== dry run: state, pending list and report not written"); return pending
    os.makedirs(os.path.dirname(st_path), exist_ok=True)
    state.update(last_scanned=head, last_run=today)
    json.dump(state, open(st_path, "w"), indent=1); open(st_path, "a").write("\n")
    write_pending(cfg, src, pending, state, auto)
    return pending


def write_pending(cfg, src, pending, state, auto=()):
    pend_path, rep_path = os.path.join(src, cfg["pending"]), os.path.join(src, cfg["report"])
    json.dump(pending, open(pend_path, "w"), indent=1); open(pend_path, "a").write("\n")
    groups = [("Pending to regenerate in the template (anonymized, never verbatim)", lambda p: p["mode"] == "anonymize" and p["kind"] in ("add", "modify")),
              ("Pending removals (deleted in the source)", lambda p: p["kind"] == "delete"),
              ("Pending renames", lambda p: p["kind"] == "rename"),
              ("Structure changes (data/ layout, memory headings: regenerate the skeleton or the layout doc)", lambda p: p["kind"] == "structure"),
              ("Unclassified (no rule in the map: port anonymized, or add a rule)", lambda p: p["mode"] == "unclassified" and p["kind"] in ("add", "modify"))]
    out = ["---", "type: agent-memory", "agent: tech-maintainer", 'person: "[[_me]]"', "---",
           "# Template sync: pending architecture changes", "",
           "Generated by `tools/template_sync.py --detect` (do not edit by hand). Last scanned source commit: `%s`, run %s."
           % (state.get("last_scanned", "")[:10], state.get("last_run", "")),
           "Apply each item in the template clone on a branch, by judgment (no personal value: names, places, companies,",
           "health, money, ids, phones, emails), leak-check with `tools/template_sync.py --dry-run`, merge, then",
           "`tools/template_sync.py --source . --resolve <id> ...`. Mapping: `%s`." % MAP_FILE, ""]
    for title, pick in groups:
        items = [p for p in pending if pick(p)]
        if not items: continue
        out += ["## %s (%d)" % (title, len(items)), "", "| id | change | source | template | since | note |", "| --- | --- | --- | --- | --- | --- |"]
        for p in items:
            src_s = ("%s -> %s" % (p["old_source"], p["source"])) if p.get("old_source") else p["source"]
            note = p.get("detail") or p.get("note", "")
            if p["kind"] == "delete" and "template_exists" in p: note = (note + "; " if note else "") + ("template path exists" if p["template_exists"] else "template path absent")
            tgt = p.get("template") or "-"
            if p.get("old_template") and p["old_template"] != tgt: tgt = "%s -> %s" % (p["old_template"], tgt)
            out.append("| %s | %s | `%s` | `%s` | %s | %s |" % (p["id"], p["kind"], src_s, tgt, p["first_seen"], str(note).replace("|", "/")))
        out.append("")
    if not pending: out += ["Nothing pending.", ""]
    if auto: out += ["Generic files changed in the last scan (copied verbatim by the sync step): %d." % len(auto), ""]
    open(rep_path, "w").write("\n".join(out))
    print("   wrote %s, %s" % (cfg["pending"], cfg["report"]))


def resolve(src, ids, today):
    cfg = load_map(src)
    pend_path = os.path.join(src, cfg["pending"])
    pending = json.load(open(pend_path)) if os.path.exists(pend_path) else []
    keep = [p for p in pending if p["id"] not in ids and "all" not in ids]
    gone = [p["id"] for p in pending if p not in keep]
    missing = [i for i in ids if i != "all" and i not in gone]
    st_path = os.path.join(src, cfg["state"])
    state = json.load(open(st_path)) if os.path.exists(st_path) else {}
    write_pending(cfg, src, keep, state)
    print("   resolved: %s%s" % (" ".join(gone) or "none", ("; unknown: " + " ".join(missing)) if missing else ""))


def baseline(src, today):
    cfg = load_map(src)
    st_path = os.path.join(src, cfg["state"])
    os.makedirs(os.path.dirname(st_path), exist_ok=True)
    state = json.load(open(st_path)) if os.path.exists(st_path) else {}
    state.update(last_scanned=git(src, "rev-parse", "HEAD").strip(), last_run=today, baseline=today)
    json.dump(state, open(st_path, "w"), indent=1); open(st_path, "a").write("\n")
    pend = os.path.join(src, cfg["pending"])
    write_pending(cfg, src, json.load(open(pend)) if os.path.exists(pend) else [], state)
    print("   baseline: last_scanned = %s" % state["last_scanned"][:10])


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--source", required=True, help="the private knowledge repo (read only)")
    ap.add_argument("--template", help="a worktree/clone of this template (required except for --detect/--resolve/--baseline)")
    ap.add_argument("--base", default="main", help="branch the sync branch starts from (default main)")
    ap.add_argument("--branch", default=None, help="default sync/life-app-<today>")
    ap.add_argument("--dry-run", action="store_true", help="report differences and leaks, change nothing")
    ap.add_argument("--verify", action="store_true", help="also run the headless phone check (needs playwright-core + chrome)")
    ap.add_argument("--require-gitleaks", action="store_true")
    ap.add_argument("--author", default=None, help="'Name <user@users.noreply.github.com>' for author AND committer")
    ap.add_argument("--push", action="store_true", help="push the sync branch to origin")
    ap.add_argument("--merge", action="store_true", help="after every check passed: also fast-forward origin/main to the sync "
                    "commit (plain push, never forced; refused by the server if main moved meanwhile)")
    ap.add_argument("--detect", action="store_true", help="architecture changes since the last scan -> pending list + report "
                    "(paths from <source>/tools/template_sync.map.yml); copies nothing")
    ap.add_argument("--since", help="with --detect: scan from this source commit instead of the state's last_scanned")
    ap.add_argument("--baseline", action="store_true", help="with --detect: mark the source HEAD as scanned, add nothing")
    ap.add_argument("--resolve", nargs="+", metavar="ID", help="drop applied items from the pending list ('all' for every one)")
    a = ap.parse_args()
    today = datetime.date.today().isoformat()
    src = os.path.abspath(os.path.expanduser(a.source))
    tpl = os.path.abspath(os.path.expanduser(a.template)) if a.template else None
    if a.resolve: return resolve(src, a.resolve, today)
    if a.detect and a.baseline: return baseline(src, today)
    if a.detect: detect(src, tpl, a.since, a.dry_run, today); return
    if not tpl: ap.error("--template is required")
    branch = a.branch or "sync/life-app-%s" % datetime.date.today().isoformat()
    if branch in ("main", "master") or not branch.startswith("sync/"):
        raise SystemExit("refusing branch %r: sync branches must be named sync/..." % branch)

    who, mail = author(tpl, a.author)
    print("== 1. source %s @ %s" % (src, git(src, "rev-parse", "--short", "HEAD").strip()))
    files = source_files(src)
    print("== 2. template %s" % tpl)
    if git(tpl, "status", "--porcelain").strip() and not a.dry_run:
        raise SystemExit("FAILED: template worktree has uncommitted changes; commit or stash them first")
    base = a.base
    if not a.dry_run:
        git(tpl, "fetch", "origin", check=False)
        base = "origin/" + a.base if git(tpl, "rev-parse", "--verify", "-q", "origin/" + a.base, check=False).strip() else a.base
        git(tpl, "checkout", "-q", "-B", branch, base)
        print("   on %s from %s" % (branch, base))

    print("== 3. copy")
    changed, pending, held = [], [], []
    for f in files:
        if match(f, HOLD): held.append(f); continue
        data, dst = show(src, f), os.path.join(tpl, f)
        if os.path.exists(dst) and open(dst, "rb").read() == data: continue
        if match(f, PENDING):
            pending.append(f); continue
        changed.append(f)
        if not a.dry_run:
            os.makedirs(os.path.dirname(dst), exist_ok=True); open(dst, "wb").write(data)
            os.chmod(dst, 0o755 if data.startswith(b"#!") else 0o644)
    for f in changed: print("   copied  " + f)
    for f in pending: print("   PENDING " + f + " (differs; source not config-driven yet, not copied)")
    if not changed: print("   nothing new to copy")

    print("== 4. leak check")
    terms = denylist(src)
    print("   denylist: %d terms from the source repo (kept in memory, not printed)" % len(terms))
    hits = leak_scan(tpl, src, terms, owner_name(src)) + name_scan(tpl, terms) + image_check(tpl, src, changed) + gitleaks(tpl, a.require_gitleaks)
    if hits:
        print("\n".join("   LEAK " + h for h in hits[:200]))
        if not a.dry_run: git(tpl, "checkout", "-q", "--", "."); git(tpl, "clean", "-qfd", "--", "tools")
        raise SystemExit("FAILED: %d leak(s); nothing committed. Move the value into config/data in the source repo." % len(hits))
    print("   clean")

    print("== 5. build with sample data")
    build_check(tpl, a.verify)

    if a.dry_run:
        print("== dry run: nothing written (%d to copy, %d pending)" % (len(changed), len(pending))); return
    print("== 6. commit")
    if not changed:
        git(tpl, "checkout", "-q", "--detach", base); git(tpl, "branch", "-q", "-D", branch, check=False)
        print("   nothing to commit (no sync branch kept)"); return
    git(tpl, "add", "--", *changed)
    msg = "sync: life app from upstream\n\n%s" % "\n".join("- " + f for f in changed)   # no source hash/path: nothing about the source
    if text_hits(msg, compile_terms(terms)): raise SystemExit("FAILED: commit message would leak")
    env = dict(os.environ, GIT_AUTHOR_NAME=who, GIT_AUTHOR_EMAIL=mail, GIT_COMMITTER_NAME=who, GIT_COMMITTER_EMAIL=mail)
    run(["git", "-C", tpl, "-c", "user.name=" + who, "-c", "user.email=" + mail, "commit", "-q", "-m", msg], env=env)
    print("   committed on %s as %s <%s>" % (branch, who, mail))
    bad = meta_scan(tpl, "%s..HEAD" % base, terms, who, mail)
    if bad:
        print("\n".join("   LEAK " + h for h in bad))
        raise SystemExit("FAILED: commit metadata check; the sync branch is NOT pushed (inspect it, then delete it)")
    print("   commit metadata (identity + message) of %s..HEAD: clean" % base)
    if a.push:
        git(tpl, "push", "-u", "origin", branch)
        print("   pushed origin/" + branch)
    if a.merge:
        git(tpl, "push", "origin", "HEAD:refs/heads/main")
        print("   merged: origin/main fast-forwarded to %s" % git(tpl, "rev-parse", "--short", "HEAD").strip())


if __name__ == "__main__":
    main()
