#!/usr/bin/env bash
# Per-agent git worktrees for the box: one checkout per agent, so no agent's leftovers ever block
# another agent's pull. Every worktree shares the same .git (objects, refs, config, hooks).
#
#   tools/wt.sh new    <agent>                    # a NEW agent: worktree + agents/<agent>/ from
#                                                 #   agents/_template + data/agents/<agent>/memory.md
#   tools/wt.sh init   <agent>                    # idempotent: create/repair /workspace/wt/<agent>
#   tools/wt.sh sync   <agent>                    # start of turn: fetch + rebase onto origin/main
#   tools/wt.sh sync   <agent> "message" PATH...  # end of turn: add ONLY these paths, commit,
#                                                 #   rebase onto origin/main, push HEAD:main
#   tools/wt.sh path   <agent>                    # print the worktree path (cd "$(tools/wt.sh path x)")
#   tools/wt.sh status                            # one line per worktree
#   tools/wt.sh doctor [--hours N] [--quiet]      # self-maintenance, exit 1 if something needs a human
#
# Layout: worktree $WT_ROOT/<agent> (default: the directory next to the main checkout, i.e.
# /workspace/wt on the box; override with DK_WT_ROOT), branch wt/<agent>, upstream origin/main.
# `main` stays checked out only in the main checkout (the original clone), which is
# fast-forwarded after every push, never rebased, so other agents' dirty files there are untouched.
#
# Never: git add -A, stash of other files, reset --hard, force-push. Pushes are plain
# `git push origin HEAD:main`, retried 5 times; a rebase conflict aborts the rebase and exits 1.
set -u

die() { echo "wt: ERROR $*" >&2; exit 1; }

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON="$(cd "$SELF_DIR" && git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" \
  || die "not inside the knowledge repo"
MAIN="$(dirname "$COMMON")"                       # the main checkout (owner of .git)
WT_ROOT="${DK_WT_ROOT:-$(dirname "$MAIN")/wt}"
G() { git -C "$MAIN" "$@"; }

