#!/usr/bin/env python3
"""Daily calorie burn: the device's number next to our own (trial). Part of the optional body layer.

    python3 tools/calories.py day YYYY-MM-DD [--write] [--json] [--height-cm CM] [--sex male|female]

- Device total:  `<cli> data total-calories daily-rollup` -> kcalSum
- Device active: sum of `active-energy-burned` minutes (filtered to `body.sources` if set)
- Device basal:  total - active (implied)
- Our basal:     population base = mean of Mifflin-St Jeor and revised Harris-Benedict for the
                 configured sex, from the latest weight and the age in the Google Health profile and
                 the configured height. EXPERIMENTAL heart correction: +1% per bpm the day's
                 resting heart rate is above the median of the previous 14 days, -1% per bpm below,
                 capped at +-5%. Prorated by elapsed fraction for a day in progress.
                 TODO: with 2-3 weeks of food log + weight, calibrate basal from intake vs weight
                 trend (adaptive TDEE).
- Our total:     our basal + device active

--write puts a self-contained `## Calories (device vs ours)` section between markers at the end
of data/body/body-YYYY-MM-DD.md, i.e. inside the `## Notes` tail that tools/body.py preserves.
Reruns replace the section. Never prints the CLI's config or tokens.

Configuration (config.local.yml, or the env var in brackets):
    body.cli        [GHEALTH]         the Google Health API CLI (default: `ghealth` on PATH)
    body.height_cm  [BODY_HEIGHT_CM]  your height; or pass --height-cm
    body.sex        [BODY_SEX]        male | female, picks the formula constants; or pass --sex
    body.sources    [BODY_SOURCES]    as in tools/body.py
"""

import datetime as dt
import json
import os
import re
import shutil
import statistics
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402

OUT = os.path.join("data", "body")
SOURCES = tuple(config.get_list("body.sources", (), "BODY_SOURCES"))
START = "<!-- calories:start — rewritten by tools/calories.py -->"
END = "<!-- calories:end -->"
RHR_CAP = 5
RHR_MIN_DAYS = 5
BASAL_FLOOR = 0.6  # device implied basal below 60% of ours (full day) -> data looks incomplete

# (Mifflin-St Jeor constant, Harris-Benedict revised: base, per kg, per cm, per year)
FORMULA = {
    "male": (5, 88.362, 13.397, 4.799, 5.677),
    "female": (-161, 447.593, 9.247, 3.098, 4.330),
}


def mine(p):
    return not SOURCES or p.get("source") in SOURCES


def cli():
    exe = config.get_path("body.cli", "GHEALTH") or shutil.which("ghealth")
    if not config.enabled("body") or not exe or not os.path.exists(exe):
        config.not_configured("Body (calories)", [("body.cli", "GHEALTH")])
    return exe


def ghealth(*args):
    r = subprocess.run([cli(), *args], capture_output=True, text=True)
    if r.returncode:
        sys.exit("ghealth %s failed (exit %d)" % (" ".join(args[:3]), r.returncode))
    return json.loads(r.stdout)


def active_kcal(start, end):
    total, token = 0.0, None
    while True:
        args = ["data", "active-energy-burned", "list", "--from", start, "--to", end, "--limit", "3000"]
        if token:
            args += ["--page-token", token]
        j = ghealth(*args)
        total += sum(float(p["kcal"]) for p in j.get("dataPoints", []) if mine(p))
        token = j.get("nextPageToken")
        if not token:
            return total


