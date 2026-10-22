#!/bin/bash
# Pull raw wearable data (Google Health API, through its command-line client) for tools/body.py.
# Every data type, one file per type per day, from START to today, into body.raw_dir (off-repo).
#
# Usage: tools/body-pull.sh [YYYY-MM-DD]
#        then  python3 tools/body.py ingest && python3 tools/body.py days
#
# START is the argument if given; otherwise the day after the newest day already pulled (the pull
# resumes, it never restarts from a typed-in date); otherwise body.first_day; otherwise it asks.
# Days already saved are skipped, except the last one, which is always refetched.
#
# Configuration (config.local.yml, or the env var):
#   body.cli      GHEALTH    the client binary (default: `ghealth` on PATH). It must answer
#                            `<cli> data <type> list --from D --to D --limit N` and
#                            `<cli> data <type> daily-rollup --from D --to D` with JSON.
#   body.raw_dir  BODY_RAW   where the raw JSON goes. Outside the repo.
# OPTIONAL layer: unconfigured or `body.enabled: false`, this prints why and exits 0.
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cfg() { python3 "$REPO/tools/config.py" get "$1"; }

case "$(cfg body.enabled | tr 'A-Z' 'a-z')" in
  false|no|off|0) echo "Body layer is switched off (body.enabled: false) — nothing to pull."; exit 0;;
esac

G="${GHEALTH:-$(cfg body.cli)}"
[ -z "$G" ] && G="$(command -v ghealth 2>/dev/null)"
OUT="${BODY_RAW:-$(cfg body.raw_dir)}"
if [ -z "$G" ] || [ ! -x "$G" ] || [ -z "$OUT" ]; then
  echo "Body layer not configured — nothing to pull."
  echo "  set body.cli (or GHEALTH) to the Google Health CLI, and body.raw_dir (or BODY_RAW)"
  echo "  in config.local.yml. Optional layer: the rest of the graph works without it."
  exit 0
fi
case "$OUT" in "$REPO"|"$REPO"/*) echo "body.raw_dir must be outside the repo: $OUT" >&2; exit 1;; esac

next_day() { date -j -v+1d -f %F "$1" +%F 2>/dev/null || date -d "$1 +1 day" +%F; }

START="$1"
if [ -z "$START" ]; then
  LAST=$(ls "$OUT"/steps/*.json 2>/dev/null | sed 's#.*/##; s#\.json$##' | sort | tail -1)
  [ -n "$LAST" ] && START="$LAST"            # refetch the newest day: it may have been partial
fi
[ -z "$START" ] && START="${BODY_FIRST_DAY:-$(cfg body.first_day)}"
if [ -z "$START" ]; then
  echo "first pull: give the first day to fetch, e.g. tools/body-pull.sh 2026-01-01" >&2
  exit 1
fi
END=$(date +%F)

LIST="active-energy-burned active-zone-minutes activity-level altitude basal-energy-burned blood-glucose body-fat core-body-temperature daily-heart-rate-variability daily-oxygen-saturation daily-respiratory-rate daily-resting-heart-rate daily-sleep-temperature-derivations daily-vo2-max distance electrocardiogram exercise heart-rate heart-rate-variability height hydration-log irregular-rhythm-notification nutrition-log oxygen-saturation respiratory-rate-sleep-summary sedentary-period sleep steps swim-lengths-data vo2-max weight"
ROLL="steps distance floors active-minutes total-calories time-in-heart-rate-zone calories-in-heart-rate-zone run-vo2-max active-zone-minutes"

d=$START
while [[ "$d" < "$END" || "$d" == "$END" ]]; do
  for t in $LIST; do
    f="$OUT/$t/$d.json"; mkdir -p "$OUT/$t"
    [[ -s "$f" && "$d" != "$END" && "$d" != "$START" ]] && continue
    "$G" data "$t" list --from "$d" --to "$d" --limit 500000 > "$f" 2>"$OUT/$t/$d.err" || echo "FAIL $t $d"
  done
  for t in $ROLL; do
    f="$OUT/rollup-$t/$d.json"; mkdir -p "$OUT/rollup-$t"
    [[ -s "$f" && "$d" != "$END" && "$d" != "$START" ]] && continue
    "$G" data "$t" daily-rollup --from "$d" --to "$d" > "$f" 2>"$OUT/rollup-$t/$d.err" || echo "FAIL rollup-$t $d"
  done
  echo "done $d"
  d=$(next_day "$d")
done

# the sleep stage timeline only comes with --detail, in one call for the whole pulled history
FIRST=$(ls "$OUT"/steps/*.json 2>/dev/null | sed 's#.*/##; s#\.json$##' | sort | head -1)
mkdir -p "$OUT/sleep-detail"
"$G" data sleep list --from "${FIRST:-$START}" --to today --detail --limit 1000 > "$OUT/sleep-detail/all.json"
echo "ALL DONE"
