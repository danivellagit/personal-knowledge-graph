#!/usr/bin/env python3
"""Write OBVIOUSLY FAKE sample data for every Life App area (data/happiness/*.json model), so a fresh clone builds.

    python3 tools/life-app/make_sample_data.py --out tools/life-app/sample-data          # the committed copy
    python3 tools/life-app/make_sample_data.py --out data/happiness --today 2030-01-14   # your local starting point

Dates are relative to --today (default: today), so the app opens on a live-looking week. Every name says "sample";
nothing here describes a real person. Deterministic: the same --today gives the same files.
"""
import argparse
import datetime as dt
import json
import os
import random


def iso(d):
    return d.strftime("%Y-%m-%d")


def hm(m):
    m %= 1440
    return "%02d:%02d" % (m // 60, m % 60)


def corpo(today, R):
    days = []
    for i in range(6, -1, -1):
        d = today - dt.timedelta(days=i)
        live = i == 0
        sleep = R.randint(380, 500)
        bed = 23 * 60 + R.randint(-50, 70)
        meals = [] if live else [
            {"time": "08:00", "name": "Breakfast", "dish": "Yogurt and fruit (sample)", "kcal": 350, "protein": 20.0, "carbs": 45.0, "fat": 8.0, "sugar": 25.0, "fibre": 4.0, "salt": 0.3},
            {"time": "13:00", "name": "Lunch", "dish": "Pasta with tomato sauce (sample)", "kcal": 650, "protein": 25.0, "carbs": 95.0, "fat": 15.0, "sugar": 9.0, "fibre": 7.0, "salt": 1.8},
            {"time": "20:00", "name": "Dinner", "dish": "Chicken and vegetables (sample)", "kcal": 600, "protein": 45.0, "carbs": 40.0, "fat": 22.0, "sugar": 8.0, "fibre": 9.0, "salt": 1.5},
        ]
        workouts = []
        if i in (5, 2):
            workouts.append({"time": "18:30", "name": "Gym (sample)", "status": "fatto", "detail": "Sample workout", "kind": "palestra", "kcal": 320, "durationMin": 55, "avgHr": 118})
        if i == 3:
            workouts.append({"time": "19:00", "name": "Tennis (sample)", "status": "fatto", "detail": "Sample match", "kind": "tennis", "kcal": 480, "durationMin": 75, "avgHr": 132})
        if live:
            workouts.append({"time": "19:00", "name": "Gym (sample)", "status": "pianificato", "detail": "Scheduled", "kind": "palestra"})
        prot = sum(m["protein"] for m in meals) or None
        days.append({
            "date": iso(d), "eatenKcal": sum(m["kcal"] for m in meals) or None, "proteinG": prot,
            "burnedKcal": None if live else 2300 + R.randint(-150, 250), "activeKcal": R.randint(350, 800), "basalKcal": 1750,
            "fitbitTotalKcal": None, "steps": R.randint(4000, 11000) if not live else 3500, "incomplete": live, "note": None,
            "meals": meals, "workouts": workouts,
            "sleepMin": sleep, "deepMin": int(sleep * 0.17), "remMin": int(sleep * 0.22), "inBedMin": sleep + 25, "awakeMin": 25, "wakeups": 2,
            "bedtime": hm(bed), "wakeTime": hm(bed + sleep + 25), "rhr": 56 + R.randint(-3, 4), "hrvMs": round(48 + R.uniform(-8, 8), 1),
            "spo2": round(96 + R.uniform(-1, 1), 1), "spo2Low": 91.0, "breathing": round(14 + R.uniform(-1, 1), 1), "tempDev": round(R.uniform(-0.3, 0.3), 1), "hrSleepMin": 50,
        })
    hist = []
    for i in range(37, 7, -1):
        d = today - dt.timedelta(days=i)
        s = R.randint(380, 500)
        hist.append({"date": iso(d), "sleepMin": s, "deepMin": int(s * 0.17), "remMin": int(s * 0.22), "awakeMin": 25,
                     "bedtime": hm(23 * 60 + R.randint(-40, 60)), "wakeTime": hm(7 * 60 + R.randint(-30, 40)), "rhr": 57 + R.randint(-3, 3),
                     "hrvMs": round(47 + R.uniform(-8, 8), 1), "breathing": 14.0, "spo2": 96.0, "hrSleepMin": 51,
                     "steps": R.randint(4000, 11000), "zoneMin": R.randint(0, 40), "activeKcal": R.randint(300, 800)})
    stages = {x["date"]: "W0+5 L5+60 D65+40 L105+70 R175+30 L205+90 D295+20 L315+60 R375+35 W410+5" for x in days}
    zones = {"rhr": 56, "max": 188, "days": {x["date"]: [R.randint(10, 60), R.randint(0, 25), R.randint(0, 10), 0, 0] for x in days}}
    return {
        "updatedAt": iso(today) + "T08:00", "today": iso(today), "proteinTarget": 120, "stepsGoal": 8000,
        "days": days,
        "upcoming": [{"date": iso(today + dt.timedelta(days=2)), "time": "19:00", "name": "Tennis (sample)", "kind": "tennis", "detail": "Sample match"}],
        "gymWeeklyGoal": 2, "sportWeeklyGoal": {"count": 1, "kinds": ["tennis"]},
        "tomorrowFirst": {"date": iso(today + dt.timedelta(days=1)), "time": "09:00", "title": "Sample appointment"},
        "history": hist, "stages": stages, "zones": zones,
        "bioAge": {"updatedAt": iso(today), "birthDate": "1990-01-01", "heightCm": 175, "weightKg": 75, "weightDate": iso(today - dt.timedelta(days=3)),
                   "vo2max": None, "bodyFatPct": None, "labsDate": iso(today - dt.timedelta(days=120)),
                   "labs": {"totalChol": 180, "ldl": 100, "hdl": 55, "tg": 110, "glucose": 88, "hba1c": 5.2, "uricAcid": 5.5, "kidneyOk": True, "liverOk": True}},
        "coach": {"updatedAt": iso(today) + "T08:00", "headline": "Sample week", "verdict": "Fake data: replace it with yours.",
                  "actions": ["In bed by 23:00 tonight (sample).", "One more protein meal today (sample)."]},
    }


def medico(today):
    lab = iso(today - dt.timedelta(days=120))
    item = lambda n, v, u, ref, lo, hi, mn, mx: {"name": n, "value": str(v), "unit": u, "ref": ref, "status": "ok",
                                                  "bar": {"v": v, "lo": lo, "hi": hi, "min": mn, "max": mx}}
    return {
        "updated": iso(today), "lab": {"name": "Sample lab", "site": "Sample site", "date": lab, "reports": 1, "outOfRange": 0},
        "nextLabs": iso(today + dt.timedelta(days=245)),
        "groups": [{"title": "Metabolism", "items": [item("Glucose", 88, "mg/dL", "70-100", 70, 100, 50, 130)]},
                   {"title": "Lipids", "items": [item("Total cholesterol", 180, "mg/dL", "≤ 190", None, 190, 100, 260),
                                                 item("HDL cholesterol", 55, "mg/dL", "≥ 40", 40, None, 20, 90)]}],
        "watch": "Sample values: replace them with your latest report.",
        "checks": [{"title": "Sample check-up", "sub": "One line for each check-up to do", "due": iso(today + dt.timedelta(days=30)), "dueText": "within a month", "status": "da fare"},
                   {"title": "Dentist (sample)", "sub": "Once a year", "due": None, "dueText": "every year", "status": "proposto"}],
        "meds": [], "visits": [], "family": "Sample: no family history entered.",
    }


def sfera(key, name, status, line, step):
    return {"key": key, "name": name, "status": status, "line": line, "steps": [step]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--today", default=None)
    ap.add_argument("--force", action="store_true", help="overwrite existing files (default: keep them)")
    a = ap.parse_args()
    today = dt.date.fromisoformat(a.today) if a.today else dt.date.today()
    R = random.Random(int(today.strftime("%Y%m%d")))
    d0 = iso(today)
    files = {
        "corpo": corpo(today, R),
        "medico": medico(today),
        "mente": {"updated": d0, "status": "bene", "line": "Sample: one line on how you are, only what you choose to share.", "tip": None},
        "lavoro": {"updated": d0, "priorita": {"status": "da seguire", "line": "Sample: three clear priorities for the week.", "steps": ["Pick priority number one (sample)."], "source": "sample"},
                   "tip": "Block two hours for priority number one (sample).", "source": "sample",
                   "priorities": [{"rank": 1, "titolo": "Sample project", "status": "da seguire", "line": "In progress", "q4": None, "next": "Sample next step", "quando": iso(today + dt.timedelta(days=4)), "source": "sample"}],
                   "sfere": [sfera("clienti", "Clients", "bene", "Sample: good relationships.", "A sample call."),
                             sfera("team", "Team", "da seguire", "Sample: alignment to improve.", "A sample 1:1.")],
                   "wins": [{"titolo": "Sample win", "data": iso(today - dt.timedelta(days=2)), "source": "sample"}],
                   "soddisfazione": None, "linkedin": None, "openLoops": ["Sample open item"],
                   "events": [{"date": iso(today + dt.timedelta(days=3)), "time": "10:00", "name": "Sample meeting"}]},
        "finanze": {"updated": d0, "spese": None, "margine": None,
                    "verdict": {"status": "bene", "line": "Sample: no urgent deadlines.", "steps": ["Check this month's deadlines (sample)."]}},
        "relazioni": {"updated": d0, "source": "sample",
                      "sfere": [sfera("famiglia", "Family", "bene", "Sample: talked this week.", "A sample phone call."),
                                sfera("amici", "Friends", "da seguire", "Sample: little time together.", "Suggest a dinner (sample).")]},
        "crescita": {"updated": d0, "status": "da seguire", "line": "Sample: one learning goal.", "source": "sample",
                     "sfere": [sfera("studio", "Study", "da seguire", "Sample: 2 hours a week.", "Half an hour today (sample).")]},
        "vita": {"updated": d0, "status": "bene", "line": "Sample: time for yourself.", "source": "sample",
                 "sfere": [sfera("hobby", "Hobbies", "bene", "Sample: one active hobby.", "Plan the weekend (sample).")],
                 "todo": [{"titolo": "Sample to-do", "quando": "this week", "data": iso(today + dt.timedelta(days=5)), "priorita": "media", "fonte": "personal-tasks"}]},
        "corpo-history": [],
        "life-health-history": [],
        "weekly-summary": {"week": today.strftime("%G-W%V"), "from": iso(today - dt.timedelta(days=today.weekday() + 7)),
                           "to": iso(today - dt.timedelta(days=today.weekday() + 1)), "generatedAt": d0 + "T08:00",
                           "conclusion": ["Sample week: these texts are fake.", "Your agent rewrites them every Monday."],
                           "good": ["Sample: regular sleep."], "bad": ["Sample: little movement."], "improve": ["Sample: two workouts."]},
    }
    os.makedirs(a.out, exist_ok=True)
    wrote = 0
    for name, v in files.items():
        p = os.path.join(a.out, name + ".json")
        if os.path.exists(p) and not a.force:
            continue
        with open(p, "w", encoding="utf8") as fh:
            json.dump(v, fh, ensure_ascii=False, indent=1)
            fh.write("\n")
        wrote += 1
    print("sample data: %d file(s) written to %s (today %s)" % (wrote, a.out, d0))


if __name__ == "__main__":
    main()
