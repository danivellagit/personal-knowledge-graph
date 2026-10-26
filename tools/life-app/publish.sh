#!/usr/bin/env bash
# Build, encrypt and (optionally) publish the Life App to YOUR separate GitHub Pages repo (life_app.site.repo).
#
#   tools/life-app/publish.sh              # validate data/happiness, build, regenerate the recaps, push if anything changed
#   tools/life-app/publish.sh --no-push    # build only (tools/life-app/out/site), push nothing
#   tools/life-app/publish.sh --force      # push even if the build did not change
#   tools/life-app/publish.sh --dry-run    # say what would happen, write nothing
#
# Settings: config.local.yml `life_app:` (tools/life-app/life_config.py prints the resolved values).
# Password: read at build time from life_app.password_file (default ~/.secrets/life-app-password), never printed or committed.
# The site repo receives ONLY the encrypted bundle (index.html with the ciphertext, sw.js, manifest, icons), as ONE
# commit that replaces the previous one on its Pages branch (so old ciphertexts do not pile up there). That repo is
# separate from this one: this repo (your graph) never needs to be public.
# Exit codes: 2 bad option, 3 no health page, 4 no password file, 5 no data/happiness, 6 invalid data, 10 site repo not reachable.
set -euo pipefail
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KB="$(cd "$APP/../.." && pwd)"
FORCE=0 PUSH=1 DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1; shift;;
    --no-push) PUSH=0; shift;;
    --dry-run) DRY=1; shift;;
    -h|--help) sed -n 2,16p "$0"; exit 0;;
    *) echo "unknown option $1" >&2; exit 2;;
  esac
done
cfg() { python3 "$APP/life_config.py" get "$1"; }
CACHE="$(cfg cache_dir)"; PWFILE="$(cfg password_file)"; PAGE="$(cfg health_page)"; HD="$KB/data/happiness"
REPO="$(cfg site.repo)"; BRANCH="$(cfg site.branch)"; TOKFILE="$(cfg site.token_file)"
GIT_NAME="$(cfg site.git_name)"; GIT_EMAIL="$(cfg site.git_email)"
[ "$(cfg enabled)" = "true" ] || { echo "life_app.enabled is false in config.local.yml: nothing to do"; exit 0; }
if [ "$DRY" = 1 ]; then
  echo "dry run, nothing written:"
  echo "  1. validate $HD (python3 tools/happiness.py validate)$([ -d "$HD" ] || echo "  <- MISSING: run tools/life-app/setup.sh or tools/happiness.py init")"
  echo "  2. inject it into $PAGE -> $CACHE/injected.tsx"
  echo "  3. build + encrypt with the password in $PWFILE$([ -s "$PWFILE" ] || echo "  <- MISSING: run tools/life-app/setup.sh") -> $APP/out/site"
  echo "  4. regenerate the MD recaps in $HD"
  if [ "$PUSH" = 1 ] && [ -n "$REPO" ]; then echo "  5. push the encrypted site to github.com/$REPO ($BRANCH) -> $(cfg site.url)"; else echo "  5. no push ($([ -n "$REPO" ] && echo "--no-push" || echo "life_app.site.repo not set"))"; fi
  exit 0
fi
[ -f "$PAGE" ] || { echo "ERROR: health page $PAGE missing" >&2; exit 3; }
[ -s "$PWFILE" ] || { echo "ERROR: password file $PWFILE missing: run tools/life-app/setup.sh" >&2; exit 4; }
[ -d "$HD" ] || { echo "ERROR: $HD missing: run tools/life-app/setup.sh (or python3 tools/happiness.py init for sample data)" >&2; exit 5; }
mkdir -p "$CACHE"
[ -d "$APP/node_modules/esbuild" ] || (cd "$APP" && npm ci --silent --no-audit --no-fund >/dev/null)
HP=(python3 "$KB/tools/happiness.py")
"${HP[@]}" validate || { echo "ERROR: data/happiness is not valid (see above), nothing built" >&2; exit 6; }
"${HP[@]}" inject --source "$PAGE" --out "$CACHE/injected.tsx" >/dev/null
(cd "$APP" && node build.mjs --health-source "$CACHE/injected.tsx" --kb "$KB" --out "$APP/out/site" --password-file "$PWFILE")
rm -f "$CACHE/injected.tsx" "$CACHE/injected.tsx.weights.json"
NEW="$(cat "$APP/out/last-plain.sha256")"
"${HP[@]}" recap --scores "$APP/out/scores.json" || echo "warn: recap not regenerated" >&2
[ "$PUSH" = 1 ] || { echo "built (not pushed): $APP/out/site"; exit 0; }
[ -n "$REPO" ] || { echo "built: $APP/out/site (no life_app.site.repo set, so nothing pushed; tools/life-app/setup.sh --create-site makes one)"; exit 0; }
if [ "$FORCE" = 0 ] && [ -f "$CACHE/published.sha256" ] && [ "$(cat "$CACHE/published.sha256")" = "$NEW" ]; then
  echo "no changes since the last publish, nothing pushed"; exit 0
fi
URL="https://github.com/$REPO.git"
G=(git)
if [ -n "$TOKFILE" ] && [ -s "$TOKFILE" ]; then
  export LIFE_SITE_TOKEN="$(cat "$TOKFILE")"
  G=(git -c credential.helper= -c "credential.helper=!f(){ echo username=x-access-token; echo password=\$LIFE_SITE_TOKEN; }; f")
elif command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  G=(git -c credential.helper= -c "credential.helper=!gh auth git-credential")
fi
"${G[@]}" ls-remote "$URL" >/dev/null 2>&1 || { echo "ERROR: cannot reach $URL (repo missing, or no push access: gh auth login / life_app.site.token_file)" >&2; exit 10; }
W="$CACHE/deploy"; rm -rf "$W"; mkdir -p "$W"
cp -a "$APP/out/site/." "$W/"
cd "$W"
git init -q -b "$BRANCH"
git -c user.name="$GIT_NAME" -c user.email="$GIT_EMAIL" add -A
git -c user.name="$GIT_NAME" -c user.email="$GIT_EMAIL" commit -q -m "build $(cat version.txt)"
"${G[@]}" push -q -f "$URL" "$BRANCH:$BRANCH"
echo "$NEW" > "$CACHE/published.sha256"
echo "published $(cat version.txt) to $REPO -> $(cd "$KB" && python3 "$APP/life_config.py" get site.url)"
