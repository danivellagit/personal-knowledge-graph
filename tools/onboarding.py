#!/usr/bin/env python3
"""First-run onboarding state: is this copy set up, and which optional integrations are done, skipped or for later.

    python3 tools/onboarding.py check            # exit 1 + one line per gap when the first run is still owed
    python3 tools/onboarding.py init             # write data/_setup.md (the checklist) if missing; never overwrites
    python3 tools/onboarding.py status           # the checklist next to what the machine actually shows (no network)
    python3 tools/onboarding.py mark <item> done|skipped|later|todo [-n "note"]

The procedure (the interview, the integrations menu) is skills/onboarding/SKILL.md; this tool only keeps the state.
The checklist lives in data/_setup.md (private, gitignored with the rest of data/ by default). Items:
"""
import datetime as dt
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import config  # noqa: E402

SETUP = os.path.join(ROOT, "data", "_setup.md")
ME = os.path.join(ROOT, "data", "_me.md")
LOCAL = os.path.join(ROOT, "config.local.yml")
STATES = ("todo", "done", "skipped", "later")
# key, label, how to do it later (what the owner says to the agent), the doc
ITEMS = [
    ("profile", "Your profile (data/_me.md) and config.local.yml", "say 'redo my profile'", "skills/onboarding/SKILL.md"),
    ("template-updates", "Template updates (remote `upstream`, weekly check that asks first)", "say 'check template updates'", "skills/template-updates/SKILL.md"),
    ("whatsapp", "WhatsApp, read-only (local bridge + hourly pull)", "say 'connect WhatsApp'", "SETUP-WHATSAPP.md"),
    ("bank", "Bank, read-only (Enable Banking, PSD2)", "say 'connect my bank'", "docs/setup/bank-enable-banking.md"),
    ("wearable", "Health wearable (Fitbit / Google Health; others untested)", "say 'connect my wearable'", "docs/setup/health-wearables.md"),
    ("mail-calendar", "Email and calendar (the agent runner's connectors, read-only)", "say 'connect my mail and calendar'", "docs/setup/email-calendar.md"),
    ("life-app", "Life App on your phone", "say 'set up the Life App'", "tools/life-app/README.md"),
    ("agents", "Agents (personas + memory)", "say 'create my agents'", "agents/README.md"),
    ("always-on", "Always-on agents (routines on a scheduler)", "say 'run my agents on a schedule'", "docs/setup/always-on-agents.md"),
]
__doc__ += "".join("  %-17s %s\n" % (k, l) for k, l, _, _ in ITEMS)
LINE = re.compile(r"^- \[(?P<box>[ x~-])\] (?P<key>[a-z-]+): (?P<state>todo|done|skipped|later)(?P<rest>.*)$")


def today():
    return dt.date.today().isoformat()


def placeholder_me():
    if not os.path.exists(ME):
        return "data/_me.md is missing"
    with open(ME, encoding="utf8") as fh:
        t = fh.read()
    if re.search(r"^onboarding:\s*pending", t, re.M) or "Your Name" in t or "{{" in t:
        return "data/_me.md is still the placeholder"
    return None


def config_gap():
    if not os.path.exists(LOCAL):
        return "config.local.yml is missing (cp config.example.yml config.local.yml)"
    owner = str(config.get("owner", "") or "")
    if not owner or owner == "Your Name":
        return "config.local.yml still has owner: \"Your Name\""
    return None


def read_items():
    out = {}
    if os.path.exists(SETUP):
        with open(SETUP, encoding="utf8") as fh:
            for line in fh:
                m = LINE.match(line.rstrip("\n"))
                if m:
                    out[m.group("key")] = (m.group("state"), m.group("rest"))
    return out


BOX = {"todo": " ", "done": "x", "skipped": "-", "later": "~"}


def render(items):
    lines = ["---", "name: First-run setup checklist", "type: setup", "updated: %s" % today(), "---", "",
             "# Setup checklist", "",
             "<!-- Written by tools/onboarding.py (init / mark). One line per item: done, skipped or later. Anything",
             "     skipped or left for later can be done any time: say the phrase in the line to your agent. -->", ""]
    for key, label, later, doc in ITEMS:
        state, rest = items.get(key, ("todo", ""))
        if not rest:
            rest = " - %s. Later: %s (%s)" % (label, later, doc)
        lines.append("- [%s] %s: %s%s" % (BOX[state], key, state, rest))
    lines += ["", "Legend: [x] done, [-] skipped, [~] later, [ ] not asked yet.", "", "Related: [[_me]]", ""]
    return "\n".join(lines)


def write_setup(items):
    os.makedirs(os.path.dirname(SETUP), exist_ok=True)
    with open(SETUP, "w", encoding="utf8") as fh:
        fh.write(render(items))