def compute(date, height_cm, sex):
    day = dt.date.fromisoformat(date)
    now = dt.datetime.now()
    start = dt.datetime.combine(day, dt.time())
    end = start + dt.timedelta(days=1)
    in_progress = start <= now < end
    stop = now.replace(microsecond=0) if in_progress else end
    frac = (stop - start).total_seconds() / 86400 if in_progress else 1.0

    fb_total = sum(float(p.get("kcalSum", 0)) for p in ghealth(
        "data", "total-calories", "daily-rollup", "--from", date,
        "--to", (day + dt.timedelta(days=1)).isoformat()).get("dataPoints", []) if p.get("date") == date)
    active = active_kcal(start.isoformat(), stop.isoformat())
    # weight valid on the day: latest measurement on or before it (earliest one if none before)
    since = (day - dt.timedelta(days=3650)).isoformat() + "T00:00:00"
    ws = sorted((p["time"], float(p["weightGrams"])) for p in ghealth(
        "data", "weight", "list", "--from", since, "--to", end.isoformat(),
        "--limit", "500").get("dataPoints", []))
    if not ws:
        ws = sorted((p["time"], float(p["weightGrams"])) for p in ghealth(
            "data", "weight", "list", "--from", since, "--limit", "1").get("dataPoints", []))
    if not ws:
        sys.exit("no weight recorded in Google Health: add one, then rerun")
    w_time, grams = ws[-1]
    kg = grams / 1000
    steps = sum(int(p.get("countSum", 0)) for p in ghealth(
        "data", "steps", "daily-rollup", "--from", date, "--to", (day + dt.timedelta(days=1)).isoformat()
    ).get("dataPoints", []) if p.get("date") == date)
    cm = height_cm
    age = int(ghealth("user", "profile", "get")["age"])
    k_msj, hb0, hb_w, hb_h, hb_a = FORMULA[sex]
    msj = 10 * kg + 6.25 * cm - 5 * age + k_msj
    hb = hb0 + hb_w * kg + hb_h * cm - hb_a * age
    base = (msj + hb) / 2
    pts = ghealth("data", "daily-resting-heart-rate", "list", "--from", (day - dt.timedelta(days=14)).isoformat(),
                  "--to", (day + dt.timedelta(days=1)).isoformat(), "--limit", "60").get("dataPoints", [])
    rhr = {p["date"]: float(p["beatsPerMinute"]) for p in pts if mine(p)}
    hist = [v for k, v in rhr.items() if k < date]
    rhr_today = rhr.get(date)
    rhr_med = statistics.median(hist) if hist else None
    adj = 0.0
    if len(hist) < RHR_MIN_DAYS:
        rhr_med = None
    if rhr_today is not None and rhr_med is not None:
        adj = max(-RHR_CAP, min(RHR_CAP, rhr_today - rhr_med))
    bmr_full = base * (1 + adj / 100)
    bmr = bmr_full * frac
    flags = []
    if fb_total - active < BASAL_FLOOR * bmr_full * frac:
        flags.append("Device implied basal %d is below %d%% of ours: device data for this day looks incomplete "
                     "(sync gap or partial wear); do not trust the device total or active." % (
                         round(fb_total - active), BASAL_FLOOR * 100))
    return {"date": date, "as_of": stop.strftime("%H:%M") if in_progress else None, "fraction": frac,
            "device_total": fb_total, "device_active": active, "device_basal": fb_total - active,
            "steps": steps, "w_date": w_time[:10], "flags": flags, "kg": kg, "cm": cm, "age": age,
            "sex": sex, "k_msj": k_msj, "hb_c": (hb0, hb_w, hb_h, hb_a), "msj": msj, "hb": hb, "base": base,
            "rhr": rhr_today, "rhr_med": rhr_med, "rhr_n": len(hist), "adj": adj, "bmr_full": bmr_full, "bmr": bmr,
            "our_total": bmr + active, "diff": bmr + active - fb_total}


