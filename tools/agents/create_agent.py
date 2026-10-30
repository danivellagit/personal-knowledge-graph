#!/usr/bin/env python3
"""Create an agent from its role: give it a persona name, fill the placeholders, write its memory skeleton.

Every role in agents/<role>/ ships as a generic spec with placeholders ({{AGENT_NAME}}, {{AGENT_AGE}},
{{AGENT_CITY}}, ...). The persona is decided the moment the owner creates the agent, not in the template:

    python3 tools/agents/create_agent.py --list                        # roles, and which ones are created
    python3 tools/agents/create_agent.py fitness-coach                 # random invented name + age
    python3 tools/agents/create_agent.py fitness-coach --name "Rowan Hale" --age 38 --city "your city"
    python3 tools/agents/create_agent.py fitness-coach --dry-run       # show what it would do, write nothing
    python3 tools/agents/create_agent.py --all                         # every role not created yet
    python3 tools/agents/create_agent.py --new garden-helper --title "garden helper"   # a role not shipped here
    python3 tools/agents/create_agent.py fitness-coach --rename --name "New Name"      # change the persona name

What it does, for one role:
  1. agents/<role>/AGENT.md: replaces the placeholders with the persona (name, first name, age, city)
  2. data/agents/<role>/: copies agents/<role>/memory-skeleton/* there, placeholders filled, ONLY files that do
     not exist yet (an existing memory is never overwritten)
  3. config.local.yml: nothing is written; it prints the `agents.personas.<role>` line to add if you keep one
  4. prints the text for the runner (a Grok agent's description, a bot's system prompt): who the agent is and
     the line that sends it to agents/README.md ("New agent onboarding") on every conversation

Idempotent: a role already created (no placeholders left) is reported and left alone, unless --rename.
Names: --name, else agents.personas.<role> in config.local.yml, else a random pick from NAMES (invented
combinations, not anyone in particular) that no other agent of this repo already uses. --seed makes the pick
repeatable. City: --city, else agents.persona_city in config.local.yml, else "the owner's city".
No dependencies beyond the standard library.
"""
import argparse, datetime, os, random, re, shutil, sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(REPO, "tools"))
try:
    import config as _config   # tools/config.py: dependency-free reader of config.local.yml
except Exception:              # pragma: no cover
    _config = None

AGENTS = os.path.join(REPO, "agents")
DATA = os.path.join(REPO, "data", "agents")
SKILLS = os.path.join(REPO, "skills")
TEMPLATE_ROLE = "_template"
PLACEHOLDER = re.compile(r"\{\{(AGENT_NAME|AGENT_FIRST_NAME|AGENT_AGE|AGENT_CITY|CREATED|ROLE|ROLE_TITLE)\}\}")

# Invented first names and surnames, combined at random. Clearly generic; edit freely.
FIRST = ("Rowan Ines Teo Mara Elio Noa Jonah Lena Arlo Vera Milo Iris Ezra Talia Jasper Wren Oren Selma Felix "
         "Nadia Caspian Lior Hana Ivo Maren Tobin Edda Silas Juno Anouk Bram Calla Dario Ottilie Kai Liesel Ronan "
         "Yara Emil Saskia").split()
LAST = ("Hale Marlow Lindqvist Quill Brandt Okafor Varga Castell Ashby Morrow Sato Novak Ferrand Holloway Strand "
        "Vance Kowal Arden Abara Thorne Ilves Calder Wexley Rasku Penrose Dunmore Halvorsen Akers Lowell Sorel").split()
AGE_RANGE = {"psychologist": (42, 58), "accountant": (45, 60), "health-advisor": (38, 55), "legal": (42, 58), "best-friend": None}
DEFAULT_AGE = (30, 52)
ONBOARDING = ("At the start of every conversation: pull this repo, read agents/README.md (\"New agent onboarding\") "
              "and agents/{role}/AGENT.md, then data/agents/{role}/memory.md. Save every memory in "
              "data/agents/{role}/memory.md (never only in your own memory), mirror every routine in "
              "agents/{role}/routines/, commit and push at the end of every turn.")


def cfg(key):
    if _config is None: return None
    try:
        v = _config.parse(_config.LOCAL).get(key)
        return v if v not in ("", None, []) else None
    except Exception:
        return None


