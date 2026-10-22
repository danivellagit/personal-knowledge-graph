#!/bin/bash
# Keep this repo in sync without thinking about it: pull when a session starts, and at the end of
# every turn commit whatever was left uncommitted and push it.
#   git-sync.sh pull   -> SessionStart: bring the repo up to date before any work
#   git-sync.sh push   -> Stop: commit what the turn left uncommitted, rebase, push
# A safety net: sessions and routines still commit their own work with a real message; this
# catches what they left behind so nothing stays only on one machine.
#
# It never forces anything:
#   - it does nothing at all unless the current branch tracks a remote branch (or `origin` exists)
#   - `git add -A` respects .gitignore, so with the template's default (data/ ignored) your
#     private graph is never committed; un-ignore data/ only if the remote is private
#   - .obsidian/ churn is left out of autosaves
#   - turn it off with `git_sync: off` in config.local.yml, or GIT_SYNC=off in the environment
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
case "$(echo "${GIT_SYNC:-on}" | tr 'A-Z' 'a-z')" in off|false|no|0) exit 0;; esac
if [ -f config.local.yml ] && [ -f tools/config.py ]; then
  case "$(python3 tools/config.py get git_sync on 2>/dev/null | tr 'A-Z' 'a-z')" in off|false|no) exit 0;; esac
fi
git rev-parse --git-dir >/dev/null 2>&1 || exit 0
GITDIR=$(git rev-parse --git-dir)
[ -e "$GITDIR/index.lock" ] && exit 0                       # another git operation is running
{ [ -d "$GITDIR/rebase-merge" ] || [ -d "$GITDIR/rebase-apply" ]; } && exit 0

BRANCH=$(git symbolic-ref --quiet --short HEAD) || exit 0  # detached HEAD: leave it alone
UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)
if [ -n "$UPSTREAM" ]; then
  REMOTE=${UPSTREAM%%/*}
  RBRANCH=${UPSTREAM#*/}
elif git remote | grep -qx origin; then
  REMOTE=origin
  RBRANCH=$BRANCH
else
  exit 0                                                   # no remote: nothing to sync with
fi

case "$1" in
  pull)
    git pull --rebase --autostash -q "$REMOTE" "$RBRANCH" 2>&1 | tail -2 || true
    ;;
  push)
    if [ -n "$(git status --porcelain -- . ':!.obsidian')" ]; then
      git add -A -- . ':!.obsidian'
      git commit -q -m "autosave: $(date '+%Y-%m-%d %H:%M') — work left uncommitted by a session" || true
    fi
    git fetch -q "$REMOTE" 2>/dev/null
    if git rev-parse -q --verify "$REMOTE/$RBRANCH" >/dev/null; then
      AHEAD=$(git log --oneline "$REMOTE/$RBRANCH..HEAD")
    else
      AHEAD=$(git log --oneline -1 HEAD)                     # remote branch not created yet
    fi
    if [ -n "$AHEAD" ]; then
      if git rev-parse -q --verify "$REMOTE/$RBRANCH" >/dev/null && \
         ! git pull --rebase --autostash -q "$REMOTE" "$RBRANCH" >/dev/null 2>&1; then
        git rebase --abort >/dev/null 2>&1
        echo "git-sync: pull --rebase hit a conflict; nothing pushed. Resolve it in the next turn." >&2
        exit 0
      fi
      git push -q "$REMOTE" "HEAD:$RBRANCH" 2>&1 | tail -2 || true
    fi
    ;;
esac
exit 0
