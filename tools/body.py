#!/usr/bin/env python3
"""The body layer: wearable data -> a local time-series store -> one graph node per day.

    python3 tools/body.py ingest            # raw JSON dump -> SQLite (full rebuild, idempotent)
    python3 tools/body.py days [FROM [TO]]  # write data/body/body-YYYY-MM-DD.md
    python3 tools/body.py table             # data/body/body-log.md, one row per day (also run by `days`)
    python3 tools/body.py rows [FROM [TO]]  # one JSON row per day
    python3 tools/body.py notion [FROM [TO]]    # the same rows as Notion page properties (optional mirror)
    python3 tools/body.py link-notion DATE URL  # store the Notion row's URL on the day node
    python3 tools/body.py window START END  # what the body did between two ISO times

OPTIONAL. Nothing else in the graph needs it; unconfigured, every command says what to set and
exits cleanly. Three levels, same as the rest of the graph (see anatomy.md, "The body layer"):

- raw:      <body.raw_dir>/<type>/<date>.json, pulled by tools/body-pull.sh with a Google Health
            API command-line client (Fitbit / Pixel Watch data). Never committed: megabytes of
            heart rate per day. It lives OUTSIDE the repo.
- store:    <body.db>, a SQLite file rebuilt from raw by `ingest`. Every question the sweep asks
            ("what was the heart doing during the 18:30 call?") is a query here. Also off-repo.
- graph:    data/body/body-YYYY-MM-DD.md. Numbers in frontmatter, the readable detail in the
            body, and outbound links to whatever the day touched (passions, places, people,
            the same day's interactions). Regenerating a day keeps everything a sweep added by
            hand: `with`, `at`, `sessions_resolved` and the `## Notes` section.

Configuration (config.local.yml, or the env var in brackets):
    body.raw_dir     [BODY_RAW]        where body-pull.sh writes the raw JSON
    body.db          [BODY_DB]         the SQLite store
    body.first_day   [BODY_FIRST_DAY]  first day to write (default: the first day in the store)
    body.sources     [BODY_SOURCES]    comma list of device source names to keep, e.g.
                                       "My Watch, VENDOR" (default: every source). Two devices
                                       on one account are different sensors: never mix them.
    body.device      [BODY_DEVICE]     a label for the text, e.g. "Pixel Watch" (default "wearable")
    body.sport_words [BODY_SPORT_WORDS] extra words that make a message "about a session"
    whatsapp.bridge_db [WHATSAPP_DB]   optional: who-and-when (never what) joined to the day

Numbers are facts; what they mean is not. A heart at 112 while sitting still is recorded as
exactly that, never as "stressed" or "anxious" (CLAUDE.md, "Quotes are facts, reads are
guesses"). Only stillness-filtered readings count as anything at all, because walking, stairs
and coffee move the heart too.

Exercise sessions become `activities:` links by matching the session's name (e.g. "Running")
against your passion nodes: the slug, the `name:` or any of the `aliases:` of a node in
data/passions/. No passion node, no link.
"""

import datetime as dt
import glob
import json
import os
import re
import sqlite3
import statistics as st
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from graph import Node  # noqa: E402
import config  # noqa: E402

RAW = config.get_path("body.raw_dir", "BODY_RAW")
DB = config.get_path("body.db", "BODY_DB")
OUT = os.path.join("data", "body")
SOURCES = tuple(config.get_list("body.sources", (), "BODY_SOURCES"))
FIRST_DAY = config.get("body.first_day", None, "BODY_FIRST_DAY")
DEVICE = str(config.get("body.device", "wearable", "BODY_DEVICE"))
DEVICE_SLUG = re.sub(r"[^a-z0-9]+", "-", DEVICE.lower()).strip("-") or "wearable"


def need(raw=False):
    """Fail soft when the layer is not set up: a message, never a traceback."""
    keys = [("body.db", "BODY_DB")] + ([("body.raw_dir", "BODY_RAW")] if raw else [])
    if not config.enabled("body") or not DB or (raw and not RAW):
        config.not_configured("Body", keys)
    if not raw and not os.path.exists(DB):
        print("body store %s does not exist yet: run tools/body-pull.sh, then "
              "`python3 tools/body.py ingest`." % DB)
        sys.exit(0)
    if raw and not os.path.isdir(RAW):
        print("no raw body data in %s yet: run tools/body-pull.sh first." % RAW)
        sys.exit(0)


def passion_map():
    """exercise name -> passion slug, from the passion nodes themselves (slug, name, aliases)."""
    out = {}
    for f in glob.glob(os.path.join("data", "passions", "*.md")):
        n = Node(f, open(f, encoding="utf8", errors="ignore").read())
        for v in [n.slug, n.get("name")] + list(n.get("aliases") or []):
            k = re.sub(r"[^a-z0-9]+", "-", str(v or "").strip("\"'").lower()).strip("-")
            if k:
                out.setdefault(k, n.slug)
    return out