def roles():
    return sorted(d for d in os.listdir(AGENTS) if os.path.isfile(os.path.join(AGENTS, d, "AGENT.md")) and not d.startswith("_"))


def frontmatter(text):
    m = re.match(r"---\n(.*?)\n---", text, re.S)
    return m.group(1) if m else ""


def fm_value(text, key):
    m = re.search(r"^%s:\s*(.*?)\s*(#.*)?$" % key, frontmatter(text), re.M)
    return m.group(1).strip().strip('"') if m else ""


def persona_of(role):
    p = fm_value(open(os.path.join(AGENTS, role, "AGENT.md"), encoding="utf-8").read(), "persona")
    return "" if not p or "{{" in p else p


def title_of(role, text):
    m = re.search(r"^# (?:The )?(.+)$", text, re.M)
    return (m.group(1).strip() if m else role.replace("-", " ")).replace("{{AGENT_NAME}}", "").strip(" :") or role


def pick_name(role, rng):
    used = {persona_of(r) for r in roles() if r != role}
    used_first = {u.split()[0] for u in used if u}
    used_last = {u.split()[-1] for u in used if u}
    for _ in range(500):
        f, l = rng.choice(FIRST), rng.choice(LAST)
        if f not in used_first and l not in used_last:
            return "%s %s" % (f, l)
    raise SystemExit("could not find a free name; pass --name")


def pick_age(role, rng):
    lo, hi = AGE_RANGE.get(role) or DEFAULT_AGE
    return str(rng.randint(lo, hi))


def fill(text, values):
    return PLACEHOLDER.sub(lambda m: values[m.group(1)], text)


def write(path, text, dry, log):
    log.append(("write" if not os.path.exists(path) else "update", os.path.relpath(path, REPO)))
    if dry: return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh: fh.write(text)


def new_role(role, title, dry):
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", role): raise SystemExit("bad role slug %r (lowercase, hyphens)" % role)
    dst = os.path.join(AGENTS, role)
    if os.path.exists(os.path.join(dst, "AGENT.md")):
        print("role %s already exists: creating its persona instead" % role); return
    src = os.path.join(AGENTS, TEMPLATE_ROLE)
    log = []
    for root, _, files in os.walk(src):
        for f in files:
            s = os.path.join(root, f)
            rel = os.path.relpath(s, src)
            if rel.startswith("routines" + os.sep) and f.startswith("_"):   # the routine template stays in _template
                continue
            t = open(s, encoding="utf-8").read().replace("{{ROLE}}", role).replace("{{ROLE_TITLE}}", title)
            write(os.path.join(dst, rel), t, dry, log)
    if not dry: os.makedirs(os.path.join(dst, "routines"), exist_ok=True)
    launcher = ("---\nname: %s\ndescription: The owner's %s agent. Use when the owner calls it by role or by its persona name, "
                "or asks about its job (see agents/%s/AGENT.md).\n---\n\n# %s\n\nRead `agents/%s/AGENT.md` and act as that agent "
                "for the rest of the conversation. Read `agents/README.md` for the rules every agent inherits, then "
                "`data/agents/%s/memory.md`, before the first reply.\n") % (role, title, role, role, role, role)
    sk = os.path.join(SKILLS, role, "SKILL.md")
    if not os.path.exists(sk): write(sk, launcher, dry, log)
    for a, p in log: print("   %-6s %s" % (a, p))
    print("   new role %s from agents/_template: fill in its job, lane, memory sections and routines in AGENT.md, "
          "then add its row to the table in agents/README.md" % role)


