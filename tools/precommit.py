#!/usr/bin/env python3
"""Pre-commit guard for this knowledge repo, run by `.githooks/pre-commit` on the STAGED files only.

Blocks a commit when a staged file:
  size     is bigger than 1 MiB (the machine ledgers in data/_gaps/ may grow to 5 MiB)
  layout   does not belong in the repo: logs, databases, archives, keys, caches, build output,
           media outside tools/<app>/{icons,assets}/, any new top-level entry
  secrets  contains a credential (gitleaks on the staged diff; regex fallback without gitleaks)
  lint     carries a mechanical graph finding (`tools/lint.py` class MECH) touching that file
  happiness  a data/happiness/*.json that fails `tools/happiness.py validate`, or a data/happiness/*.md recap
           without its generated header (recaps are written by `tools/happiness.py recap`, never by hand; the weekly
           conclusion weekly-summary*.md by `tools/weekly_summary.py --render`)

Emergency skip, never as habit (every skip is logged and reported by `tools/wt.sh doctor`):
    DK_PRECOMMIT_SKIP=lint DK_PRECOMMIT_REASON="why" git commit ...   # or size,layout,secrets,happiness / all
`git commit --no-verify` is not the sanctioned way: it leaves no trace.

Prints file paths and rule names only, never a secret value.
"""

import os
import re
import sys
import json
import shutil
import datetime
import tempfile
import subprocess
import concurrent.futures as cf

MAX = 1024 * 1024
LEDGER_MAX = 5 * 1024 * 1024
LEDGERS = {"data/_gaps/register.jsonl", "data/_gaps/history.jsonl"}

TOP_LEVEL = {"AGENTS.md", "CLAUDE.md", "LEGEND.md", "README.md", "anatomy.md", "config.example.yml", "LICENSE",
             "SETUP-WHATSAPP.md",
             ".gitignore", ".gitattributes", ".githooks", ".claude", ".grok", ".obsidian",
             "agents", "data", "skills", "tools"}
BAD_EXT = {".log", ".db", ".sqlite", ".sqlite3", ".gz", ".tgz", ".zip", ".tar", ".7z", ".rar",
           ".bz2", ".xz", ".pyc", ".pem", ".key", ".p12", ".pfx", ".crt", ".der", ".jks", ".kdbx",
           ".bak", ".tmp", ".swp", ".orig", ".rej", ".patch"}
MEDIA_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".heif", ".svg", ".ico", ".pdf",
             ".mp4", ".mov", ".m4a", ".mp3", ".ogg", ".opus", ".wav", ".docx", ".xlsx", ".pptx"}
MEDIA_OK = re.compile(r"^tools/[^/]+/(icons|assets)/")
# Bank data: raw movements never enter the repo; an optional bank-sync folder holds monthly totals + README only.
BANK_EXPORT_DIR = "data/finance/bank/"
BANK_EXPORT_OK = {"README.md", "monthly-totals.md", "monthly-totals.json"}
RAW_FINANCE = re.compile(r"^(transactions-\d{4}-\d{2}\.csv|balances\.json)$")
IBAN = re.compile(r"\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,4})?\b")
BAD_PART = {"node_modules", "__pycache__", ".venv", "venv", "out", "dist", ".next", "_archive"}
BAD_NAME = re.compile(r"^(\.env(\..*)?|config\.local.*|\.DS_Store|id_rsa.*|id_ed25519.*|.*\.secret.*)$")