def cmd_check(quiet=False):
    gaps = [g for g in (config_gap(), placeholder_me()) if g]
    if not os.path.exists(SETUP):
        gaps.append("data/_setup.md is missing (the integrations menu was never offered)")
    else:
        todo = [k for k, (s, _) in read_items().items() if s == "todo"]
        missing = [k for k, *_ in ITEMS if k not in read_items()]
        if todo or missing:
            gaps.append("integrations not asked yet: %s" % ", ".join(todo + missing))
    if not gaps:
        if not quiet:
            print("onboarding: done")
        return 0
    print("onboarding: first run owed -> skills/onboarding/SKILL.md")
    for g in gaps:
        print("  - " + g)
    return 1


def probe(key):
    """what the machine shows, no network, never a secret value"""
    def run(*a):
        try:
            return subprocess.run(list(a), cwd=ROOT, capture_output=True, text=True, timeout=20)
        except (OSError, subprocess.TimeoutExpired):
            return None
    if key == "profile":
        g = config_gap() or placeholder_me()
        return g or "ok"
    if key == "template-updates":
        r = run("git", "remote", "get-url", "upstream")
        rem = "remote upstream set" if r and r.returncode == 0 else "no `upstream` remote"
        return "%s; %s" % (rem, ".template-version present" if os.path.exists(os.path.join(ROOT, ".template-version"))
                           else "no .template-version")
    if key == "whatsapp":
        db = config.get_path("whatsapp.bridge_db", "WHATSAPP_DB")
        if not db:
            return "whatsapp.bridge_db not set"
        return "bridge store %s" % ("found" if os.path.exists(db) else "NOT FOUND at the configured path")
    if key == "bank":
        sec = os.path.expanduser(config.get("banks.secrets_dir", "~/.secrets/enablebanking", "EB_SECRETS_DIR"))
        app = os.path.exists(os.path.join(sec, "app.json"))
        banks = os.path.isdir(os.path.join(sec, "banks")) and [f for f in os.listdir(os.path.join(sec, "banks")) if f.endswith(".json")]
        return "app %s; %d bank(s) linked (python3 tools/bank_sync.py status for expiry)" % (
            "configured" if app else "not configured", len(banks or []))
    if key == "wearable":
        cli = config.get_path("body.cli", "GHEALTH")
        return "body.cli %s; body.enabled=%s" % ("found" if cli and os.path.exists(cli) else "not set/not found",
                                                 config.get("body.enabled", "false"))
    if key == "life-app":
        return "site repo %s" % ("set" if config.get("life_app.site.repo", None, "LIFE_APP_REPO") else "not set")
    if key == "agents":
        n = 0
        d = os.path.join(ROOT, "agents")
        for a in (os.listdir(d) if os.path.isdir(d) else []):
            p = os.path.join(d, a, "AGENT.md")
            if not a.startswith("_") and os.path.exists(p):
                with open(p, encoding="utf8") as fh:
                    if "{{AGENT_NAME}}" not in fh.read():
                        n += 1
        return "%d agent(s) created" % n
    return "-"


def cmd_status():
    items = read_items()
    if not items:
        print("no data/_setup.md yet (python3 tools/onboarding.py init)")
    for key, label, later, doc in ITEMS:
        state = items.get(key, ("todo", ""))[0]
        print("%-8s %-17s %s  [%s]" % (state, key, label, probe(key)))
    return 0


def cmd_mark(key, state, note):
    if key not in [k for k, *_ in ITEMS]:
        raise SystemExit("unknown item %r; one of: %s" % (key, ", ".join(k for k, *_ in ITEMS)))
    if state not in STATES:
        raise SystemExit("state must be one of: %s" % ", ".join(STATES))
    items = read_items()
    label, later, doc = [(l, la, d) for k, l, la, d in ITEMS if k == key][0]
    rest = " (%s) - %s%s. Later: %s (%s)" % (today(), label, (": " + note) if note else "", later, doc)
    items[key] = (state, rest)
    write_setup(items)
    print("%s: %s" % (key, state))
    return 0


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    cmd = argv[0]
    if cmd == "check":
        return cmd_check("--quiet" in argv)
    if cmd == "init":
        if os.path.exists(SETUP):
            print("data/_setup.md exists: kept")
            return 0
        write_setup({})
        print("wrote data/_setup.md")
        return 0
    if cmd == "status":
        return cmd_status()
    if cmd == "mark" and len(argv) >= 3:
        note = argv[argv.index("-n") + 1] if "-n" in argv and argv.index("-n") + 1 < len(argv) else ""
        return cmd_mark(argv[1], argv[2], note)
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
