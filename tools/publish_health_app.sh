#!/usr/bin/env bash
# Build, encrypt and publish the health PWA (tools/health-app/): an installable, password-locked
# copy of a React health page, served as ciphertext only from a GitHub Pages repo.
#
#   tools/publish_health_app.sh                # build the configured page, publish if it changed
#   tools/publish_health_app.sh --data FILE    # replace the page's DATA block with FILE first
#   tools/publish_health_app.sh --fill         # build the DATA block from the body layer + food log
#   tools/publish_health_app.sh --source FILE  # build this page instead of health_app.source
#   tools/publish_health_app.sh --no-push      # build only (into health_app.out_dir), never push
#   tools/publish_health_app.sh --force        # publish even if nothing changed
#   tools/publish_health_app.sh --out DIR      # build into DIR (implies nothing about pushing)
#
# Configuration: the `health_app:` block of config.local.yml, every key overridable by its env var
# (see config.example.yml and tools/health-app/README.md). The password is read from a file at run
# time, never printed, never committed. OPTIONAL module: switched off or unconfigured, this says
# what to set and exits 0. Exit codes: 3 no page source / nothing to fill, 4 password or salt
# problem, 10 the Pages repo is missing or not pushable (see the README's one-time setup).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/tools/health-app"
cfg() { python3 "$ROOT/tools/config.py" get "$1" "${2:-}"; }
# pick ENV_VAR config.key [default]: the env var wins, then config.local.yml, then the default
pick() { local v="${!1:-}"; [ -n "$v" ] || v="$(cfg "$2")"; [ -n "$v" ] || v="${3:-}"; case "$v" in "~"*) v="$HOME${v:1}";; esac; printf '%s' "$v"; }
inside_repo() { python3 -c 'import os,sys; r=os.path.realpath(sys.argv[1]); p=os.path.realpath(os.path.abspath(sys.argv[2])); sys.exit(0 if p == r or p.startswith(r + os.sep) else 1)' "$ROOT" "$1"; }

SOURCE_FLAG="" DATA_FLAG="" OUT_FLAG="" FORCE=0 PUSH=1 FILL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --source) SOURCE_FLAG="$2"; shift 2;;
    --data) DATA_FLAG="$2"; shift 2;;
    --out) OUT_FLAG="$2"; shift 2;;
    --fill) FILL=1; shift;;
    --force) FORCE=1; shift;;
    --no-push) PUSH=0; shift;;
    -h|--help) sed -n 2,17p "$0"; exit 0;;
    *) echo "unknown option $1" >&2; exit 2;;
  esac
done

case "$(pick HEALTH_APP_ENABLED health_app.enabled | tr 'A-Z' 'a-z')" in
  false|no|off|0) echo "Health app module is switched off (health_app.enabled: false) — nothing to do."; exit 0;;
esac

PWFILE="$(pick HEALTH_APP_PASSWORD_FILE health_app.password_file)"
if [ -z "$PWFILE" ] || [ ! -s "$PWFILE" ]; then
  echo "Health app module not configured — nothing to do."
  echo "  set \`health_app.password_file\` in config.local.yml or the env var HEALTH_APP_PASSWORD_FILE,"
  echo "  pointing to a file OUTSIDE the repo that holds the app password on one line, e.g.:"
  echo "    mkdir -p ~/.secrets && (umask 077; read -rs -p 'password: ' p && printf '%s\n' \"\$p\" > ~/.secrets/health-app-password)"
  echo "  to publish, also set \`health_app.repo\` (HEALTH_APP_REPO), e.g. your-user/health-app."
  echo "  (optional module: the rest of the graph works without it; see tools/health-app/README.md)"
  exit 0
fi
inside_repo "$PWFILE" && { echo "health_app.password_file must be outside the repo: $PWFILE" >&2; exit 4; }