def render(r):
    f = lambda x: "%d" % round(x)
    head = "as of %s (%.1f%% of the day elapsed)" % (r["as_of"], r["fraction"] * 100) if r["as_of"] else "full day"
    return "\n".join([
        START, "## Calories (device vs ours)",
        "_Trial. %s. Active energy is the device's in both columns; only the basal part differs._" % head, "",
        "| | device | ours |", "| --- | --- | --- |",
        "| total | %s | %s |" % (f(r["device_total"]), f(r["our_total"])),
        "| active | %s | %s |" % (f(r["device_active"]), f(r["device_active"])),
        "| basal | %s (implied: total − active) | %s |" % (f(r["device_basal"]), f(r["bmr"])), "",
        "Steps: %s" % format(r["steps"], ","), "",
        "Difference (ours − device): **%+d kcal**" % round(r["diff"]), "",
        *["> ⚠️ %s" % x for x in r["flags"]], *([""] if r["flags"] else []),
        "Our basal (inputs %.1f kg weighed %s, %.0f cm, %d y):" % (r["kg"], r["w_date"], r["cm"], r["age"]),
        "- Mifflin-St Jeor (%s) 10w + 6.25h − 5a %+d = %s kcal/day" % (r["sex"], r["k_msj"], f(r["msj"])),
        "- Harris-Benedict revised (%s) %s + %sw + %sh − %sa = %s kcal/day" % ((r["sex"],) + r["hb_c"] + (f(r["hb"]),)),
        "- Population base (mean) = %s kcal/day" % f(r["base"]),
        "- Heart correction (**experimental**): resting heart %s vs %s median of the previous %d days → %+.1f%% (±1%%/bpm, cap ±%d%%)" % (
            "%.0f" % r["rhr"] if r["rhr"] is not None else "n/a",
            "%.1f" % r["rhr_med"] if r["rhr_med"] is not None else "n/a", r["rhr_n"], r["adj"], RHR_CAP)
        + ("" if r["rhr_med"] is not None else " — fewer than %d days of history, no correction" % RHR_MIN_DAYS),
        "- Adjusted basal = %s kcal/day%s" % (f(r["bmr_full"]),
            ", × %.3f elapsed = %s" % (r["fraction"], f(r["bmr"])) if r["as_of"] else ""), "",
        "TODO: once 2-3 weeks of food log + weight exist, calibrate basal from intake vs weight trend (adaptive TDEE).",
        END, ""])


def write(r):
    path = os.path.join(OUT, "body-%s.md" % r["date"])
    if os.path.exists(path):
        text = open(path, encoding="utf8").read()
    else:  # minimal node; tools/body.py fills the rest and keeps the ## Notes tail
        text = ("---\ntype: body-day\nperson: \"[[%s]]\"\ndate: %s\n---\n\n"
                "## Notes\n" % (config.OWNER_NODE, r["date"]))
    text = re.sub(r"\n*" + re.escape(START) + r".*?" + re.escape(END) + r"\n*", "\n", text, flags=re.S)
    if "## Notes" not in text:
        text = text.rstrip("\n") + "\n\n## Notes\n"
    text = text.rstrip("\n") + "\n\n" + render(r)
    open(path, "w", encoding="utf8").write(text)
    return path


def main(argv):
    if len(argv) < 2 or argv[0] != "day":
        sys.exit(__doc__)
    config.chdir_repo()
    h = config.get("body.height_cm", None, "BODY_HEIGHT_CM")
    if "--height-cm" in argv:
        h = argv[argv.index("--height-cm") + 1]
    sex = config.get("body.sex", None, "BODY_SEX")
    if "--sex" in argv:
        sex = argv[argv.index("--sex") + 1]
    sex = str(sex or "").strip().lower()
    if not config.enabled("body") or not h or sex not in FORMULA:
        config.not_configured("Body (calories)", [("body.height_cm", "BODY_HEIGHT_CM"),
                                                 ("body.sex", "BODY_SEX")])
    r = compute(argv[1], float(h), sex)
    if "--write" in argv and "--json" in argv:
        write(r)
    elif "--json" not in argv:
        print(render(r))
    if "--json" in argv:
        print(json.dumps({k: v for k, v in r.items()}))
        return
    if "--write" in argv:
        print("wrote", write(r))


if __name__ == "__main__":
    main(sys.argv[1:])