def passion_for(name, pmap):
    return pmap.get(re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-"))


# sessions that ask "who was there, where?"; a solo walk does not
SOCIAL_MIN = 20
NOT_SOCIAL = {"Walk", "Activity"}

PRESERVED_KEYS = ("with", "at", "sessions_resolved", "notion_url")
GEN_START = "<!-- body:generated:start — rewritten by tools/body.py, edit ## Notes instead -->"
GEN_END = "<!-- body:generated:end -->"


def ep(ts):
    return int(dt.datetime.fromisoformat(ts).timestamp())


def mine(x):
    return not SOURCES or x.get("source") in SOURCES


# --------------------------------------------------------------------------------- ingest

def ingest():
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    tmp = DB + ".tmp"
    if os.path.exists(tmp):
        os.unlink(tmp)
    c = sqlite3.connect(tmp)
    c.executescript("""
    create table hr(epoch int, ts text, bpm int);
    create table minute(epoch int, ts text, kind text, value real, label text);
    create table spo2(epoch int, ts text, pct real);
    create table hrv(epoch int, ts text, rmssd real, lf real, hf real);
    create table sleep(id text primary key, start text, end text, wake_date text, is_nap int, json text);
    create table stage(sleep_id text, start text, end text, s_epoch int, e_epoch int, type text);
    create table daily(date text, type text, json text, primary key(date, type));
    create table exercise(id text primary key, start text, end text, date text, json text);
    create table rollup(date text, type text, json text, primary key(date, type));
    """)

    def points(t):
        for f in sorted(glob.glob(os.path.join(RAW, t, "*.json"))):
            try:
                d = json.load(open(f))
            except ValueError:
                continue
            for x in d.get("dataPoints", []):
                if mine(x):
                    yield x

    c.executemany("insert into hr values(?,?,?)",
                  ((ep(x["time"]), x["time"], int(x["beatsPerMinute"])) for x in points("heart-rate")))
    for t, kind, val, lab in [
        ("steps", "steps", lambda x: float(x["count"]), lambda x: None),
        ("distance", "distance_mm", lambda x: float(x["millimeters"]), lambda x: None),
        ("active-energy-burned", "kcal", lambda x: float(x["kcal"]), lambda x: None),
        ("activity-level", "level", lambda x: 0, lambda x: x["activityLevelType"]),
    ]:
        c.executemany("insert into minute values(?,?,?,?,?)",
                      ((ep(x["start"]), x["start"], kind, val(x), lab(x)) for x in points(t)))
    c.executemany("insert into spo2 values(?,?,?)",
                  ((ep(x["time"]), x["time"], x["percentage"]) for x in points("oxygen-saturation")))
    c.executemany("insert into hrv values(?,?,?,?,?)",
                  ((ep(x["time"]), x["time"], x.get("rootMeanSquareOfSuccessiveDifferencesMilliseconds"),
                    x.get("metadata", {}).get("lowFrequencyPower"),
                    x.get("metadata", {}).get("highFrequencyPower"))
                   for x in points("heart-rate-variability")))

    sleeps = {}
    for x in points("sleep"):
        sleeps[x["id"]] = x
    detail = os.path.join(RAW, "sleep-detail", "all.json")
    if os.path.exists(detail):
        for x in json.load(open(detail)).get("dataPoints", []):
            if mine(x):
                sleeps[x["id"]] = x          # the detailed copy carries the stage timeline
    for x in sleeps.values():
        c.execute("insert or replace into sleep values(?,?,?,?,?,?)",
                  (x["id"], x["start"], x["end"], x["end"][:10], int(bool(x.get("isNap"))), json.dumps(x)))
        for s in x.get("stages", []):
            c.execute("insert into stage values(?,?,?,?,?,?)",
                      (x["id"], s["start"], s["end"], ep(s["start"]), ep(s["end"]), s["type"]))

    for t in ["daily-heart-rate-variability", "daily-oxygen-saturation", "daily-respiratory-rate",
              "daily-resting-heart-rate", "daily-sleep-temperature-derivations",
              "respiratory-rate-sleep-summary"]:
        for x in points(t):
            date = x.get("date") or (x.get("end") or x.get("time") or "")[:10]
            if date:
                c.execute("insert or replace into daily values(?,?,?)", (date, t, json.dumps(x)))
    for x in points("exercise"):
        c.execute("insert or replace into exercise values(?,?,?,?,?)",
                  (x["id"], x["start"], x["end"], x["start"][:10], json.dumps(x)))
    for d in glob.glob(os.path.join(RAW, "rollup-*")):
        t = os.path.basename(d)[len("rollup-"):]
        for f in glob.glob(os.path.join(d, "*.json")):
            try:
                for x in json.load(open(f)).get("dataPoints", []):
                    c.execute("insert or replace into rollup values(?,?,?)", (x["date"], t, json.dumps(x)))
            except ValueError:
                pass
    c.executescript("""
    create index hr_e on hr(epoch); create index m_e on minute(epoch, kind);
    create index spo2_e on spo2(epoch); create index st_s on stage(s_epoch);
    """)
    c.commit()
    n = c.execute("select count(*), min(ts), max(ts) from hr").fetchone()
    c.close()
    os.replace(tmp, DB)
    print("ingested: %d heart-rate readings, %s -> %s" % n)


# ---------------------------------------------------------------------------------- query

def db():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c


def per_minute(c, e0, e1):
    """{epoch_minute: (mean bpm, max bpm, still?)} for [e0, e1)."""
    hr = defaultdict(list)
    for r in c.execute("select epoch, bpm from hr where epoch>=? and epoch<?", (e0, e1)):
        hr[r[0] // 60 * 60].append(r[1])
    moving = set()
    for r in c.execute("select epoch, kind, value, label from minute where epoch>=? and epoch<? "
                       "and kind in ('steps','level')", (e0 - 300, e1)):
        m = r[0] // 60 * 60
        if (r[1] == "steps" and r[2] > 0) or (r[1] == "level" and r[3] != "SEDENTARY"):
            moving.add(m)
    out = {}
    for m, v in hr.items():
        still = not any((m - 60 * k) in moving for k in range(0, 4))
        out[m] = (st.mean(v), max(v), still)
    return out


def asleep_windows(c, e0, e1):
    return [(ep(r["start"]), ep(r["end"])) for r in
            c.execute("select start, end from sleep where end>=? and start<=?",
                      (dt.datetime.fromtimestamp(e0).astimezone().isoformat(),
                       dt.datetime.fromtimestamp(e1).astimezone().isoformat()))]


def window(start, end):
    """What the body did between two ISO times, against that day's own still baseline."""
    c = db()
    e0, e1 = ep(start), ep(end)
    day = dt.datetime.fromisoformat(start).date()
    d0 = int(dt.datetime.combine(day, dt.time(8)).astimezone().timestamp())
    base = [v[0] for m, v in per_minute(c, d0, d0 + 16 * 3600).items() if v[2]]
    pm = per_minute(c, e0, e1)
    steps = c.execute("select coalesce(sum(value),0) from minute where kind='steps' and epoch>=? and epoch<?",
                      (e0, e1)).fetchone()[0]
    if not pm:
        return {"start": start, "end": end, "readings": 0}
    peak = max(pm.items(), key=lambda kv: kv[1][1])
    return {
        "start": start, "end": end,
        "hr_mean": round(st.mean(v[0] for v in pm.values())),
        "hr_max": peak[1][1],
        "hr_max_at": dt.datetime.fromtimestamp(peak[0]).strftime("%H:%M"),
        "still_baseline_that_day": round(st.median(base)) if base else None,
        "minutes_still": sum(1 for v in pm.values() if v[2]),
        "minutes": len(pm),
        "steps": int(steps),
    }


# ------------------------------------------------------------------------------ whatsapp
# Who and when only, never what: the content of a message is never copied into the body layer.

WA_DB = config.get_path("whatsapp.bridge_db", "WHATSAPP_DB")
_SPORT_RE = None
_WA_MAPS = None


def sport_words():
    """Words that make a message "about a session": a small generic base, every passion node's
    slug / name / aliases, and `body.sport_words` from config."""
    global _SPORT_RE
    if _SPORT_RE is None:
        words = {"gym", "match", "game", "court", "training", "workout", "run", "session"}
        for k in passion_map():
            words.update(w for w in k.split("-") if len(w) > 2)
        words.update(w.lower() for w in config.get_list("body.sport_words", (), "BODY_SPORT_WORDS"))
        _SPORT_RE = re.compile("|".join(sorted(re.escape(w) for w in words)), re.I)
    return _SPORT_RE


def wa_maps():
    """WhatsApp id -> person slug, group jid -> group slug. Ambiguous ids are dropped, never guessed."""
    global _WA_MAPS
    if _WA_MAPS is not None:
        return _WA_MAPS
    people, groups = {}, {}

    def put(d, k, v):
        if not k:
            return
        if k in d and d[k] != v:
            d[k] = None
        else:
            d.setdefault(k, v)
    for f in glob.glob(os.path.join("data", "people", "*.md")):
        n = Node(f, open(f, encoding="utf8", errors="ignore").read())
        for k in ("phone", "whatsapp"):
            v = re.sub(r"\D", "", n.get(k) or "")
            put(people, v, n.slug)
    for f in glob.glob(os.path.join("data", "interactions", "*", "*.md")):
        person = f.split(os.sep)[2]
        if person.startswith("_"):
            continue
        with open(f, encoding="utf8", errors="ignore") as fh:
            head = fh.read(1500)
        for m in re.finditer(r"whatsapp:(\d{8,20})", head.split("\n---", 1)[0]):
            put(people, m.group(1), person)
    for f in glob.glob(os.path.join("data", "groups", "*.md")):
        slug = os.path.basename(f)[:-3]
        for m in set(re.findall(r"(\d{15,22})@g\.us", open(f, encoding="utf8", errors="ignore").read())):
            put(groups, m, slug)
    # WhatsApp now addresses most chats by LID, not phone. The bridge keeps the LID -> phone map
    # (whatsmeow_lid_map); read only that table, read-only. The rest of that file is key material.
    lid_db = os.path.join(os.path.dirname(WA_DB), "whatsapp.db") if WA_DB else ""
    if lid_db and os.path.exists(lid_db):
        c = sqlite3.connect("file:%s?mode=ro" % lid_db, uri=True)
        for lid, pn in c.execute("select lid, pn from whatsmeow_lid_map"):
            if people.get(pn):
                put(people, lid, people[pn])
        c.close()
    _WA_MAPS = ({k: v for k, v in people.items() if v}, {k: v for k, v in groups.items() if v})
    return _WA_MAPS


def wa_messages(e0, e1):
    """[(epoch, person or None, group or None, from_me, sport_word)] between two epochs."""
    if not WA_DB or not os.path.exists(WA_DB):
        return []
    people, groups = wa_maps()
    c = sqlite3.connect("file:%s?mode=ro" % WA_DB, uri=True)
    lo = dt.datetime.fromtimestamp(e0 - 7200, dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    hi = dt.datetime.fromtimestamp(e1 + 7200, dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    out = []
    for chat, sender, ts, me, content in c.execute(
            "select chat_jid, sender, timestamp, is_from_me, content from messages "
            "where timestamp >= ? and timestamp <= ?", (lo[:10], hi[:10] + " 99")):
        try:
            e = int(dt.datetime.fromisoformat(ts).timestamp())
        except ValueError:
            continue
        if not (e0 <= e < e1):
            continue
        key = chat.split("@")[0]
        if chat.endswith("@g.us"):
            grp = groups.get(key)
            who = None if me else people.get((sender or "").split("@")[0])
        else:
            grp, who = None, people.get(key)
        out.append((e, who, grp, bool(me), bool(sport_words().search(content or ""))))
    c.close()
    return sorted(out, key=lambda m: m[0])


def wa_day(d):
    """Join the day's messages to the body: who before sleep, who on waking, who late at night,
    who around each still-heart episode and each session, and messages hour by hour."""
    date = d["date"]
    e0 = int(dt.datetime.fromisoformat(date + "T00:00:00").astimezone().timestamp())
    msgs = wa_messages(e0 - 6 * 3600, e0 + 86400)
    res = {"last_before_sleep": [], "first_after_wake": [], "late_night": [], "top_chats": [],
           "group_chats": [], "_hourly": defaultdict(lambda: [0, 0]), "_episodes": {}, "_sessions": {}}
    if not msgs:
        return res

    def ppl(rows, limit=None, sent_only=True, groups_too=False):
        seen = []
        for e, who, grp, me, _ in rows:
            if sent_only and not me:
                continue
            tgt = who or (grp if groups_too else None)
            if tgt and tgt not in seen:
                seen.append(tgt)
        return seen[:limit] if limit else seen
    s = d.get("_sleep")
    if s:
        bed, wake = ep(s["start"]), ep(s["end"])
        res["last_before_sleep"] = ppl(reversed([m for m in msgs if bed - 3 * 3600 <= m[0] < bed]), 2)
        res["first_after_wake"] = ppl([m for m in msgs if wake <= m[0] < wake + 3 * 3600], 2)
        if bed > e0:      # asleep after midnight: who the owner was writing to between 00:00 and bed
            res["late_night"] = ppl([m for m in msgs if e0 <= m[0] < bed])
    today = [m for m in msgs if m[0] >= e0]
    cnt = defaultdict(int)
    gcnt = defaultdict(int)
    for e, who, grp, me, _ in today:
        res["_hourly"][dt.datetime.fromtimestamp(e).hour][0 if me else 1] += 1
        if me and who:
            cnt[who] += 1
        if grp:
            gcnt[grp] += 1
    res["top_chats"] = [k for k, _ in sorted(cnt.items(), key=lambda kv: -kv[1])[:5]]
    res["group_chats"] = [k for k, _ in sorted(gcnt.items(), key=lambda kv: -kv[1])[:5]]
    for ep_ in d.get("_episodes", []):
        res["_episodes"][ep_["start"]] = ppl([m for m in today if ep_["start"] - 300 <= m[0] <= ep_["end"] + 360],
                                             sent_only=False, groups_too=True)
    for x in d.get("_exercise", []):
        st0 = ep("%sT%s:00" % (date, x["start"])) if len(x["start"]) == 5 else None
        if st0:
            st0 = int(dt.datetime.fromisoformat("%sT%s:00" % (date, x["start"])).astimezone().timestamp())
            res["_sessions"][x["start"]] = ppl([m for m in msgs if st0 - 3 * 3600 <= m[0] < st0 and m[4]],
                                               sent_only=False, groups_too=True)
    return res


# ------------------------------------------------------------------------------------ day

def hhmm(ts):
    return ts[11:16]


def day_metrics(c, date):
    d = {"date": date}
    day0 = dt.datetime.fromisoformat(date + "T00:00:00").astimezone()
    e0 = int(day0.timestamp())
    e1 = e0 + 86400

    rows = [json.loads(r["json"]) for r in c.execute("select json from sleep where wake_date=?", (date,))]
    main = [x for x in rows if not x.get("isNap")]
    naps = [x for x in rows if x.get("isNap")]
    # The device can flag a short night (say 01:20-04:05) as a nap. With no main sleep, the
    # longest "nap" that ends before noon IS the night; say so in the text, don't hide it.
    if not main:
        night = [x for x in naps if int(x["end"][11:13]) < 12]
        if night:
            s = max(night, key=lambda x: x["minutesAsleep"])
            s = dict(s, _was_nap=True)
            naps = [x for x in naps if x["id"] != s["id"]]
            main = [s]
    if main:
        s = max(main, key=lambda x: x["minutesAsleep"])
        sm = s.get("stageMinutes", {})
        d.update(bed=hhmm(s["start"]), wake=hhmm(s["end"]), sleep_min=s["minutesAsleep"],
                 deep_min=sm.get("DEEP"), rem_min=sm.get("REM"), light_min=sm.get("LIGHT"),
                 awake_min=sm.get("AWAKE"), _sleep=s)
        r = c.execute("select min(bpm) from hr where epoch>=? and epoch<?",
                      (ep(s["start"]), ep(s["end"]))).fetchone()[0]
        d["hr_sleep_min"] = r
    d["nap_min"] = sum(x["minutesAsleep"] for x in naps) or None
    d["_naps"] = naps

    def daily(t):
        r = c.execute("select json from daily where date=? and type=?", (date, t)).fetchone()
        return json.loads(r[0]) if r else {}
    rhr = daily("daily-resting-heart-rate").get("beatsPerMinute")
    d["rhr"] = int(rhr) if rhr else None
    h = daily("daily-heart-rate-variability")
    d["hrv_ms"] = round(h["averageHeartRateVariabilityMilliseconds"], 1) if h else None
    o = daily("daily-oxygen-saturation")
    d["spo2"] = o.get("averagePercentage")
    d["spo2_low"] = o.get("lowerBoundPercentage")
    d["breathing"] = round(daily("daily-respiratory-rate").get("breathsPerMinute") or 0, 1) or None
    t = daily("daily-sleep-temperature-derivations")
    try:
        d["temp_dev"] = round(float(t["nightlyTemperatureCelsius"]) - float(t["baselineTemperatureCelsius"]), 2)
        if d["temp_dev"] != d["temp_dev"]:      # NaN: no baseline yet in the first days
            d["temp_dev"] = None
    except (KeyError, ValueError, TypeError):
        d["temp_dev"] = None

    def roll(t):
        r = c.execute("select json from rollup where date=? and type=?", (date, t)).fetchone()
        return json.loads(r[0]) if r else {}
    d["steps"] = int(float(roll("steps").get("countSum") or 0)) or None
    mm = roll("distance").get("millimetersSum")
    d["km"] = round(float(mm) / 1e6, 2) if mm else None
    k = roll("total-calories").get("kcalSum")
    d["kcal"] = round(k) if k else None
    am = {x["activityLevel"]: int(x["activeMinutesSum"])
          for x in roll("active-minutes").get("activeMinutesRollupByActivityLevel", [])}
    d["active_light"], d["active_moderate"], d["active_vigorous"] = (
        am.get("LIGHT"), am.get("MODERATE"), am.get("VIGOROUS"))
    z = roll("active-zone-minutes")
    d["zone_min"] = sum(int(z.get(k) or 0) for k in
                        ("sumInFatBurnHeartZone", "sumInCardioHeartZone", "sumInPeakHeartZone")) if z else None

    # heart, minute by minute, outside sleep
    sleep_w = asleep_windows(c, e0, e1)
    pm = per_minute(c, e0, e1)
    awake = {m: v for m, v in pm.items() if not any(a <= m < b for a, b in sleep_w)}
    if awake:
        top = max(awake.items(), key=lambda kv: kv[1][1])
        d["hr_max"], d["hr_max_at"] = top[1][1], dt.datetime.fromtimestamp(top[0]).strftime("%H:%M")
    still = {m: v for m, v in awake.items() if v[2]
             and dt.datetime.fromtimestamp(m).hour >= 8}
    d["hr_still_median"] = round(st.median(v[0] for v in still.values())) if len(still) >= 60 else None
    d["still_over_100_min"] = sum(1 for v in still.values() if v[0] > 100) if still else None

    # still episodes: >= 4 consecutive still minutes 20+ bpm over the day's still median
    eps = []
    if d["hr_still_median"]:
        cur = None
        for m in sorted(still):
            if still[m][0] > d["hr_still_median"] + 20:
                if cur and m - cur["end"] <= 180:
                    cur["end"], cur["peak"] = m, max(cur["peak"], still[m][1])
                    cur["n"] += 1
                else:
                    if cur:
                        eps.append(cur)
                    cur = {"start": m, "end": m, "peak": still[m][1], "n": 1}
        if cur:
            eps.append(cur)
    d["_episodes"] = [e for e in eps if e["n"] >= 4]

    # hourly profile
    hours = defaultdict(list)
    for m, v in pm.items():
        hours[dt.datetime.fromtimestamp(m).hour].append(v)
    d["_hours"] = {h: (round(min(x[0] for x in v)), round(st.mean(x[0] for x in v)), max(x[1] for x in v))
                   for h, v in sorted(hours.items())}

    ex = []
    for r in c.execute("select json from exercise where date=? order by start", (date,)):
        x = json.loads(r[0])
        ms = x.get("metricsSummary", {})
        ex.append({
            "start": hhmm(x["start"]), "end": hhmm(x["end"]), "name": x.get("displayName", "?"),
            "min": int(float(x.get("activeDuration", "0s").rstrip("s"))) // 60,
            "hr_avg": ms.get("averageHeartRateBeatsPerMinute"),
            "zone_min": ms.get("activeZoneMinutes"), "kcal": ms.get("caloriesKcal"),
            "steps": ms.get("steps"),
        })
    d["_exercise"] = ex
    return d


PUBLIC = ["date", "bed", "wake", "sleep_min", "deep_min", "rem_min", "light_min", "awake_min",
          "nap_min", "hr_sleep_min", "rhr", "hrv_ms", "spo2", "spo2_low", "breathing", "temp_dev",
          "steps", "km", "kcal", "active_light", "active_moderate", "active_vigorous", "zone_min",
          "hr_max", "hr_max_at", "hr_still_median", "still_over_100_min"]


def fmt_h(mins):
    return "%dh%02d" % divmod(mins, 60) if mins else "—"


def session_key(e):
    return "%s %s %dmin" % (e["start"], e["name"], e["min"])


def social(e):
    return e["min"] >= SOCIAL_MIN and e["name"] not in NOT_SOCIAL


def interactions_on(date):
    out = []
    for p in sorted(glob.glob(os.path.join("data", "interactions", "*", date + "*.md"))):
        rel = os.path.relpath(p, "data")[:-3]
        out.append(rel)
    return out


def render(d):
    L = []
    w = L.append
    wa = d.get("_wa") or {"_hourly": {}, "_episodes": {}, "_sessions": {}}
    weekday = dt.date.fromisoformat(d["date"]).strftime("%A %-d %B %Y")
    w("# %s — body" % weekday)
    w("")
    w("_%s. Numbers are measurements, not readings of mood. Raw: "
      "`<body.raw_dir>/*/%s.json`; query any window with "
      "`python3 tools/body.py window START END`._" % (DEVICE, d["date"]))
    w("")
    w("## Night")
    if d.get("sleep_min"):
        w("In bed %s → up %s · **%s asleep** · deep %s' · REM %s' · light %s' · awake %s' · "
          "lowest heart %s" % (d["bed"], d["wake"], fmt_h(d["sleep_min"]), d["deep_min"], d["rem_min"],
                              d["light_min"], d["awake_min"], d.get("hr_sleep_min") or "—"))
        if d["_sleep"].get("_was_nap"):
            w("")
            w("_The device labelled this sleep a nap; it is the only sleep of the night, so it is counted as the night._")
        w("")
        w("Resting heart %s · HRV %s ms · SpO2 %s%% (low %s%%) · breathing %s/min · skin temp %s°C vs baseline"
          % (d["rhr"] or "—", d["hrv_ms"] or "—", d["spo2"] or "—", d["spo2_low"] or "—",
             d["breathing"] or "—", ("%+.2f" % d["temp_dev"]) if d["temp_dev"] is not None else "—"))
        stages = d["_sleep"].get("stages", [])
        if stages:
            w("")
            w("| from | to | stage |")
            w("| --- | --- | --- |")
            merged = []
            for s in stages:
                if merged and merged[-1]["type"] == s["type"]:
                    merged[-1]["end"] = s["end"]
                else:
                    merged.append(dict(s))
            for s in merged:
                w("| %s | %s | %s |" % (hhmm(s["start"]), hhmm(s["end"]), s["type"].lower()))
    else:
        w("No main sleep recorded for the night ending on this day.")
    for n in d["_naps"]:
        w("")
        w("Nap %s → %s, %d' asleep." % (hhmm(n["start"]), hhmm(n["end"]), n["minutesAsleep"]))
    w("")
    w("## Day")
    w("%s steps · %s km · %s kcal · active minutes light %s / moderate %s / vigorous %s · "
      "heart-zone minutes %s" % (
          "{:,}".format(d["steps"]) if d["steps"] else "—", d["km"] or "—", d["kcal"] or "—",
          d["active_light"] or 0, d["active_moderate"] or 0, d["active_vigorous"] or 0, d["zone_min"] or 0))
    w("")
    w("Awake heart max %s at %s · median while sitting still %s · minutes over 100 while still: %s"
      % (d.get("hr_max", "—"), d.get("hr_max_at", "—"), d["hr_still_median"] or "—",
         d["still_over_100_min"] if d["still_over_100_min"] is not None else "—"))
    w("")
    w("## Sessions")
    if d["_exercise"]:
        for e in d["_exercise"]:
            w("- %s–%s **%s** %d' · avg heart %s · zone minutes %s · %s kcal%s" % (
                e["start"], e["end"], e["name"], e["min"], e["hr_avg"] or "—", e["zone_min"] or "—",
                e["kcal"] or "—", " · %s steps" % e["steps"] if e["steps"] else ""))
    else:
        w("None recorded.")
    w("")
    w("## Heart up while sitting still")
    if d["_episodes"]:
        w("Four or more still minutes at 20+ bpm over this day's still median (%s). "
          "A fact about the heart, not a reading of the moment: check what was happening." % d["hr_still_median"])
        for e in d["_episodes"]:
            who = wa["_episodes"].get(e["start"]) or []
            w("- %s–%s · peak %d · %d min%s" % (dt.datetime.fromtimestamp(e["start"]).strftime("%H:%M"),
                                               dt.datetime.fromtimestamp(e["end"] + 60).strftime("%H:%M"),
                                               e["peak"], e["n"],
                                               " · WhatsApp in those minutes: " + ", ".join("[[%s]]" % x for x in who)
                                               if who else " · no WhatsApp in those minutes"))
    else:
        w("None.")
    w("")
    w("## Heart, hour by hour")
    w("| hour | min | mean | max | WhatsApp sent | received |")
    w("| --- | --- | --- | --- | --- | --- |")
    for h, (lo, mean, hi) in d["_hours"].items():
        sent, recv = wa["_hourly"].get(h, (0, 0))
        w("| %02d | %d | %d | %d | %s | %s |" % (h, lo, mean, hi, sent or "", recv or ""))
    w("")
    timed = []
    for f in sorted(glob.glob(os.path.join("data", "interactions", "*", d["date"] + "*.md"))):
        n = Node(f, open(f, encoding="utf8", errors="ignore").read())
        m = re.match(r"^(\d\d:\d\d)\s*[-–]\s*(\d\d:\d\d)$", (n.get("time") or "").strip('"').strip())
        if m:
            timed.append((m.group(1), m.group(2), os.path.relpath(f, "data")[:-3], (n.get("setting") or "").strip('"')))
    if timed:
        w("## Body during the logged moments")
        w("From each interaction's `time:`. Heart against this day's still median (%s). Numbers, not moods."
          % (d.get("hr_still_median") or "—"))
        for a, b, rel, setting in sorted(timed):
            end_day = d["date"] if b > a else (dt.date.fromisoformat(d["date"]) + dt.timedelta(days=1)).isoformat()
            try:
                r = window("%sT%s:00" % (d["date"], a), "%sT%s:00" % (end_day, b))
            except Exception:       # noqa: BLE001 — a bad time must not break the day
                continue
            if not r.get("readings", 1):
                w("- %s–%s [[%s]] (%s) · no heart data" % (a, b, rel, setting))
                continue
            w("- %s–%s [[%s]] (%s) · heart %s mean, %s max at %s · still %s of %s min · %s steps"
              % (a, b, rel, setting, r["hr_mean"], r["hr_max"], r["hr_max_at"], r["minutes_still"],
                 r["minutes"], r["steps"]))
        w("")
    w("## Same day in the graph")
    ins = interactions_on(d["date"])
    if ins:
        for rel in ins:
            w("- [[%s]]" % rel)
    else:
        w("Nothing logged.")
    return "\n".join(L)


def day_context(date, first, last):
    """Every edge the rest of the graph already proves for this date. Facts only, never guesses:

    - contacts: the anchor person of every interaction logged that day (any channel)
    - met:      the people of the IN-PERSON ones (setting says in-person / dinner / lunch / meeting /
                event / session), plus their `with:` — the log itself says they were in the room
    - city / places: the `city:` and `at:` of those in-person interactions
    - events_on_day: events whose `date:` is this day, or whose `start:`..`end:` covers it. An
                event on the same day is a calendar fact, not proof he attended.
    - prev / next: the neighbouring body days, so the days form a chain in the graph
    """
    contacts, met, cities, places, events = set(), set(), set(), set(), set()
    for f in glob.glob(os.path.join("data", "interactions", "*", date + "*.md")):
        n = Node(f, open(f, encoding="utf8", errors="ignore").read())
        anchor = n.link_list("person")
        person = f.split(os.sep)[2]
        owners = config.owner_slugs()
        if person in owners:
            continue
        contacts.update(a for a in anchor if a not in owners)
        setting = (n.get("setting") or "").lower()
        if re.search(r"in.person|dinner|lunch|meeting|event|session", setting):
            met.update(a for a in anchor if a not in owners)
            met.update(n.link_list("with"))
            cities.update(n.link_list("city"))
            places.update(n.link_list("at"))
    for f in glob.glob(os.path.join("data", "events", "*.md")):
        n = Node(f, open(f, encoding="utf8", errors="ignore").read())
        dd, st_, en = (n.get("date") or "").strip('"'), (n.get("start") or "").strip('"'), (n.get("end") or "").strip('"')
        if dd == date or (len(st_) == 10 and len(en) == 10 and st_ <= date <= en):
            events.add(n.slug)
    exists = lambda s: os.path.exists(os.path.join("data", "people", s + ".md"))   # noqa: E731
    prev = (dt.date.fromisoformat(date) - dt.timedelta(days=1)).isoformat()
    nxt = (dt.date.fromisoformat(date) + dt.timedelta(days=1)).isoformat()
    return {
        "contacts": sorted(s for s in contacts if exists(s)),
        "met": sorted(s for s in met if exists(s)),
        "city": sorted(cities),
        "places": sorted(places),
        "events_on_day": sorted(events),
        "prev": ["body-" + prev] if prev >= first else [],
        "next": ["body-" + nxt] if nxt <= last else [],
    }


def write_day(c, date, first, last=None, pmap=None):
    d = day_metrics(c, date)
    path = os.path.join(OUT, "body-%s.md" % date)
    preserved, notes = {}, "## Notes\n"
    if os.path.exists(path):
        old = Node(path, open(path, encoding="utf8").read())
        for k in PRESERVED_KEYS:
            if k == "notion_url":
                preserved[k] = (old.get(k) or "").strip('"')
                continue
            v = old.link_list(k) if k in ("with", "at") else (old.get(k) or [])
            preserved[k] = v if isinstance(v, list) else [v]
        m = re.search(r"^## Notes\n.*", old.body, re.S | re.M)
        if m:
            notes = m.group(0)
    resolved = set(x.strip('"') for x in preserved.get("sessions_resolved", []))
    sessions = [session_key(e) for e in d["_exercise"] if social(e)]
    open_ = [s for s in sessions if s.split(" ")[0] not in resolved]
    last = last or date
    ctx = day_context(date, first, last)
    wa = wa_day(d)
    d["_wa"] = wa
    iso = dt.date.fromisoformat(date).isocalendar()
    week = "body-week-%d-W%02d" % (iso[0], iso[1])
    pmap = passion_map() if pmap is None else pmap
    acts = sorted({passion_for(e["name"], pmap) for e in d["_exercise"]} - {None})

    fm = ["---", "type: body-day", 'person: "[[%s]]"' % config.OWNER_NODE, "date: %s" % date,
          "source: %s" % DEVICE_SLUG]
    for k in PUBLIC[1:]:
        v = d.get(k)
        if v is None:
            fm.append("%s:" % k)
        elif isinstance(v, str):
            fm.append('%s: "%s"' % (k, v))
        else:
            fm.append("%s: %s" % (k, v))
    fm.append("sessions: %d" % len(d["_exercise"]))

    def lst(key, items, link=False):
        if not items:
            fm.append("%s:" % key)
            return
        fm.append("%s:" % key)
        for i in sorted(items):
            fm.append('  - "[[%s]]"' % i if link else '  - "%s"' % i)
    lst("activities", acts, link=True)
    fm.append('week: "[[%s]]"' % week)
    for k in ("prev", "next", "contacts", "met", "city", "places", "events_on_day"):
        lst(k, ctx[k], link=True)
    for k in ("last_before_sleep", "first_after_wake", "late_night", "top_chats", "group_chats"):
        lst(k, wa[k], link=True)
    lst("with", preserved.get("with", []), link=True)
    lst("at", preserved.get("at", []), link=True)
    lst("sessions_open", open_)
    lst("sessions_resolved", sorted(resolved))
    if preserved.get("notion_url"):
        fm.append('notion_url: "%s"' % preserved["notion_url"])
    else:
        fm.append("notion_url:")
    fm.append("---")
    cand = ""
    lines = []
    for s_ in open_:
        bits = []
        if ctx["events_on_day"]:
            bits.append("same day as " + ", ".join("[[%s]]" % e for e in ctx["events_on_day"]))
        talk = wa["_sessions"].get(s_.split(" ")[0]) or []
        if talk:
            bits.append("sport words on WhatsApp in the 3h before, with " + ", ".join("[[%s]]" % x for x in talk))
        if bits:
            lines.append("- %s · %s\n" % (s_, " · ".join(bits)))
    if lines:
        cand = ("\n\n## Sessions and the graph\n"
                "Leads for the open sessions, not answers: the sweep reads those messages and only then "
                "fills `with` / `at`.\n" + "".join(lines))
    text = "\n".join(fm) + "\n\n" + GEN_START + "\n" + render(d) + cand.rstrip("\n") + "\n" + GEN_END + "\n\n" + notes.rstrip() + "\n"
    os.makedirs(OUT, exist_ok=True)
    if os.path.exists(path) and open(path, encoding="utf8").read() == text:
        return False
    with open(path, "w", encoding="utf8") as fh:
        fh.write(text)
    back = Node(path, text)
    if back.issues:
        raise RuntimeError("body day broke its frontmatter: %s %s" % (path, back.issues))
    return True


def write_weeks():
    """data/body/body-week-YYYY-Www.md: the semantic layer over the days. Averages, the sessions,
    and who filled the week (people on the most days), all rebuilt from the day nodes."""
    by = defaultdict(list)
    for p in sorted(glob.glob(os.path.join(OUT, "body-20*.md"))):
        n = Node(p, open(p, encoding="utf8").read())
        by[(n.get("week") or "").strip('"').strip("[]")].append(n)
    for wk, days in sorted(by.items()):
        if not wk:
            continue
        def nums(k):
            out = []
            for n in days:
                v = (n.get(k) or "").strip('"')
                try:
                    out.append(float(v))
                except ValueError:
                    pass
            return out
        def avg(k, f="%.0f"):
            v = nums(k)
            return f % st.mean(v) if v else "—"
        def count(field):
            c = defaultdict(int)
            for n in days:
                for x in n.link_list(field):
                    c[x] += 1
            return sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))
        sl = nums("sleep_min")
        late = sum(1 for n in days if "02:00" <= (n.get("bed") or "").strip('"') < "12:00")
        contacts, met, top = count("contacts"), count("met"), count("top_chats")
        events = sorted({e for n in days for e in n.link_list("events_on_day")})
        acts = sorted({a for n in days for a in n.link_list("activities")})
        fm = ["---", "type: body-week", 'person: "[[%s]]"' % config.OWNER_NODE, "week: %s" % wk[len("body-week-"):],
              "days: %d" % len(days)]

        def lst(key, items):
            fm.append("%s:" % key)
            for i in items:
                fm.append('  - "[[%s]]"' % i)
        lst("body_days", [n.slug for n in days])
        lst("most_seen", [k for k, _ in met[:8]])
        lst("most_written_to", [k for k, _ in top[:8]])
        lst("events_on_day", events)
        lst("activities", acts)
        fm.append("---")
        b = ["", "# %s — body" % wk[len("body-week-"):], "",
             "_Generated by `tools/body.py` from the day nodes; do not edit._", "",
             "Sleep %s a night (%d nights, %d after 02:00) · resting heart %s · HRV %s ms · %s steps a day · "
             "heart-zone minutes %s in total" % (fmt_h(int(st.mean(sl))) if sl else "—", len(sl), late,
                                                  avg("rhr"), avg("hrv_ms", "%.1f"), avg("steps"),
                                                  int(sum(nums("zone_min")))), "",
             "## Days", ""]
        for n in days:
            b.append("- [[%s]] · %s → %s · %s asleep · sessions %s" % (
                n.slug, (n.get("bed") or "—").strip('"'), (n.get("wake") or "—").strip('"'),
                fmt_h(int(n.get("sleep_min"))) if n.get("sleep_min") else "—", n.get("sessions") or 0))
        b += ["", "## Seen in person, by days", ""]
        b += ["- [[%s]] · %d" % kv for kv in met[:12]] or ["Nobody logged in person."]
        b += ["", "## Written to most, by days in the top five", ""]
        b += ["- [[%s]] · %d" % kv for kv in top[:12]] or ["—"]
        b += ["", "## In touch, by days with a logged interaction", ""]
        b += ["- [[%s]] · %d" % kv for kv in contacts[:20]] or ["—"]
        text = "\n".join(fm) + "\n" + "\n".join(b) + "\n"
        path = os.path.join(OUT, wk + ".md")
        if not os.path.exists(path) or open(path, encoding="utf8").read() != text:
            with open(path, "w", encoding="utf8") as fh:
                fh.write(text)
    print("body weeks: %d" % len([k for k in by if k]))


def write_table():
    """data/body/body-log.md: every body day as one row, newest first. Generated, never edited."""
    rows = []
    if not glob.glob(os.path.join(OUT, "body-20*.md")):
        print("body table: no body days yet")
        return
    for p in sorted(glob.glob(os.path.join(OUT, "body-20*.md")), reverse=True):
        n = Node(p, open(p, encoding="utf8").read())
        g = lambda k: (n.get(k) or "").strip('"') or "—"   # noqa: E731
        sm = n.get("sleep_min")
        date = n.get("date")
        rows.append("| [[body-%s\\|%s]] | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |" % (
            date, dt.date.fromisoformat(date).strftime("%a %d %b"), g("bed"), g("wake"),
            fmt_h(int(sm)) if sm else "—", g("deep_min"), g("rem_min"), g("rhr"), g("hrv_ms"),
            g("spo2"), g("steps"), g("zone_min"), g("hr_max"), g("sessions")))
    text = "\n".join([
        "---",
        "type: body-log",
        'person: "[[%s]]"' % config.OWNER_NODE,
        "source: %s" % DEVICE_SLUG,
        "---",
        "",
        "# Body — daily table",
        "",
        "_Generated by `python3 tools/body.py table` from the day nodes; do not edit. One row per day,",
        "newest first. To mirror the rows elsewhere (e.g. a Notion database), use",
        "`python3 tools/body.py rows` or `python3 tools/body.py notion`._",
        "",
        "| day | bed | up | asleep | deep | REM | rest HR | HRV | SpO2 | steps | zone min | max HR | sessions |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ] + rows) + "\n"
    path = os.path.join(OUT, "body-log.md")
    if not os.path.exists(path) or open(path, encoding="utf8").read() != text:
        with open(path, "w", encoding="utf8") as fh:
            fh.write(text)
    print("body table: %d days" % len(rows))


def store_bounds(c):
    """(first, last) day in the store, measured, never typed in. FIRST_DAY can only narrow it."""
    # substr, not date(): date() converts to UTC, and a reading at 00:30 local is that local day
    lo, hi = c.execute("select min(substr(ts, 1, 10)), max(substr(ts, 1, 10)) from hr").fetchone()
    if FIRST_DAY and (not lo or str(FIRST_DAY) > lo):
        lo = str(FIRST_DAY)
    return lo, hi


def date_range(args):
    c = db()
    first, last = store_bounds(c)
    a = args[0] if args else first
    b = args[1] if len(args) > 1 else last
    if not a or not b:
        print("the body store has no heart-rate data yet: nothing to write.")
        return
    d = dt.date.fromisoformat(a)
    while d <= dt.date.fromisoformat(b):
        yield c, d.isoformat()
        d += dt.timedelta(days=1)


def main():
    cmd, args = (sys.argv[1] if len(sys.argv) > 1 else ""), sys.argv[2:]
    config.chdir_repo()
    if cmd == "ingest":
        need(raw=True)
    elif cmd in ("days", "rows", "notion", "window"):
        need()
    if cmd == "ingest":
        ingest()
    elif cmd == "days":
        first_day, last_day = store_bounds(db())
        pmap = passion_map()
        n = sum(write_day(c, date, first_day, last_day, pmap) for c, date in date_range(args))
        print("body days written: %d" % n)
        write_table()
        write_weeks()
    elif cmd == "table":
        write_table()
        write_weeks()
    elif cmd == "rows":
        out = []
        for c, date in date_range(args):
            d = day_metrics(c, date)
            row = {k: d.get(k) for k in PUBLIC}
            row["sessions"] = "; ".join("%s %s %d' hr %s" % (e["start"], e["name"], e["min"], e["hr_avg"] or "—")
                                        for e in d["_exercise"])
            out.append(row)
        print(json.dumps(out, indent=1))
    elif cmd == "notion":
        # Page properties for an optional Notion "Body — Daily" database (one row per day).
        # Create the database with these property names, then upsert the printed pages.
        pages = []
        for c, date in date_range(args):
            d = day_metrics(c, date)
            p = {
                "Day": dt.date.fromisoformat(date).strftime("%a %d %b %Y"),
                "date:Date:start": date, "date:Date:is_datetime": 0,
                "Bed": d.get("bed"), "Up": d.get("wake"),
                "Asleep (h)": round(d["sleep_min"] / 60, 2) if d.get("sleep_min") else None,
                "Deep (min)": d.get("deep_min"), "REM (min)": d.get("rem_min"),
                "Light (min)": d.get("light_min"), "Awake (min)": d.get("awake_min"),
                "Naps (min)": d.get("nap_min"), "Lowest night HR": d.get("hr_sleep_min"),
                "Resting HR": d.get("rhr"), "HRV (ms)": d.get("hrv_ms"), "SpO2 (%)": d.get("spo2"),
                "SpO2 low (%)": d.get("spo2_low"), "Breathing (/min)": d.get("breathing"),
                "Skin temp vs baseline (°C)": d.get("temp_dev"), "Steps": d.get("steps"),
                "Distance (km)": d.get("km"), "Calories": d.get("kcal"),
                "Active light (min)": d.get("active_light"),
                "Active moderate (min)": d.get("active_moderate"),
                "Active vigorous (min)": d.get("active_vigorous"),
                "Heart-zone (min)": d.get("zone_min"), "Max HR": d.get("hr_max"),
                "Max HR at": d.get("hr_max_at"), "Still HR median": d.get("hr_still_median"),
                "Still over 100 (min)": d.get("still_over_100_min"),
                "Sessions": "; ".join("%s %s %d' avg HR %s" % (e["start"], e["name"], e["min"], e["hr_avg"] or "—")
                                      for e in d["_exercise"]) or None,
                "Source": DEVICE, "Repo file": "data/body/body-%s.md" % date,
            }
            pages.append({"properties": {k: v for k, v in p.items() if v is not None}})
        print(json.dumps(pages, ensure_ascii=False))
    elif cmd == "link-notion":
        # python3 tools/body.py link-notion 2026-10-20 <the Notion page URL>
        date, url = args[0], args[1]
        path = os.path.join(OUT, "body-%s.md" % date)
        text = open(path, encoding="utf8").read()
        new = re.sub(r"^notion_url:.*$", 'notion_url: "%s"' % url, text, count=1, flags=re.M)
        if new != text:
            open(path, "w", encoding="utf8").write(new)
        if Node(path, new).issues:
            raise RuntimeError("link-notion broke %s" % path)
        print("%s -> %s" % (date, url))
    elif cmd == "window":
        print(json.dumps(window(args[0], args[1]), indent=1))
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