agents() {   # every agent folder in the main checkout (folders starting with _ are templates)
  local d
  for d in "$MAIN"/agents/*/; do
    d="$(basename "$d")"
    case "$d" in _*) continue ;; esac
    echo "$d"
  done
}

check_agent() {
  [ -n "${1:-}" ] || die "missing <agent> (one of: $(agents | tr '\n' ' '))"
  case "$1" in *[!a-z0-9-]*) die "bad agent name: $1" ;; esac
  [ -d "$MAIN/agents/$1" ] || [ -d "$WT_ROOT/$1/agents/$1" ] \
    || die "no agents/$1/ folder. New agent? Follow agents/README.md, 'New agent onboarding'."
}

fetch() {
  local i
  for i in 1 2 3; do
    G fetch --quiet origin main && return 0
    sleep $((2 + RANDOM % 4))
  done
  echo "wt: fetch failed" >&2; return 1
}

# ignored things the tools need, shared from the main checkout instead of reinstalled per tree
link_local() {
  local wt="$1" rel
  for rel in tools/life-app/node_modules config.local.yml; do
    [ -e "$MAIN/$rel" ] || continue
    [ -e "$wt/$rel" ] || [ -L "$wt/$rel" ] && continue
    mkdir -p "$(dirname "$wt/$rel")"
    ln -s "$(readlink -f "$MAIN/$rel")" "$wt/$rel"
  done
}

ensure_hooks() {
  [ "$(G config --get core.hooksPath)" = ".githooks" ] || G config core.hooksPath .githooks
}

# fast-forward the main checkout to origin/main; never rebase it, never touch its dirty files
ff_main() {
  local gd; gd="$(G rev-parse --absolute-git-dir)"
  if [ -d "$gd/rebase-merge" ] || [ -d "$gd/rebase-apply" ] || [ -e "$gd/index.lock" ] \
     || [ -e "$gd/MERGE_HEAD" ]; then
    echo "wt: main checkout busy (another agent mid-git), not fast-forwarded" >&2; return 0
  fi
  [ "$(G symbolic-ref --short -q HEAD)" = "main" ] || { echo "wt: main checkout not on main, skipped" >&2; return 0; }
  if G merge-base --is-ancestor HEAD origin/main; then
    G merge --ff-only --quiet origin/main 2>/dev/null \
      || echo "wt: main checkout not fast-forwarded (its dirty files overlap incoming changes; git-sync.sh will catch up)" >&2
  else
    echo "wt: main checkout has unpushed commits, left alone (its owner pushes with tools/git-sync.sh)" >&2
  fi
  return 0
}

cmd_new() {
  local a="${1:-}"
  [ -n "$a" ] || die "usage: tools/wt.sh new <agent>"
  case "$a" in *[!a-z0-9-]*|-*|_*) die "bad agent name: $a (lowercase, digits, hyphens)" ;; esac
  local wt="$WT_ROOT/$a"
  NEW_AGENT=1 cmd_init "$a" || return 1
  if [ -e "$wt/agents/$a/AGENT.md" ]; then echo "wt: agents/$a/AGENT.md already exists, nothing copied"; else
    mkdir -p "$wt/agents/$a/routines"
    sed "s/<role>/$a/g" "$wt/agents/_template/AGENT.md" > "$wt/agents/$a/AGENT.md"
    : > "$wt/agents/$a/routines/.gitkeep"
    echo "wt: created agents/$a/AGENT.md from the template (fill it in)"
  fi
  if [ ! -e "$wt/data/agents/$a/memory.md" ]; then
    mkdir -p "$wt/data/agents/$a"
    printf '# %s memory\n\nRelated: [[_me]]\n\n## Agreements\n- (none yet)\n\n## Open\n- (none yet)\n\n## Log\n- %s: created.\n' \
      "$a" "$(date +%F)" > "$wt/data/agents/$a/memory.md"
    echo "wt: created data/agents/$a/memory.md"
  fi
  echo "wt: next: fill agents/$a/AGENT.md, add your row to agents/README.md and your line to AGENTS.md + CLAUDE.md, then"
  echo "    tools/wt.sh sync $a \"$a: onboarding\" agents/$a data/agents/$a agents/README.md AGENTS.md CLAUDE.md"
}

cmd_init() {
  [ "${NEW_AGENT:-0}" = 1 ] || check_agent "${1:-}"
  local a="$1" wt="$WT_ROOT/$1" br="wt/$1"
  ensure_hooks
  G worktree prune
  if [ -e "$wt/.git" ]; then
    [ "$(git -C "$wt" symbolic-ref --short -q HEAD)" = "$br" ] \
      || echo "wt: WARNING $wt is not on $br (on $(git -C "$wt" symbolic-ref --short -q HEAD || echo detached))" >&2
  else
    [ -e "$wt" ] && die "$wt exists but is not a worktree; move it to an archive folder outside the repo first"
    mkdir -p "$WT_ROOT"
    fetch || return 1
    if G show-ref --verify --quiet "refs/heads/$br"; then
      G worktree add --quiet "$wt" "$br" || return 1
    else
      G worktree add --quiet --no-track -b "$br" "$wt" origin/main || return 1
    fi
    echo "wt: created $wt on $br"
  fi
  git -C "$wt" branch --quiet --set-upstream-to=origin/main "$br" 2>/dev/null
  link_local "$wt"
  echo "wt: ready $wt ($(git -C "$wt" rev-parse --short HEAD))"
}

rebase_onto_main() {   # in the worktree; returns 1 on conflict (rebase aborted)
  local wt="$1"
  if ! git -C "$wt" rebase --quiet --autostash origin/main >/dev/null 2>&1; then
    if [ -d "$(git -C "$wt" rev-parse --git-path rebase-merge)" ] || [ -d "$(git -C "$wt" rev-parse --git-path rebase-apply)" ]; then
      git -C "$wt" rebase --abort
    fi
    echo "wt: ERROR rebase conflict with origin/main in $wt; rebase aborted, your commit is still local." >&2
    echo "wt: resolve by hand (git -C $wt rebase origin/main, fix, git rebase --continue), no force-push, no reset." >&2
    return 1
  fi
}

cmd_sync() {
  check_agent "${1:-}"; local a="$1"; shift
  local wt="$WT_ROOT/$a"
  [ -e "$wt/.git" ] || cmd_init "$a" >/dev/null || return 1
  if [ $# -eq 1 ]; then die "usage: tools/wt.sh sync <agent> [\"message\" PATH...]"; fi
  if [ $# -ge 2 ]; then
    local msg="$1"; shift
    ( cd "$wt" && git add -- "$@" ) || return 1
    if ( cd "$wt" && git diff --cached --quiet -- "$@" ); then
      echo "wt: nothing staged in the given paths"
    else
      ( cd "$wt" && git commit --quiet -m "$msg" -- "$@" ) || { echo "wt: commit refused (see the pre-commit output above)" >&2; return 1; }
    fi
  fi
  local i
  for i in 1 2 3 4 5; do
    fetch || { sleep 3; continue; }
    rebase_onto_main "$wt" || return 1
    if [ -z "$(git -C "$wt" rev-list origin/main..HEAD)" ]; then
      ff_main; echo "wt: $a up to date ($(git -C "$wt" rev-parse --short HEAD))"; return 0
    fi
    if git -C "$wt" push --quiet origin HEAD:main; then
      G fetch --quiet origin main 2>/dev/null
      ff_main; echo "wt: $a pushed $(git -C "$wt" rev-parse --short HEAD) to main"; return 0
    fi
    echo "wt: push rejected (attempt $i/5)" >&2
    [ "$i" -lt 5 ] && sleep $((3 + RANDOM % 8))
  done
  echo "wt: ERROR gave up after 5 attempts" >&2; return 1
}

wt_line() {   # agent -> one status line
  local a="$1" wt="$WT_ROOT/$1"
  if [ ! -e "$wt/.git" ]; then printf '%-18s missing\n' "$a"; return; fi
  local br ahead behind dirty
  br="$(git -C "$wt" symbolic-ref --short -q HEAD || echo detached)"
  ahead="$(git -C "$wt" rev-list --count origin/main..HEAD 2>/dev/null)"
  behind="$(git -C "$wt" rev-list --count HEAD..origin/main 2>/dev/null)"
  dirty="$(git -C "$wt" status --porcelain | wc -l)"
  printf '%-18s %-22s ahead %-3s behind %-4s dirty %s\n' "$a" "$br" "$ahead" "$behind" "$dirty"
}

cmd_status() {
  local a
  echo "main checkout $MAIN: $(G symbolic-ref --short -q HEAD) $(G rev-parse --short HEAD), dirty $(G status --porcelain | wc -l), unpushed $(G rev-list --count origin/main..HEAD)"
  for a in $(agents); do wt_line "$a"; done
}

cmd_doctor() {
  local hours=6 quiet=0
  while [ $# -gt 0 ]; do
    case "$1" in --hours) hours="$2"; shift 2 ;; --quiet) quiet=1; shift ;; *) die "doctor: unknown arg $1" ;; esac
  done
  local problems=() a wt n
  G worktree prune --verbose 2>&1 | sed 's/^/wt: pruned: /'
  ensure_hooks
  fetch || problems+=("fetch from origin failed")
  for a in $(agents); do
    wt="$WT_ROOT/$a"
    if [ ! -e "$wt/.git" ]; then
      if cmd_init "$a" >/dev/null 2>&1; then echo "wt: recreated $wt"; else problems+=("$a: worktree missing and could not be created"); continue; fi
    fi
    link_local "$wt"
    local br; br="$(git -C "$wt" symbolic-ref --short -q HEAD || echo detached)"
    [ "$br" = "wt/$a" ] || problems+=("$a: worktree on '$br', expected wt/$a")
    local gp; gp="$(git -C "$wt" rev-parse --absolute-git-dir)"
    if [ -d "$gp/rebase-merge" ] || [ -d "$gp/rebase-apply" ]; then problems+=("$a: rebase in progress"); fi
    local ahead behind
    ahead="$(git -C "$wt" rev-list --count origin/main..HEAD 2>/dev/null || echo ?)"
    behind="$(git -C "$wt" rev-list --count HEAD..origin/main 2>/dev/null || echo ?)"
    if [ "$ahead" != 0 ]; then
      local oldest; oldest="$(git -C "$wt" log --reverse --format=%cr origin/main..HEAD | head -1)"
      problems+=("$a: $ahead commit(s) not on main (oldest $oldest; behind $behind) -> tools/wt.sh sync $a")
    fi
    # uncommitted files older than N hours
    n=0
    while IFS= read -r -d '' line; do
      local p="${line:3}"
      if [ -e "$wt/$p" ] && [ -n "$(find "$wt/$p" -maxdepth 0 -mmin +$((hours * 60)) 2>/dev/null)" ]; then n=$((n + 1)); fi
    done < <(git -C "$wt" status --porcelain -z --untracked-files=all)
    [ "$n" -gt 0 ] && problems+=("$a: $n uncommitted file(s) older than ${hours}h in $wt")
  done
  # stray worktrees / branches nobody owns
  while read -r path; do
    [ "$path" = "$MAIN" ] && continue
    case "$path" in "$WT_ROOT"/*) [ -d "$MAIN/agents/$(basename "$path")" ] || problems+=("worktree $path has no agents/ folder") ;;
      *) problems+=("worktree outside $WT_ROOT: $path") ;; esac
  done < <(G worktree list --porcelain | sed -n 's/^worktree //p')
  # main checkout
  local mdirty munp
  munp="$(G rev-list --count origin/main..main 2>/dev/null || echo ?)"
  [ "$munp" != 0 ] && problems+=("main checkout: $munp unpushed commit(s) -> owner runs tools/git-sync.sh")
  n=0
  while IFS= read -r -d '' line; do
    local p="${line:3}"
    if [ -e "$MAIN/$p" ] && [ -n "$(find "$MAIN/$p" -maxdepth 0 -mmin +$((hours * 60)) 2>/dev/null)" ]; then n=$((n + 1)); fi
  done < <(G status --porcelain -z --untracked-files=all)
  [ "$n" -gt 0 ] && problems+=("main checkout: $n uncommitted file(s) older than ${hours}h")
  ff_main
  # the guards
  [ -x "$MAIN/.githooks/pre-commit" ] || problems+=(".githooks/pre-commit missing or not executable in the main checkout")
  command -v gitleaks >/dev/null 2>&1 || [ -x "$HOME/.local/bin/gitleaks" ] || [ -x /usr/local/bin/gitleaks ] \
    || problems+=("gitleaks not installed (pre-commit falls back to a regex scan)")
  local skips="$COMMON/precommit-skips.log"
  if [ -s "$skips" ]; then
    n="$(awk -v d="$(date -d "-7 days" +%F 2>/dev/null || date -v-7d +%F)" '$1 >= d' "$skips" | wc -l)"
    [ "$n" -gt 0 ] && problems+=("pre-commit skipped $n time(s) in the last 7 days (see $skips)")
  fi
  # agent onboarding: every agents/<dir> has a spec, a README row and a memory file
  for a in $(agents); do
    [ -f "$MAIN/agents/$a/AGENT.md" ] || problems+=("agents/$a: no AGENT.md (copy agents/_template/AGENT.md)")
    grep -q "](${a}/AGENT.md)" "$MAIN/agents/README.md" || problems+=("agents/$a: no row in the agents table of agents/README.md")
    [ -f "$MAIN/data/agents/$a/memory.md" ] || problems+=("agents/$a: no data/agents/$a/memory.md")
    [ -d "$MAIN/agents/$a/routines" ] || problems+=("agents/$a: no routines/ folder")
  done
  # Life App / Salute data (data/happiness): stale area files, canvas <-> JSON drift, old recaps
  if [ -f "$MAIN/tools/happiness.py" ]; then
    while IFS= read -r line; do [ -n "$line" ] && problems+=("happiness: $line"); done \
      < <(cd "$MAIN" && python3 tools/happiness.py check --problems 2>&1)
  fi
  [ "$quiet" = 1 ] || cmd_status
  if [ ${#problems[@]} -eq 0 ]; then echo "wt doctor: OK"; return 0; fi
  echo "wt doctor: ${#problems[@]} problem(s)"
  printf '  - %s\n' "${problems[@]}"
  return 1
}

case "${1:-}" in
  new)    shift; cmd_new "$@" ;;
  init)   shift; cmd_init "$@" ;;
  sync)   shift; cmd_sync "$@" ;;
  path)   shift; check_agent "${1:-}"; echo "$WT_ROOT/$1" ;;
  status) shift; cmd_status ;;
  doctor) shift; cmd_doctor "$@" ;;
  *) sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
