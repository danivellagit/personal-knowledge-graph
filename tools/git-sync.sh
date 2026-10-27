#!/usr/bin/env bash
# Safe git sync for the SHARED working tree (several agents work in this checkout at once).
#
# When several agents share one machine, each gets its own worktree: use tools/wt.sh (AGENTS.md,
# "Worktrees"). This script stays for the transition and for the main checkout; run inside a worktree
# (branch wt/<agent>) it hands over to `tools/wt.sh sync <agent>` with the same arguments.
#
#   tools/git-sync.sh                          # start of turn: pull --rebase --autostash only
#   tools/git-sync.sh "commit message" PATH... # end of turn: add ONLY these paths, commit, pull, push
#
# Never: git add -A, stash of other files, reset, force-push. On a rebase conflict it aborts the
# rebase, prints an error and exits 1, leaving your commit local for a human or a retry.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1

case "$(git symbolic-ref --short -q HEAD)" in
  wt/*) br="$(git symbolic-ref --short -q HEAD)"; exec tools/wt.sh sync "${br#wt/}" "$@" ;;
esac

sync_push() {
  local push="$1" i
  for i in 1 2 3 4 5; do
    if git pull --rebase --autostash --quiet; then
      if [ "$push" = 0 ]; then echo "git-sync: up to date ($(git rev-parse --short HEAD))"; return 0; fi
      if git push --quiet; then echo "git-sync: pushed $(git rev-parse --short HEAD)"; return 0; fi
      echo "git-sync: push rejected (attempt $i/5)" >&2
    else
      if [ -d "$(git rev-parse --git-path rebase-merge)" ] || [ -d "$(git rev-parse --git-path rebase-apply)" ]; then
        git rebase --abort
        echo "git-sync: ERROR rebase conflict with origin; rebase aborted, your commit is still local." >&2
        echo "git-sync: resolve by hand (no force-push, no reset), then rerun." >&2
        return 1
      fi
      echo "git-sync: pull failed (attempt $i/5)" >&2
    fi
    [ "$i" -lt 5 ] && sleep $((5 + RANDOM % 11))
  done
  echo "git-sync: ERROR gave up after 5 attempts" >&2
  return 1
}

if [ $# -eq 0 ]; then
  sync_push 0; exit $?
fi
if [ $# -lt 2 ]; then
  echo "usage: tools/git-sync.sh [\"commit message\" PATH...]" >&2; exit 2
fi
msg="$1"; shift
git add -- "$@" || exit 1
if git diff --cached --quiet -- "$@"; then
  echo "git-sync: nothing staged in the given paths"
else
  git commit --quiet -m "$msg" -- "$@" || { echo "git-sync: commit refused (pre-commit output above)" >&2; exit 1; }
fi
if [ -n "$(git log '@{u}..' --oneline 2>/dev/null)" ]; then
  sync_push 1; exit $?
fi
sync_push 0
