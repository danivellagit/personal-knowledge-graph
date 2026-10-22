#!/usr/bin/env python3
"""What the sweep still owes: days with real WhatsApp traffic and no interaction file at all.

    python3 tools/owed_backfill.py          # what is still owed, oldest first
    python3 tools/owed_backfill.py --all    # include the quiet days too

Why this exists. The daily catch-up check used to compare "days with WhatsApp traffic" against
"days with an interaction file" starting from a hardcoded date, on the belief that everything
earlier was covered by monthly rollups. It was not: a whole season — two months, thousands of
messages, hundreds a day — had no daily file, and every run truthfully reported "nothing owed",
because the detector could not see the region it had been told to skip.

A hardcoded start date makes a region invisible to its own detector. This script is the
opposite: it never assumes, it measures, and it keeps measuring until the region is empty. The
region starts at the first busy day in EITHER source, measured, never typed in.

Sources (both optional, read-only; at least one is needed):
  whatsapp.bridge_db   env WHATSAPP_DB          the whatsapp-mcp bridge's messages.db
  whatsapp.desktop_db  env WHATSAPP_DESKTOP_DB  the WhatsApp desktop app's ChatStorage.sqlite; on
                       macOS: ~/Library/Group Containers/group.net.whatsapp.WhatsApp.shared/
                       ChatStorage.sqlite (opt-in: never read unless you set it)
Tuning:
  backfill.busy_min    env BACKFILL_BUSY_MIN    below this many messages a day is noise (50)
  backfill.until       env BACKFILL_UNTIL       exclusive end of the region (default: today)
"""
import datetime
import glob
import os
import re
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402


def swept_dates():
    out = set()
    for p in glob.glob("data/interactions/*/*.md"):
        m = re.search(r"(\d{4}-\d{2}-\d{2})", os.path.basename(p))
        if m:
            out.add(m.group(1))
    return out


def ro(path):
    return sqlite3.connect("file:%s?mode=ro" % path, uri=True)


def main():
    config.chdir_repo()
    show_all = "--all" in sys.argv
    bridge = config.get_path("whatsapp.bridge_db", "WHATSAPP_DB")
    mac = config.get_path("whatsapp.desktop_db", "WHATSAPP_DESKTOP_DB")
    until = str(config.get("backfill.until", datetime.date.today().isoformat(), "BACKFILL_UNTIL"))
    busy = int(config.get("backfill.busy_min", 50, "BACKFILL_BUSY_MIN"))

    wa = {}
    used = []
    if bridge and os.path.exists(bridge):
        wa = dict(ro(bridge).execute("SELECT date(timestamp), count(*) FROM messages GROUP BY 1"))
        used.append("bridge")
    if mac and os.path.exists(mac):
        rows = ro(mac).execute(
            "SELECT date(ZMESSAGEDATE + 978307200, 'unixepoch', 'localtime'), count(*) "
            "FROM ZWAMESSAGE WHERE ZMESSAGETYPE NOT IN (6, 10) GROUP BY 1")
        for d, n in rows:
            wa[d] = max(wa.get(d, 0), n)   # same messages in both: take the fuller count
        used.append("desktop app")
    if not used:
        config.not_configured("WhatsApp backfill", [
            ("whatsapp.bridge_db", "WHATSAPP_DB"),
            ("whatsapp.desktop_db", "WHATSAPP_DESKTOP_DB")])

    swept = swept_dates()
    owed = [
        (d, n)
        for d, n in sorted(wa.items())
        if d and d < until and d not in swept and (show_all or n >= busy)
    ]

    if not owed:
        print(f"backfill before {until}: COMPLETE — nothing owed ({' + '.join(used)}).")
        return

    print(
        f"days before {until} still owed: {len(owed)}  "
        f"({sum(n for _, n in owed):,} WhatsApp messages, {' + '.join(used)})"
    )
    print("oldest first — one commit per day, same rule zero as a normal sweep:\n")
    for d, n in owed:
        wd = datetime.date.fromisoformat(d).strftime("%a")
        print(f"   {d} {wd}  {n:4d} msgs")


if __name__ == "__main__":
    main()
