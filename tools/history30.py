#!/usr/bin/env python3
"""30-day history for the health Page DATA (top level `history`), from the committed body nodes data/body/body-YYYY-MM-DD.md.
usage: python3 tools/history30.py [FIRST_DATA_DAY]   (default: today - 6, i.e. the first of the 7 DATA days)
prints a JSON array of the 30 days BEFORE FIRST_DATA_DAY, oldest first, one compact object per day:
  {date, sleepMin, deepMin, remMin, awakeMin, bedtime, wakeTime, rhr, hrvMs, breathing, spo2, hrSleepMin, steps, activeKcal, zoneMin}
The Page uses it only for "your normal" (30-day norms, bands, arrows); scores stay on DATA.days. Missing values are null."""
import datetime as dt, json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
first = dt.date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else dt.date.today() - dt.timedelta(days=6)
K = {"sleepMin": "sleep_min", "deepMin": "deep_min", "remMin": "rem_min", "awakeMin": "awake_min", "bedtime": "bed", "wakeTime": "wake", "rhr": "rhr",
     "hrvMs": "hrv_ms", "breathing": "breathing", "spo2": "spo2", "hrSleepMin": "hr_sleep_min", "steps": "steps", "zoneMin": "zone_min"}
out = []
for i in range(30, 0, -1):
    d = str(first - dt.timedelta(days=i)); f = os.path.join(ROOT, f"data/body/body-{d}.md")
    if not os.path.exists(f): continue
    t = open(f, encoding="utf-8").read(); m = re.match(r"---\n(.*?)\n---", t, re.S); fm = {}
    for line in (m.group(1) if m else "").splitlines():
        mm = re.match(r"^([a-z_0-9]+):\s*(.*)$", line)
        if mm: fm[mm.group(1)] = mm.group(2).strip().strip('"')
    row = {"date": d}
    for k, src in K.items():
        v = fm.get(src, "")
        if k in ("bedtime", "wakeTime"): row[k] = v or None; continue
        try: x = float(v); row[k] = int(x) if x.is_integer() else round(x, 2)
        except ValueError: row[k] = None
    a = re.search(r"^\| active \| ([0-9]+)[^|]*\| ([0-9]+)", t, re.M)
    row["activeKcal"] = int(a.group(2)) if a else None
    if row["sleepMin"] is None and row["rhr"] is None and row["steps"] is None: continue
    out.append(row)
print(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
