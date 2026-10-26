#!/usr/bin/env python3
"""Resolved Life App settings, from the `life_app:` block of config.local.yml (tools/config.py).

    python3 tools/life-app/life_config.py            # JSON on stdout (build.mjs and the shell scripts read it)
    python3 tools/life-app/life_config.py get KEY    # one dotted key of that JSON, e.g. `site.repo`

Every key has a default, so a fresh clone with no config.local.yml builds with sample data. Environment variables
win over the file where noted (LIFE_APP_*). Never prints a secret: it returns the password and token FILE paths only.

The seven area ids are fixed (the app's code knows what each one shows); what is configurable per area is the
display name, the agent role(s) that feed it, its weight in the overall Life Health number (0 = shown, not counted)
and whether it is shown at all on Home (`enabled: false` hides it and drops it from the total).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import config  # noqa: E402  (tools/config.py: env -> config.local.yml -> default)

AREAS = [
    # id, default display name (the app UI is Italian), default role(s), data file(s)
    ("corpo", "Corpo", "fitness-coach", ["corpo.json"]),
    ("salute", "Salute", "health-advisor, psychologist", ["medico.json", "mente.json"]),
    ("lavoro", "Lavoro", "founder-assistant, linkedin-coach", ["lavoro.json"]),
    ("finanze", "Finanze", "accountant", ["finanze.json"]),
    ("relazioni", "Relazioni", "best-friend", ["relazioni.json"]),
    ("crescita", "Crescita", "best-friend", ["crescita.json"]),
    ("vita", "Vita", "best-friend", ["vita.json"]),
]


def g(key, default=None, env=None):
    v = config.get("life_app." + key, None, env)
    return default if v in (None, "", []) else v


def truthy(v, default=False):
    if v is None or v == "":
        return default
    return str(v).strip().lower() in ("1", "true", "yes", "on")


def num(v, default):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def resolve():
    home = os.path.expanduser("~")
    owner = str(g("owner_name", None, "LIFE_APP_OWNER") or config.owner())
    if owner in ("the owner", "Your Name", ""):
        owner = "Alex"
    first = owner.split()[0]
    cache = os.path.expanduser(str(g("cache_dir", os.path.join(home, ".cache", "life-app"), "LIFE_APP_CACHE")))
    site_repo = str(g("site.repo", "", "LIFE_APP_REPO"))
    pages = str(g("site.url", "", "LIFE_APP_URL"))
    if not pages and "/" in site_repo:
        o, n = site_repo.split("/", 1)
        pages = "https://%s.github.io/" % o if n.lower() == ("%s.github.io" % o).lower() else "https://%s.github.io/%s/" % (o, n)
    areas = []
    for aid, name, roles, files in AREAS:
        areas.append({
            "id": aid,
            "name": str(g("areas.%s.name" % aid, name)),
            "agents": str(g("areas.%s.agents" % aid, roles)),
            "weight": num(g("areas.%s.weight" % aid, 1), 1.0),
            # only the three "Altro" areas can be switched off; the others have their own tab in the app
            "enabled": truthy(g("areas.%s.enabled" % aid, "true"), True) if aid in ("relazioni", "crescita", "vita") else True,
            "files": files,
        })
    wb_on = truthy(g("writeback.enabled", "false", "LIFE_APP_WRITEBACK"))
    return {
        "enabled": truthy(g("enabled", "true"), True),
        "app_name": str(g("app_name", "Life", "LIFE_APP_NAME")),
        "description": str(g("description", "Life Health: tutte le aree della vita")),
        "lang": str(g("lang", "it")),
        "owner_name": owner,
        "owner_first": first,
        "owner_initial": first[:1].upper() or "L",
        # the words that mean "me" in the Chi column of data/finance/scadenzario.md (a row about you, not someone else)
        "owner_words": [w.lower() for w in config.get_list("life_app.owner_words", [first, "io", "me"])],
        "timezone": str(g("timezone", "Europe/Rome", "LIFE_APP_TZ")),
        "gym_label": str(g("labels.gym", "Palestra")),
        "password_file": os.path.expanduser(str(g("password_file", os.path.join(home, ".secrets", "life-app-password"), "LIFE_APP_PASSWORD_FILE"))),
        "cache_dir": cache,
        "salt_file": os.path.expanduser(str(g("salt_file", os.path.join(cache, "salt.txt"), "LIFE_APP_SALT_FILE"))),
        "avatar": os.path.expanduser(str(g("avatar", ""))) or None,
        "data_dir": os.path.join(ROOT, "data", "happiness"),
        "health_page": os.path.expanduser(str(g("health_page", os.path.join(HERE, "src", "health", "health-page.tsx")))),
        "site": {
            "repo": site_repo,                       # "<github-user>/<repo>", the separate PUBLIC Pages repo for the ciphertext
            "branch": str(g("site.branch", "main")),
            "url": pages,
            "token_file": os.path.expanduser(str(g("site.token_file", ""))) or None,
            "git_name": str(g("site.git_name", "life-app")),
            "git_email": str(g("site.git_email", "life-app@users.noreply.github.com")),
        },
        "writeback": {
            "enabled": wb_on,
            "repo": str(g("writeback.repo", "")),
            "branch": str(g("writeback.branch", "main")),
            "token_file": os.path.expanduser(str(g("writeback.token_file", os.path.join(home, ".secrets", "life-log-token")))),
        },
        "areas": areas,
    }


def main(argv):
    cfg = resolve()
    if len(argv) >= 2 and argv[0] == "get":
        v = cfg
        for k in argv[1].split("."):
            v = v.get(k) if isinstance(v, dict) else None
        print("" if v is None else (json.dumps(v) if isinstance(v, (dict, list)) else (str(v).lower() if isinstance(v, bool) else v)))
        return 0
    print(json.dumps(cfg, indent=1, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