CACHE="$(pick HEALTH_APP_CACHE health_app.cache_dir "$HOME/.cache/health-app")"
inside_repo "$CACHE" && { echo "health_app.cache_dir must be outside the repo (it keeps a plaintext copy of the page): $CACHE" >&2; exit 2; }
mkdir -p "$CACHE"; chmod 700 "$CACHE"
OUT="${OUT_FLAG:-$(pick HEALTH_APP_OUT health_app.out_dir "$APP/out/site")}"
SALT="$(pick HEALTH_APP_SALT_FILE health_app.salt_file "$CACHE/salt.txt")"
REPO="$(pick HEALTH_APP_REPO health_app.repo)"
BRANCH="$(pick HEALTH_APP_BRANCH health_app.branch main)"
URL="$(pick HEALTH_APP_REMOTE_URL health_app.remote_url)"
[ -z "$URL" ] && [ -n "$REPO" ] && URL="https://github.com/$REPO.git"
if [ "$PUSH" = 1 ] && [ -z "$URL" ]; then
  echo "note: health_app.repo (HEALTH_APP_REPO) is not set: building only, nothing will be published."
  PUSH=0
fi

# git with an optional token (from a file, never printed), else the machine's own git credentials
TOKFILE="$(pick HEALTH_APP_TOKEN_FILE health_app.token_file)"
if [ -n "$TOKFILE" ] && [ -r "$TOKFILE" ]; then export HEALTH_APP_GH_TOKEN="$(tr -d '\r\n' < "$TOKFILE")"; fi
if [ -n "${HEALTH_APP_GH_TOKEN:-}" ]; then
  G=(git -c credential.helper= -c "credential.helper=!f(){ echo username=x-access-token; echo password=\$HEALTH_APP_GH_TOKEN; }; f")
else
  G=(git)
fi

# 1. the page: --source > config > the last good copy in the cache > the shipped example
SOURCE="${SOURCE_FLAG:-$(pick HEALTH_APP_SOURCE health_app.source)}"
if [ -z "$SOURCE" ]; then SOURCE="$APP/example-page.tsx"
elif [ ! -r "$SOURCE" ] && [ -s "$CACHE/page.tsx" ]; then
  echo "warn: $SOURCE not readable, using the last good copy $CACHE/page.tsx" >&2; SOURCE="$CACHE/page.tsx"
fi
[ -r "$SOURCE" ] || { echo "ERROR: page source $SOURCE not readable (and no cached copy)" >&2; exit 3; }
grep -q "DATA:START" "$SOURCE" || { echo "ERROR: $SOURCE has no DATA block (// ==== DATA:START ... // ==== DATA:END ====)" >&2; exit 3; }

# 2. the DATA block: --data > --fill / health_app.fill_from_body > health_app.data_file > the page's own
DATA="${DATA_FLAG:-}"
case "$(pick HEALTH_APP_FILL health_app.fill_from_body | tr 'A-Z' 'a-z')" in true|yes|on|1) FILL="${FILL:-1}";; esac
if [ -z "$DATA" ] && [ -n "$FILL" ]; then
  (umask 077; python3 "$APP/fill_data.py" --out "$CACHE/data-block.ts") || { echo "ERROR: could not fill the DATA block (see above); nothing published" >&2; exit 3; }
  DATA="$CACHE/data-block.ts"
fi
[ -z "$DATA" ] && DATA="$(pick HEALTH_APP_DATA health_app.data_file)"

# 3. the salt is fixed per instance. On a new machine, take it back from the published site (it is
#    public there anyway), so keys remembered on the phone keep working.
if [ ! -s "$SALT" ] && [ "$PUSH" = 1 ]; then
  T="$(mktemp -d)"
  if git -C "$T" init -q && "${G[@]}" -C "$T" fetch -q --depth 1 "$URL" "$BRANCH" 2>/dev/null; then
    if git -C "$T" show FETCH_HEAD:index.html 2>/dev/null | python3 -c 'import sys,re,json; m=re.search(r"var P = (\{.*?\});", sys.stdin.read()); print(json.loads(m.group(1))["s"])' > "$T/salt" 2>/dev/null && [ -s "$T/salt" ]; then
      mkdir -p "$(dirname "$SALT")"; (umask 077; cp "$T/salt" "$SALT"); echo "salt recovered from the published site into $SALT"
    fi
  fi
  rm -rf "$T"