def create(role, a, rng):
    p = os.path.join(AGENTS, role, "AGENT.md")
    if not os.path.exists(p): raise SystemExit("no agents/%s/AGENT.md (roles: %s; or --new %s)" % (role, " ".join(roles()), role))
    text = open(p, encoding="utf-8").read()
    current = persona_of(role)
    log = []
    rename = bool(current and a.rename)
    if current and not a.rename:
        print("== %s: already created as %s (use --rename --name ... to change it)" % (role, current))
        name = current
    else:
        name = a.name or cfg("agents.personas.%s" % role) or pick_name(role, rng)
        if not re.fullmatch(r"[^\n{}\"#]{2,60}", name): raise SystemExit("bad name %r" % name)
    values = {"AGENT_NAME": name, "AGENT_FIRST_NAME": name.split()[0], "AGENT_AGE": a.age or pick_age(role, rng),
              "AGENT_CITY": a.city or cfg("agents.persona_city") or "the owner's city",
              "CREATED": datetime.date.today().isoformat(), "ROLE": role, "ROLE_TITLE": title_of(role, text)}
    if rename:
        print("== %s: renaming %s -> %s" % (role, current, name))
        new = text.replace(current, name)
    elif not current:
        print("== %s: persona %s, %s, %s" % (role, name, values["AGENT_AGE"], values["AGENT_CITY"]))
        new = fill(text, values)
    else:
        new = text
    if new != text: write(p, new, a.dry_run, log)
    # its memory: the skeleton files that do not exist yet (data/ is local, so a fresh clone gets them again)
    sk = os.path.join(AGENTS, role, "memory-skeleton")
    files = sorted(os.listdir(sk)) if os.path.isdir(sk) else []
    for f in files:
        dst = os.path.join(DATA, role, f)
        if os.path.exists(dst):
            if rename:   # only the header (frontmatter, title) is renamed: the log keeps its history
                t = open(dst, encoding="utf-8").read()
                head, sep, rest = t.partition("\n## ")
                if current in head: write(dst, head.replace(current, name) + sep + rest, a.dry_run, log)
            continue
        write(dst, fill(open(os.path.join(sk, f), encoding="utf-8").read(), values), a.dry_run, log)
    if not files and not os.path.exists(os.path.join(DATA, role, "memory.md")):
        write(os.path.join(DATA, role, "memory.md"), "---\ntype: agent-memory\nagent: %s\nperson: \"[[_me]]\"\n---\n"
              "# %s: memory\n\n## Agreements\n\n## Open\n\n## Log\n" % (role, name), a.dry_run, log)
    for act, path in log: print("   %-6s %s%s" % (act, path, " (dry run)" if a.dry_run else ""))
    text = open(p, encoding="utf-8").read() if not a.dry_run else text
    desc = fm_value(text, "description").replace("{{AGENT_NAME}}", name)
    title = title_of(role, text)
    print("\n   config.local.yml (optional, keeps the name if AGENT.md is ever reset):")
    print("     agents:\n       personas:\n         %s: \"%s\"" % (role, name))
    print("\n   ---- text for the runner (agent description / system prompt) ----")
    print("   %s, the owner's %s (role: %s). Call it \"%s\". %s" % (name, title, role, name.split()[0], desc))
    print("   " + ONBOARDING.format(role=role))
    print("   ----")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("role", nargs="?", help="the role folder under agents/ (e.g. fitness-coach)")
    ap.add_argument("--name", help="the persona's full name (default: config, else a random invented name)")
    ap.add_argument("--age", help="the persona's age (default: random in a range that fits the role)")
    ap.add_argument("--city", help="the persona's city (default: agents.persona_city in config, else \"the owner's city\")")
    ap.add_argument("--seed", help="make the random pick repeatable")
    ap.add_argument("--all", action="store_true", help="create every role not created yet")
    ap.add_argument("--list", action="store_true", help="list the roles and their personas")
    ap.add_argument("--new", metavar="ROLE", help="scaffold a role that is not shipped, from agents/_template")
    ap.add_argument("--title", help="with --new: the role's title, e.g. \"garden helper\"")
    ap.add_argument("--rename", action="store_true", help="change the persona name of a created agent")
    ap.add_argument("--dry-run", action="store_true", help="print what would change, write nothing")
    a = ap.parse_args()
    rng = random.Random(a.seed)
    if a.list:
        for r in roles(): print("%-20s %s" % (r, persona_of(r) or "(not created)"))
        return
    if a.new:
        new_role(a.new, a.title or a.new.replace("-", " "), a.dry_run)
        if a.dry_run: return
        a.role = a.new
    if a.all:
        for r in roles():
            if not persona_of(r): create(r, argparse.Namespace(**dict(vars(a), name=None, age=None)), rng)
        return
    if not a.role: ap.error("give a role, --all, --list or --new ROLE")
    if a.rename and not a.name: ap.error("--rename needs --name")
    create(a.role, a, rng)


if __name__ == "__main__":
    main()
