#!/bin/bash
# Pull the phone's location batches (the Overland iOS app posts them to a receiver you host, e.g.
# a small serverless function writing to private storage) into <location.raw_dir>/overland/<date>/,
# off-repo. Then: python3 tools/location.py ingest
#
# The puller itself is yours: set `location.pull_command` in config.local.yml (or
# LOCATION_PULL_CMD) to the command that downloads new batches into
# "$LOCATION_DIR/overland/<YYYY-MM-DD>/*.json". It runs with LOCATION_DIR exported, and with
# LOCATION_PRUNE_AFTER_DAYS when `location.prune_after_days` is set (batches older than this can be
# deleted from the remote store once pulled; the puller decides how).
# Usage: tools/location-pull.sh
# OPTIONAL layer: unconfigured or `location.enabled: false`, this prints why and exits 0.
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cfg() { python3 "$REPO/tools/config.py" get "$1"; }

case "$(cfg location.enabled | tr 'A-Z' 'a-z')" in
  false|no|off|0) echo "Location layer is switched off (location.enabled: false) — nothing to pull."; exit 0;;
esac
CMD="${LOCATION_PULL_CMD:-$(cfg location.pull_command)}"
LOCATION_DIR="${LOCATION_DIR:-$(cfg location.raw_dir)}"
if [ -z "$CMD" ] || [ -z "$LOCATION_DIR" ]; then
  echo "Location layer not configured — nothing to pull."
  echo "  set location.raw_dir (or LOCATION_DIR) and location.pull_command (or LOCATION_PULL_CMD)"
  echo "  in config.local.yml. Optional layer: the rest of the graph works without it."
  exit 0
fi
case "$LOCATION_DIR" in "$REPO"|"$REPO"/*) echo "location.raw_dir must be outside the repo: $LOCATION_DIR" >&2; exit 1;; esac
export LOCATION_DIR
PRUNE="${LOCATION_PRUNE_AFTER_DAYS:-$(cfg location.prune_after_days)}"
[ -n "$PRUNE" ] && export LOCATION_PRUNE_AFTER_DAYS="$PRUNE"
mkdir -p "$LOCATION_DIR/overland"
bash -c "$CMD"