FALLBACK = [
    ("aws-access-key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("github-token", re.compile(r"\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b")),
    ("gitlab-token", re.compile(r"\bglpat-[A-Za-z0-9_-]{20,}\b")),
    ("slack-token", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}\b")),
    ("openai-anthropic-key", re.compile(r"\bsk-(ant-)?[A-Za-z0-9_-]{32,}\b")),
    ("google-api-key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("stripe-key", re.compile(r"\b[rs]k_live_[0-9A-Za-z]{20,}\b")),
    ("private-key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
    ("password-assignment", re.compile(r"(?i)\b(password|passwd|api[_-]?key|secret|token)\s*[:=]\s*['\"][^'\"\s]{12,}['\"]")),
]


def git(*a, **kw):
    return subprocess.run(["git"] + list(a), capture_output=True, text=kw.pop("text", True), **kw)


def staged():
    out = git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z").stdout
    return [p for p in out.split("\0") if p]


def check_size(files):
    bad = []
    for p in files:
        r = git("cat-file", "-s", ":" + p)
        if r.returncode:
            continue
        size = int(r.stdout.strip())
        cap = LEDGER_MAX if p in LEDGERS else MAX
        if size > cap:
            bad.append("%s is %.1f MiB (cap %d MiB): keep raw data and binaries out of the repo"
                       % (p, size / 1048576, cap // 1048576))
    return bad


def check_layout(files):
    bad = []
    for p in files:
        parts = p.split("/")
        name = parts[-1]
        ext = os.path.splitext(name)[1].lower()
        if parts[0] not in TOP_LEVEL:
            bad.append("%s: new top-level entry; the repo layout is %s" % (p, ", ".join(sorted(TOP_LEVEL))))
        elif p.startswith(BANK_EXPORT_DIR) and p[len(BANK_EXPORT_DIR):] not in BANK_EXPORT_OK:
            bad.append("%s: raw bank data never enters the repo (only %s); raw files live in "
                       "a private folder outside the repo" % (p, ", ".join(sorted(BANK_EXPORT_OK))))
        elif RAW_FINANCE.match(name):
            bad.append("%s: looks like a raw bank export (transactions/balances); keep it in "
                       "a private folder outside the repo" % p)
        elif p.startswith(BANK_EXPORT_DIR) and IBAN.search(git("show", ":" + p).stdout or ""):
            bad.append("%s: contains an IBAN-like string; the repo gets totals only" % p)
        elif BAD_NAME.match(name):
            bad.append("%s: local config / secret file, never committed" % p)
        elif ext in BAD_EXT:
            bad.append("%s: %s files (logs, databases, archives, keys, backups) stay out of the repo" % (p, ext))
        elif set(parts[:-1]) & BAD_PART:
            bad.append("%s: build output / dependency / cache folder" % p)
        elif ext in MEDIA_EXT and p.startswith("data/"):
            bad.append("%s: no images or media under data/ (git history cannot be cleaned). Personal photos "
                       "and documents live in a private folder outside the repo" % p)
        elif ext in MEDIA_EXT and not MEDIA_OK.match(p):
            bad.append("%s: media/documents only in tools/<app>/icons|assets/; personal files stay "
                       "off-repo (see anatomy.md)" % p)
    return bad


def find_gitleaks():
    for c in (shutil.which("gitleaks"), os.path.expanduser("~/.local/bin/gitleaks"),
              "/usr/local/bin/gitleaks", "/opt/homebrew/bin/gitleaks"):
        if c and os.access(c, os.X_OK):
            return c
    return None


def check_secrets(files):
    gl = find_gitleaks()
    if gl:
        fd, rep = tempfile.mkstemp(suffix=".json")
        os.close(fd)
        try:
            r = subprocess.run([gl, "git", "--pre-commit", "--staged", "--redact", "--no-banner",
                                "--log-level", "error", "--exit-code", "1",
                                "--report-format", "json", "--report-path", rep, "."],
                               capture_output=True, text=True)
            try:
                found = json.load(open(rep))
            except Exception:
                found = []
            if r.returncode not in (0, 1):
                return ["gitleaks failed to run (exit %d); fix it or skip secrets explicitly"
                        % r.returncode]
            return ["%s:%s  %s (gitleaks)" % (f.get("File"), f.get("StartLine"), f.get("RuleID"))
                    for f in found]
        finally:
            os.unlink(rep)
    # fallback: added lines of the staged diff
    bad = []
    diff = git("diff", "--cached", "-U0", "--no-color", "--diff-filter=ACMR").stdout
    cur, line = None, 0
    for l in diff.splitlines():
        if l.startswith("+++ "):
            cur = l[6:] if l.startswith("+++ b/") else None
        elif l.startswith("@@"):
            m = re.search(r"\+(\d+)", l)
            line = int(m.group(1)) if m else 0
        elif l.startswith("+") and cur:
            for rule, rx in FALLBACK:
                if rx.search(l):
                    bad.append("%s:%d  %s (regex fallback; install gitleaks)" % (cur, line, rule))
            line += 1
    return bad


def check_lint(files):
    rel = [p for p in files if (p.startswith("data/") and p.endswith(".md"))
           or p in ("tools/graph.py", "tools/checks.py")]
    if not rel:
        return []
    sys.path.insert(0, "tools")
    from checks import collect, MECH  # noqa: E402
    _n, _i, findings = collect()
    mech = [f for f in findings if f.cls == MECH]
    if any(p.startswith("tools/") for p in rel):
        return ["%s  %s" % (f.kind, f.detail) for f in mech]   # the checker itself changed
    paths = set(p for p in rel if p.startswith("data/"))
    slugs = set(os.path.splitext(os.path.basename(p))[0] for p in paths)
    bad = []
    for f in mech:
        parts = set(f.id.split(":"))
        if parts & paths or parts & slugs or any(p in f.detail for p in paths):
            bad.append("%s  %s" % (f.kind, f.detail))
    return bad


def check_happiness(files):
    """Staged area files must pass the schema; staged recaps must carry the generated header."""
    js = [p for p in files if p.startswith("data/happiness/") and p.endswith(".json")]
    mds = [p for p in files if p.startswith("data/happiness/") and p.endswith(".md")]
    if "tools/happiness.py" in files:
        if os.path.isdir("data/happiness"):
            js = sorted(set(js) | set("data/happiness/" + f for f in os.listdir("data/happiness") if f.endswith(".json")))
    bad = []
    if js:
        sys.path.insert(0, "tools")
        import happiness  # noqa: E402
        tmpdir = tempfile.mkdtemp()
        try:
            for p in js:
                blob = git("show", ":" + p, text=False)
                if blob.returncode:          # not staged (tools/happiness.py changed): check the working copy
                    src = p
                else:
                    src = os.path.join(tmpdir, os.path.basename(p))
                    with open(src, "wb") as fh:
                        fh.write(blob.stdout)
                bad += [e.replace(os.path.relpath(src, happiness.ROOT), p) for e in happiness.validate_file(src)]
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)
    for p in mds:
        r = git("show", ":" + p)
        mark = "<!-- GENERATED by tools/weekly_summary.py" if "/weekly-summary" in p else "<!-- GENERATED by tools/happiness.py recap"
        if r.returncode == 0 and mark not in r.stdout:
            bad.append("%s: recaps are generated (python3 tools/happiness.py recap), never hand-written" % p)
    return bad


def log_skip(skips):
    common = git("rev-parse", "--path-format=absolute", "--git-common-dir").stdout.strip()
    who = os.environ.get("DK_AGENT") or os.path.basename(os.getcwd())
    reason = os.environ.get("DK_PRECOMMIT_REASON", "").replace("\n", " ") or "NO REASON GIVEN"
    try:
        with open(os.path.join(common, "precommit-skips.log"), "a", encoding="utf8") as fh:
            fh.write("%s %s skip=%s reason=%s\n" % (datetime.datetime.now().strftime("%F %T"),
                                                     who, ",".join(sorted(skips)), reason))
    except OSError:
        pass
    print("pre-commit: SKIPPING %s (DK_PRECOMMIT_SKIP, logged: %s)" % (",".join(sorted(skips)), reason),
          file=sys.stderr)


def main():
    files = staged()
    if not files:
        return 0
    skips = set(x.strip() for x in os.environ.get("DK_PRECOMMIT_SKIP", "").split(",") if x.strip())
    if "all" in skips:
        skips = {"size", "layout", "secrets", "lint", "happiness"}
    if skips:
        log_skip(skips)
    checks = {"size": check_size, "layout": check_layout, "secrets": check_secrets,
              "lint": check_lint, "happiness": check_happiness}
    results = {}
    with cf.ThreadPoolExecutor(max_workers=4) as ex:
        fut = {ex.submit(fn, files): k for k, fn in checks.items() if k not in skips}
        for f in cf.as_completed(fut):
            k = fut[f]
            try:
                results[k] = f.result()
            except Exception as e:     # a broken check blocks loudly, never silently passes
                results[k] = ["check crashed: %s: %s" % (type(e).__name__, e)]
    failed = {k: v for k, v in results.items() if v}
    if not failed:
        return 0
    print("\npre-commit: commit BLOCKED", file=sys.stderr)
    hints = {
        "size": "move the file out of the repo (raw data lives off-repo).",
        "layout": "move it where it belongs, or out of the repo (an archive folder outside the repo).",
        "secrets": "remove the secret from the file (use an env var or ~/.secrets/), restage. Never paste it in chat.",
        "lint": "run  python3 tools/lint.py --fix && python3 tools/lint.py  and stage the files it changed.",
        "happiness": "fix the field named above in your area JSON (schema: tools/happiness.py), or rerun the publisher for recaps.",
    }
    for k in ("size", "layout", "secrets", "lint", "happiness"):
        if k in failed:
            print("\n  [%s] %d finding(s) -> %s" % (k, len(failed[k]), hints[k]), file=sys.stderr)
            for line in failed[k][:15]:
                print("     " + line, file=sys.stderr)
            if len(failed[k]) > 15:
                print("     ... +%d more" % (len(failed[k]) - 15), file=sys.stderr)
    print("\n  emergency only: DK_PRECOMMIT_SKIP=<check> DK_PRECOMMIT_REASON='...' (logged)",
          file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
