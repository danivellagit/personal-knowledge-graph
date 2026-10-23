#!/usr/bin/env python3
"""Per-night sleep fields, straight from the wearable CLI (no store needed).

    python3 tools/sleep_fields.py [FROM_DATE] [TO_DATE]      (default: the last 8 days)

Prints one JSON object per wake date:
  {"date", "bedtime", "wakeTime", "sleepMin", "deepMin", "remMin", "inBedMin", "awakeMin", "wakeups", "napMin"}

date = the morning the main sleep ended. The main sleep is the longest non-nap session ending that
day. napMin = minutes asleep in naps that STARTED on that date: sessions the device flags as naps,
or sessions under 3 hours that did not start between midnight and 6 a.m. wakeups = awake stages
between the first and the last stage of the main sleep.

Useful for a routine that fills a health page's DATA block or a sleep score without running the
whole body layer (tools/body-pull.sh + tools/body.py). Same CLI and contract as body-pull.sh:
`<cli> data sleep list --from D --limit N --detail` answering JSON with `dataPoints`.

Configuration (config.local.yml, or the env var): body.cli [GHEALTH] the client binary (default:
`ghealth` on PATH). OPTIONAL: unconfigured or `body.enabled: false`, it says so and exits 0.
Never prints credentials; it relies on the CLI's own login.
"""
import datetime as dt
import json
import os
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402


def cli():
    g = config.get_path("body.cli", "GHEALTH") or shutil.which("ghealth")
    if not config.enabled("body") or not g or not os.access(g, os.X_OK):
        config.not_configured("Body", [("body.cli", "GHEALTH")])
    return g


def main():
    gh = cli()
    today = dt.date.today()
    fr = sys.argv[1] if len(sys.argv) > 1 else str(today - dt.timedelta(days=8))
    to = sys.argv[2] if len(sys.argv) > 2 else str(today)
    r = subprocess.run([gh, "data", "sleep", "list", "--from", fr, "--limit", "60", "--detail"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write("the wearable CLI failed (exit %d): %s\n" % (r.returncode, r.stderr.strip()[:300]))
        sys.exit(1)
    pts = json.loads(r.stdout or "{}").get("dataPoints", [])
    out, naps = {}, {}
    for p in sorted(pts, key=lambda x: x["start"]):
        nap = bool(p.get("isNap")) or (p["totalMinutes"] < 180 and not ("00" <= p["start"][11:13] < "06"))
        if nap:
            d = p["start"][:10]
            naps[d] = naps.get(d, 0) + p["minutesAsleep"]
            continue
        d = p["end"][:10]
        if d in out and out[d]["sleepMin"] >= p["minutesAsleep"]:
            continue                                   # keep the main (longest) session
        st = sorted(p.get("stages", []), key=lambda s: s["start"])
        sm = p.get("stageMinutes", {})
        out[d] = {"date": d, "bedtime": p["start"][11:16], "wakeTime": p["end"][11:16],
                  "sleepMin": p["minutesAsleep"], "deepMin": sm.get("DEEP"), "remMin": sm.get("REM"),
                  "inBedMin": p["totalMinutes"], "awakeMin": p["minutesAwake"],
                  "wakeups": sum(1 for i, s in enumerate(st) if s["type"] == "AWAKE" and 0 < i < len(st) - 1)}
    for d in sorted(set(out) | set(naps)):
        if not (fr <= d <= to):
            continue
        row = out.get(d, {"date": d})
        row["napMin"] = naps.get(d) or None
        print(json.dumps(row, ensure_ascii=False))


if __name__ == "__main__":
    main()