fi

# 4. build + encrypt
command -v node >/dev/null || { echo "ERROR: node is required (https://nodejs.org)" >&2; exit 1; }
if [ ! -d "$APP/node_modules/esbuild" ] || [ ! -d "$APP/node_modules/react-dom" ]; then
  (cd "$APP" && { npm ci --omit=dev --silent --no-audit --no-fund >/dev/null 2>&1 || npm install --omit=dev --silent --no-audit --no-fund >/dev/null; })
fi
export HEALTH_APP_NAME="$(pick HEALTH_APP_NAME health_app.name Health)"
export HEALTH_APP_DESCRIPTION="$(pick HEALTH_APP_DESCRIPTION health_app.description)"
export HEALTH_APP_LANG="$(pick HEALTH_APP_LANG health_app.lang)"
export HEALTH_APP_THEME_COLOR="$(pick HEALTH_APP_THEME_COLOR health_app.theme_color)"
export HEALTH_APP_ACCENT="$(pick HEALTH_APP_ACCENT health_app.accent)"
for k in password remember unlock wrong no_crypto; do
  K="HEALTH_APP_UI_$(echo "$k" | tr 'a-z' 'A-Z')"; export "$K=$(pick "$K" "health_app.ui.$k")"
done
AVATAR="$(pick HEALTH_APP_AVATAR health_app.avatar)"
ARGS=(--source "$SOURCE" --out "$OUT" --password-file "$PWFILE" --salt-file "$SALT")
[ -n "$DATA" ] && ARGS+=(--data "$DATA")
[ -n "$AVATAR" ] && ARGS+=(--avatar "$AVATAR")
RES="$(cd "$APP" && node build.mjs "${ARGS[@]}")"
echo "$RES"
NEW="$(printf '%s' "$RES" | python3 -c 'import sys,json; print(json.loads(sys.stdin.read().strip().splitlines()[-1])["plainHash"])')"
[ "$SOURCE" = "$CACHE/page.tsx" ] || (umask 077; cp "$SOURCE" "$CACHE/page.tsx")

[ "$PUSH" = 1 ] || { echo "built (not pushed): $OUT"; exit 0; }
STAMP="$CACHE/published-$(python3 -c 'import hashlib,sys; print(hashlib.sha256(sys.argv[1].encode()).hexdigest()[:12])' "$URL#$BRANCH").sha256"
if [ "$FORCE" = 0 ] && [ -f "$STAMP" ] && [ "$(cat "$STAMP")" = "$NEW" ]; then
  echo "no changes since the last publish, nothing pushed"; exit 0
fi

# 5. push: one orphan commit, force-pushed (ciphertext only; the deploy repo never grows a history)
if ! "${G[@]}" ls-remote "$URL" >/dev/null 2>&1; then
  echo "ERROR: cannot reach $URL (repo missing, or no push access). One-time setup: tools/health-app/README.md" >&2; exit 10
fi
GN="$(pick HEALTH_APP_GIT_NAME health_app.git_name health-app)"
GE="$(pick HEALTH_APP_GIT_EMAIL health_app.git_email health-app@users.noreply.github.com)"
W="$CACHE/deploy"; rm -rf "$W"; mkdir -p "$W"
cp -a "$OUT/." "$W/"
(
  cd "$W"
  git init -q
  git checkout -q -b deploy
  git -c user.name="$GN" -c user.email="$GE" add -A
  git -c user.name="$GN" -c user.email="$GE" commit -q -m "build $(cat version.txt)"
  "${G[@]}" push -q -f "$URL" "deploy:$BRANCH"
)
echo "$NEW" > "$STAMP"
if [ -n "$REPO" ]; then
  O="${REPO%%/*}" N="${REPO#*/}"
  [ "$N" = "$O.github.io" ] && PAGES="https://$O.github.io/" || PAGES="https://$O.github.io/$N/"
  echo "published $(cat "$OUT/version.txt") to $REPO ($PAGES)"
else
  echo "published $(cat "$OUT/version.txt") to $URL ($BRANCH)"
fi
