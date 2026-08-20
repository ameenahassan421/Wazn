#!/bin/bash
# Stop hook. Refuses to let a session end having COMMITTED code changes without
# reconciling WAZN_PLAN.md section 7.0.
#
# Why this exists: section 7.0 is declared the single source of truth and
# WAZN_PLAN.md section 6 says to update it at the end of every session. PRs
# #103, #104, #105 and #106 all merged code to main and none of them touched
# it. By 2026-08-19 the authoritative state block was nine commits stale and
# still said "rest canvas takeover DECIDED, not built" after the takeover had
# shipped. A rule nothing enforces is a rule that gets skipped.
#
# Blocks only when work is COMMITTED. Scratch edits get a reminder, not a wall.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" 2>/dev/null || exit 0
[ -d .git ] || exit 0

# Claude Code re-runs Stop hooks after a block. Never loop.
payload=$(cat 2>/dev/null || echo '{}')
if printf '%s' "$payload" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

ahead=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)

changed=$( { git diff --name-only HEAD 2>/dev/null
             git diff --name-only --cached 2>/dev/null
             [ "$ahead" != "0" ] && git diff --name-only origin/main..HEAD 2>/dev/null
           } | sort -u )

[ -n "$changed" ] || exit 0

# Same trigger set as the plan-state CI job, .md exclusion included: a README
# under mobile/ changes no state a future session needs. The two rules must
# stay identical or a PR passes one and fails the other.
code=$(printf '%s\n' "$changed" | grep -E '^(src/|mobile/|supabase/migrations/|supabase/functions/)' | grep -v '\.md$' | head -8)
[ -n "$code" ] || exit 0

printf '%s\n' "$changed" | grep -qx 'WAZN_PLAN.md' && exit 0

if [ "$ahead" != "0" ]; then
  {
    echo "STOP BLOCKED: ${ahead} commit(s) ahead of origin/main changed code, and WAZN_PLAN.md was never touched."
    echo ""
    echo "Code changed:"
    printf '%s\n' "$code" | sed 's/^/  /'
    echo ""
    echo "WAZN_PLAN.md section 6 requires section 7.0 to be updated with what is now true, and date-stamped,"
    echo "before a session ends. Four consecutive merged PRs skipped this and left the source of truth lying."
    echo ""
    echo "Do one of these, then stop again:"
    echo "  1. Update section 7.0 to reflect what this session actually changed, and date-stamp it."
    echo "  2. If this session genuinely changed no state a future session needs, add one line to section 7.1"
    echo "     saying so, and commit that."
    echo "Also append the reasoning to DECISIONS.md if a choice was made."
  } >&2
  exit 2
fi

echo "Reminder: uncommitted code changes are present and WAZN_PLAN.md section 7.0 is untouched. Update it before you commit."
exit 0
