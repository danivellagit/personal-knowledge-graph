#!/usr/bin/env bash
# One-time (and re-runnable) setup of the Life App on THIS machine. Safe to run again: every step checks first and
# skips what is already done. Nothing personal is ever committed: the password, salt and data stay outside git.
#
#   bash tools/life-app/setup.sh                       # interactive: owner name, password, sample data, first build
#   bash tools/life-app/setup.sh --dry-run             # print what each step would do, change nothing
#   bash tools/life-app/setup.sh --owner "Ada" --password-file ~/pw.txt --yes     # non-interactive
#   bash tools/life-app/setup.sh --create-site [--site-repo user/life-app]       # also make YOUR public Pages repo
#                                                      # with gh, enable GitHub Pages and publish the encrypted app
#
# Steps:
#   1. prerequisites: python3, node >= 18, npm, git (gh only with --create-site, logged in: gh auth login)
#   2. config.local.yml (gitignored): adds a `life_app:` block with owner_name (and site.repo) if there is none
#   3. password: stored in life_app.password_file (default ~/.secrets/life-app-password, mode 600, outside the repo)
#   4. npm ci in tools/life-app (esbuild, react; playwright-core for verify.mjs)
#   5. data/happiness/: created from FAKE sample data when missing (python3 tools/happiness.py init); kept when present
#   6. build: tools/life-app/publish.sh --no-push -> tools/life-app/out/site
#   7. with --create-site: gh repo create <user>/<repo> --public (if missing), publish the ciphertext, enable Pages
set -euo pipefail
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KB="$(cd "$APP/../.." && pwd)"
DRY=0 YES=0 SITE=0 OWNER="" PWSRC="" SITE_REPO=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1; shift;;
    --yes|-y) YES=1; shift;;
    --create-site) SITE=1; shift;;
    --owner) OWNER="$2"; shift 2;;
    --password-file) PWSRC="$2"; shift 2;;
    --site-repo) SITE_REPO="$2"; SITE=1; shift 2;;
    -h|--help) sed -n 2,20p "$0"; exit 0;;
    *) echo "unknown option $1" >&2; exit 2;;
  esac
done
say() { printf '\n== %s\n' "$*"; }
do_() { if [ "$DRY" = 1 ]; then echo "   would run: $*"; else "$@"; fi; }
cfg() { python3 "$APP/life_config.py" get "$1"; }
interactive() { [ "$YES" = 0 ] && [ -t 0 ]; }
LOCAL="$KB/config.local.yml"

say "1. prerequisites"
miss=0
for c in python3 node npm git; do command -v "$c" >/dev/null 2>&1 && echo "   ok  $c" || { echo "   MISSING $c"; miss=1; }; done
if command -v node >/dev/null 2>&1; then nv="$(node -p 'process.versions.node.split(".")[0]')"; [ "$nv" -ge 18 ] || { echo "   node $nv is too old (need 18+)"; miss=1; }; fi
if [ "$SITE" = 1 ]; then
  if command -v gh >/dev/null 2>&1; then gh auth status >/dev/null 2>&1 && echo "   ok  gh (logged in)" || { echo "   gh is not logged in: run gh auth login"; [ "$DRY" = 1 ] || miss=1; }
  else echo "   MISSING gh (https://cli.github.com), needed for --create-site"; [ "$DRY" = 1 ] || miss=1; fi
fi
[ "$miss" = 0 ] || { echo "install the missing tools and run this again"; exit 3; }

say "2. config.local.yml"
if [ -f "$LOCAL" ] && grep -q '^life_app:' "$LOCAL"; then
  echo "   life_app: block already there (edit it by hand to change owner, areas, site); keeping it"
else
  if [ -z "$OWNER" ] && interactive; then read -r -p "   Your first name (shown in the app): " OWNER; fi
  [ -n "$OWNER" ] || OWNER="$(cfg owner_name)"
  if [ "$SITE" = 1 ] && [ -z "$SITE_REPO" ] && command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    SITE_REPO="$(gh api user -q .login)/life-app"
  fi
  BLOCK="$(printf '\n# Life App (written by tools/life-app/setup.sh; see config.example.yml for every key)\nlife_app:\n  enabled: true\n  owner_name: "%s"\n' "$OWNER")"
  [ -n "$SITE_REPO" ] && BLOCK="$BLOCK$(printf '\n  site:\n    repo: "%s"\n' "$SITE_REPO")"
  if [ "$DRY" = 1 ]; then echo "   would append to $LOCAL:"; printf '%s\n' "$BLOCK" | sed 's/^/     /'
  else printf '%s\n' "$BLOCK" >> "$LOCAL"; echo "   wrote life_app: block to config.local.yml (owner_name: $OWNER${SITE_REPO:+, site.repo: $SITE_REPO})"; fi
