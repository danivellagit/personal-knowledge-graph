#!/usr/bin/env python3
"""Build the health page's DATA block from the graph: the body layer and the food log.

    python3 tools/health-app/fill_data.py [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--out FILE]

Default window: the 7 days ending today. Prints (or writes to FILE) the block in the shape
example-page.tsx documents, marker lines included, ready for
`tools/publish_health_app.sh --data FILE` (which is what `--fill` does for you).

Where each field comes from (a missing source leaves the field null, never a guess):
    kcalOut, steps, sleepMin, deepMin, remMin, bedtime, wakeTime, restingHr, hrvMs, workouts
                         -> the body layer's store (tools/body.py: body.db), if configured
    kcalIn, proteinG     -> data/food/food-<date>.md frontmatter (kcal_est, protein_g_est),
                            filled by the food log (tools/food.py); estimates from photos
    goals                -> health_app.goals.* in config.local.yml (only the ones you set)
    owner                -> the owner's first name (config `owner`)

Exits 3 with a message when neither source has anything for the window, so the publisher does
not push an empty dashboard. The output holds real health numbers: write it outside the repo
(the publisher keeps it in health_app.cache_dir).
"""
import argparse
import datetime as dt
import json
import os
import sys

TOOLS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, TOOLS)
import config  # noqa: E402
from graph import Node  # noqa: E402

GOALS = [("kcalIn", "kcal_in"), ("proteinG", "protein_g"), ("steps", "steps"),
         ("sleepMin", "sleep_min"), ("workoutsPerWeek", "workouts_per_week")]


def num(v):
    try:
        f = float(str(v).strip().strip("\"'"))
    except (TypeError, ValueError):
        return None
    return int(f) if f == int(f) else round(f, 1)


def body_days(dates):
    """{date: fields} from the body store, or {} when the layer is off / not set up."""
    if not config.enabled("body"):
        return {}
    db = config.get_path("body.db", "BODY_DB")
    if not db or not os.path.exists(db):
        return {}
    try:
        import body
        c = body.db()
        out = {}
        for d in dates:
            m = body.day_metrics(c, d)
            row = {"kcalOut": m.get("kcal"), "steps": m.get("steps"), "sleepMin": m.get("sleep_min"),
                   "deepMin": m.get("deep_min"), "remMin": m.get("rem_min"), "bedtime": m.get("bed"),
                   "wakeTime": m.get("wake"), "restingHr": m.get("rhr"), "hrvMs": m.get("hrv_ms"),
                   "workouts": [{"name": e["name"], "min": e["min"], "kcal": num(e.get("kcal")),
                                 "hrAvg": num(e.get("hr_avg"))} for e in m.get("_exercise", [])]}
            if any(v not in (None, []) for v in row.values()):
                out[d] = row
        return out
    except Exception as e:  # a broken store must not take the publisher down with a traceback
        sys.stderr.write("body layer unreadable (%s): body fields left empty\n" % e)
        return {}


def food_days(dates):
    out = {}
    for d in dates:
        p = os.path.join("data", "food", "food-%s.md" % d)
        if not os.path.exists(p):
            continue
        n = Node(p, open(p, encoding="utf8").read())
        row = {"kcalIn": num(n.get("kcal_est")), "proteinG": num(n.get("protein_g_est"))}
        if any(v is not None for v in row.values()):
            out[d] = row
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--from", dest="fr")
    ap.add_argument("--to")
    ap.add_argument("--out")
    a = ap.parse_args()
    config.chdir_repo()
    to = dt.date.fromisoformat(a.to) if a.to else dt.date.today()
    fr = dt.date.fromisoformat(a.fr) if a.fr else to - dt.timedelta(days=6)
    dates = [(fr + dt.timedelta(days=i)).isoformat() for i in range((to - fr).days + 1)]

    b, f = body_days(dates), food_days(dates)
    if not b and not f:
        print("nothing to fill for %s..%s: no body-layer days (body.db) and no food-log days "
              "(data/food/). Configure the body layer or log food, or pass --data FILE." % (dates[0], dates[-1]),
              file=sys.stderr)
        sys.exit(3)

    empty = {"kcalIn": None, "kcalOut": None, "proteinG": None, "steps": None, "sleepMin": None,
             "deepMin": None, "remMin": None, "bedtime": None, "wakeTime": None, "restingHr": None,
             "hrvMs": None, "workouts": []}
    days = [dict(empty, date=d, **b.get(d, {}), **f.get(d, {})) for d in dates]
    goals = {k: num(config.get("health_app.goals." + key)) for k, key in GOALS}
    notes = []
    if f:
        notes.append("Food numbers are estimates from meal photos.")
    if not b:
        notes.append("No wearable data: the body layer is not configured.")
    owner = config.owner_first()
    data = {
        "updatedAt": dt.datetime.now().strftime("%Y-%m-%dT%H:%M"),
        "owner": "" if owner == "the owner" else owner,
        "goals": {k: v for k, v in goals.items() if v is not None},
        "days": days,
        "notes": notes,
    }
    block = ("// ==== DATA:START (written by tools/health-app/fill_data.py) ====\n"
             "const DATA = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n"
             "// ==== DATA:END ====\n")
    if a.out:
        with open(a.out, "w", encoding="utf8") as fh:
            fh.write(block)
        print("DATA block for %s..%s: %d body days, %d food days -> %s" % (dates[0], dates[-1], len(b), len(f), a.out),
              file=sys.stderr)
    else:
        sys.stdout.write(block)


if __name__ == "__main__":
    main()
