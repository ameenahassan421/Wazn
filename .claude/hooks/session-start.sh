#!/bin/bash
# Two jobs, in this order:
#   1. Print the project's REAL state, computed from git every time. Runs
#      everywhere, local and web. This exists because WAZN_PLAN.md section 7.0
#      is declared the source of truth and four consecutive merged PRs left it
#      untouched. A session that recites section 7.0 recites a stale file. The
#      banner below cannot go stale: it is derived, not written down.
#   2. Install dependencies. Claude Code on the web only.
#
# Never exits non-zero: a broken banner must not stop a session from starting.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" 2>/dev/null || exit 0

if [ -d .git ]; then
  git fetch --quiet --prune origin 2>/dev/null

  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  head=$(git rev-parse --short HEAD 2>/dev/null)
  behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo '?')
  ahead=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo '?')
  dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')

  # The number that matters. If this is not 0, section 7.0 is lying to you.
  plan_sha=$(git log -1 --format=%H -- WAZN_PLAN.md 2>/dev/null)
  plan_date=$(git log -1 --format=%ad --date=short -- WAZN_PLAN.md 2>/dev/null)
  plan_stale=$(git rev-list --count "${plan_sha}"..origin/main 2>/dev/null || echo '?')

  unmerged=''
  for b in $(git branch -r --format='%(refname:short)' 2>/dev/null | grep -v 'origin/HEAD' | grep -v 'origin/main'); do
    n=$(git rev-list --count origin/main.."$b" 2>/dev/null || echo 0)
    [ "$n" != "0" ] && unmerged="${unmerged}${b}(+${n}) "
  done
  stale_branches=$(git branch -r --format='%(refname:short)' 2>/dev/null | grep -v 'origin/HEAD' | grep -v 'origin/main' | wc -l | tr -d ' ')

  echo "=== WAZN STATE (computed from git, never recited) ==="
  echo "branch ${branch} @ ${head} | ${ahead} ahead, ${behind} behind origin/main | ${dirty} uncommitted"
  if [ "${behind}" != "0" ]; then
    echo "!! You are BEHIND origin/main. Fast-forward before reading any doc or building anything."
  fi
  echo "WAZN_PLAN.md last edited ${plan_date}; ${plan_stale} commit(s) have landed on main since."
  if [ "${plan_stale}" != "0" ] && [ "${plan_stale}" != "?" ]; then
    echo "!! SECTION 7.0 IS STALE by ${plan_stale} commits. Do not trust it as current state."
    echo "   Reconcile it against the code and the database BEFORE building, per WAZN_PLAN.md section 6."
    git log --oneline "${plan_sha}"..origin/main 2>/dev/null | head -12 | sed 's/^/   /'
  fi
  echo "remote branches: ${stale_branches} total"
  if [ -n "${unmerged}" ]; then
    echo "unmerged work sits on: ${unmerged}"
  else
    echo "unmerged work: none, every remote branch is contained in main"
  fi

  if command -v gh >/dev/null 2>&1; then
    open_prs=$(gh pr list --state open --limit 30 --json number,title,headRefName \
      --jq '.[] | "  #\(.number) \(.headRefName): \(.title)"' 2>/dev/null)
    if [ -n "${open_prs}" ]; then
      echo "OPEN PRs (another session may be mid-flight, do not duplicate its work):"
      echo "${open_prs}"
    else
      echo "open PRs: none"
    fi
  fi
  echo "=== end state ==="
fi

# ---------------------------------------------------------------------------
# Dependency install. Web only; local machines manage their own node_modules.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# npm install rather than npm ci: the container image is cached after this
# hook completes, and install reuses whatever is already there.
npm install --no-audit --no-fund

# Playwright is not a project dependency. It is installed ad hoc for the
# occasional browser pass over the three screens, and npm install prunes it
# again. Chromium is preinstalled in the image, so never re-download it.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo 'export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1'
    echo 'export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers'
  } >> "$CLAUDE_ENV_FILE"
fi

echo "Dependencies ready: $(node -v), npm $(npm -v)"