fi
git -C "$KB" check-ignore -q config.local.yml || echo "   WARNING: config.local.yml is not gitignored here; do not commit it"

say "3. app password"
PWFILE="$(cfg password_file)"
case "$(cd "$(dirname "$PWFILE")" 2>/dev/null && pwd || dirname "$PWFILE")/" in "$KB"/*) echo "   ERROR: password_file $PWFILE is inside the repo; put it outside (e.g. ~/.secrets/)"; exit 4;; esac
if [ -s "$PWFILE" ]; then echo "   $PWFILE exists; keeping it (delete it and rerun to change the password)"
elif [ "$DRY" = 1 ]; then echo "   would store the password in $PWFILE (mode 600)"
else
  mkdir -p "$(dirname "$PWFILE")"; chmod 700 "$(dirname "$PWFILE")" 2>/dev/null || true
  if [ -n "$PWSRC" ]; then (umask 077; head -n1 "$PWSRC" > "$PWFILE")
  elif [ -n "${LIFE_APP_PASSWORD:-}" ]; then (umask 077; printf '%s\n' "$LIFE_APP_PASSWORD" > "$PWFILE")
  elif interactive; then
    read -r -s -p "   Choose the app password: " P1; echo; read -r -s -p "   Again: " P2; echo
    [ -n "$P1" ] && [ "$P1" = "$P2" ] || { echo "   passwords empty or different; nothing saved"; exit 4; }
    (umask 077; printf '%s\n' "$P1" > "$PWFILE"); unset P1 P2
  else echo "   ERROR: no password: give --password-file FILE or LIFE_APP_PASSWORD, or run interactively"; exit 4; fi
  chmod 600 "$PWFILE"; echo "   saved to $PWFILE (mode 600, never committed)"
fi

say "4. build dependencies"
if [ -d "$APP/node_modules/esbuild" ]; then echo "   already installed"; else do_ bash -c "cd '$APP' && npm ci --no-audit --no-fund --silent"; fi

say "5. data/happiness"
if [ -d "$KB/data/happiness" ] && ls "$KB/data/happiness"/*.json >/dev/null 2>&1; then echo "   data/happiness exists; keeping your data"
else do_ python3 "$KB/tools/happiness.py" init; echo "   (FAKE sample data: your agents replace it file by file, see tools/life-app/DATA-MODEL.md)"; fi

say "6. first build"
if [ "$DRY" = 1 ]; then bash "$APP/publish.sh" --no-push --dry-run | sed 's/^/   /'
else bash "$APP/publish.sh" --no-push; fi

if [ "$SITE" = 1 ]; then
  say "7. your Pages site"
  REPO="${SITE_REPO:-$(cfg site.repo)}"
  [ -n "$REPO" ] || { echo "   no site repo: pass --site-repo user/name or set life_app.site.repo"; exit 5; }
  if [ "$DRY" = 1 ]; then
    echo "   would create github.com/$REPO (public, ciphertext only) if missing, push out/site to it, enable Pages on $(cfg site.branch)"
  else
    if gh repo view "$REPO" >/dev/null 2>&1; then echo "   github.com/$REPO exists"
    else gh repo create "$REPO" --public --description "Encrypted Life App build (ciphertext only)" >/dev/null; echo "   created github.com/$REPO (public)"; fi
    LIFE_APP_REPO="$REPO" bash "$APP/publish.sh" --force
    if gh api "repos/$REPO/pages" >/dev/null 2>&1; then echo "   GitHub Pages already enabled"
    else gh api -X POST "repos/$REPO/pages" -f "source[branch]=$(cfg site.branch)" -f "source[path]=/" >/dev/null && echo "   GitHub Pages enabled"; fi
    echo "   your app: $(LIFE_APP_REPO="$REPO" python3 "$APP/life_config.py" get site.url)  (first deploy takes about a minute)"
    echo "   on the phone: open it in Safari, Share > Add to Home Screen, unlock with your password"
  fi
fi
say "done$([ "$DRY" = 1 ] && echo " (dry run: nothing changed)")"
echo "   update the app after any data change: bash tools/life-app/publish.sh"
