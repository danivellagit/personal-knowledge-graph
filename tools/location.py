#!/usr/bin/env python3
"""The location layer: Google Timeline exports + Overland batches -> one SQLite store, off-repo.

    python3 tools/location.py ingest        rebuild the store (<location.raw_dir>/location.db)
    python3 tools/location.py day DATE      the visits of a day (local time), longest first
    python3 tools/location.py summary       coverage and the places with the most hours

OPTIONAL. Configure it with `location.raw_dir` in config.local.yml (or the env var LOCATION_DIR):
a directory OUTSIDE the repo holding
    timeline/*.json            Google Maps Timeline exports (the on-device JSON export)
    overland/<date>/*.json     batches from the Overland iOS app, fetched by tools/location-pull.sh
The store is <location.raw_dir>/location.db (override with `location.db` / LOCATION_DB).
`location.enabled: false` switches the layer off.

Raw never enters git (see anatomy.md, "The location layer"). A visit carries Google's placeID and
coordinates only: a name comes from a real match, never from the coordinates.
"""
import datetime as dt
import json
import os
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402

_dir = config.get_path("location.raw_dir", "LOCATION_DIR")
ROOT = Path(_dir) if _dir else None
_db = config.get_path("location.db", "LOCATION_DB")
DB = Path(_db) if _db else (ROOT / "location.db" if ROOT else None)


def need(store=True):
    if not config.enabled("location") or ROOT is None or DB is None:
        config.not_configured("Location", [("location.raw_dir", "LOCATION_DIR")])
    if store and not DB.exists():
        print("no location store at %s yet: run `python3 tools/location.py ingest`." % DB)
        sys.exit(0)


def geo(s):
    lat, lng = s.removeprefix("geo:").split(",")
    return float(lat), float(lng)


def ingest():
    need(store=False)
    DB.parent.mkdir(parents=True, exist_ok=True)
    DB.unlink(missing_ok=True)
    db = sqlite3.connect(DB)
    db.executescript("""
      create table visit (start text, end text, day text, place_id text, lat real, lng real,
                          semantic text, prob real, source text, primary key (start, place_id));
      create table point (ts text primary key, lat real, lng real, acc real, battery real, source text);
    """)
    nv = np = 0
    for f in sorted((ROOT / "timeline").glob("*.json")):
        for s in json.load(open(f)):
            if "visit" in s:
                t = s["visit"]["topCandidate"]
                lat, lng = geo(t["placeLocation"])
                nv += db.execute("insert or ignore into visit values (?,?,?,?,?,?,?,?,?)", (
                    s["startTime"], s["endTime"], s["startTime"][:10], t.get("placeID"), lat, lng,
                    t.get("semanticType"), float(s["visit"].get("probability", 0)), "timeline")).rowcount
            t0 = dt.datetime.fromisoformat(s["startTime"])
            for p in s.get("timelinePath", []):
                lat, lng = geo(p["point"])
                ts = t0 + dt.timedelta(minutes=int(p.get("durationMinutesOffsetFromStartTime", 0)))
                np += db.execute("insert or ignore into point values (?,?,?,?,?,?)",
                                 (ts.isoformat(), lat, lng, None, None, "timeline")).rowcount
    for f in sorted((ROOT / "overland").glob("*/*.json")):
        for loc in json.load(open(f)).get("locations", []):
            lng, lat = loc["geometry"]["coordinates"][:2]
            pr = loc.get("properties", {})
            np += db.execute("insert or ignore into point values (?,?,?,?,?,?)", (
                pr.get("timestamp"), lat, lng, pr.get("horizontal_accuracy"),
                pr.get("battery_level"), "overland")).rowcount
    db.commit()
    print(f"visits {nv}, points {np} -> {DB}")


def hours(a, b):
    return (dt.datetime.fromisoformat(b) - dt.datetime.fromisoformat(a)).total_seconds() / 3600


def day(d):
    need()
    db = sqlite3.connect(DB)
    rows = db.execute("select start, end, semantic, lat, lng, place_id from visit where day = ? "
                      "order by start", (d,)).fetchall()
    for a, b, sem, lat, lng, pid in rows:
        print(f"{a[11:16]}-{b[11:16]}  {hours(a, b):5.1f} h  {sem or '?':<16} {lat:.5f},{lng:.5f}  {pid}")
    if not rows:
        print(f"no visits on {d}")


def summary():
    need()
    db = sqlite3.connect(DB)
    lo, hi, n = db.execute("select min(day), max(day), count(distinct day) from visit").fetchone()
    print(f"visits from {lo} to {hi}, {n} days")
    for src, c, a, b in db.execute("select source, count(*), min(ts), max(ts) from point group by source"):
        print(f"points {src}: {c} ({a} -> {b})")
    tot = {}
    for a, b, pid, sem, lat, lng in db.execute("select start, end, place_id, semantic, lat, lng from visit"):
        h, *_ = tot.get(pid, (0,))
        tot[pid] = (h + hours(a, b), sem, lat, lng)
    for pid, (h, sem, lat, lng) in sorted(tot.items(), key=lambda x: -x[1][0])[:20]:
        print(f"{h:6.0f} h  {sem or '?':<16} {lat:.5f},{lng:.5f}  {pid}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "summary"
    if cmd == "ingest":
        ingest()
    elif cmd == "summary":
        summary()
    elif cmd == "day" and len(sys.argv) > 2:
        day(sys.argv[2])
    else:
        print(__doc__)
