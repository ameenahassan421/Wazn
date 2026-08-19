#!/bin/bash
# PreToolUse(Bash). Snapshots uncommitted work before any git command that can
# destroy it, then ALLOWS the command through. Never blocks.
#
# Why: on 2026-08-19 an audit subagent that had been told in its own prompt not
# to edit anything ran `git checkout -- CLAUDE.md` and destroyed the parent
# session's uncommitted edit. Instructions do not bind subagents. This does.
# Blocking would produce false positives (sometimes you really do want to
# revert); snapshotting has none, and the work stays recoverable either way.
#
# Recovery:
#   git for-each-ref refs/wazn-safety --sort=-creatordate \
#     --format='%(refname) %(creatordate:short)'
#   git show <ref>:<path>                     # look at one file
#   git checkout <ref> -- <path>              # restore one file
#   tar tzf .git/wazn-safety/<stamp>.tgz      # untracked files, git clean only
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" 2>/dev/null || exit 0
[ -d .git ] || exit 0

payload=$(cat 2>/dev/null || echo '{}')
cmd=$(printf '%s' "$payload" | python3 -c "
import json,sys
try: print(json.load(sys.stdin).get('tool_input',{}).get('command',''))
except Exception: print('')
" 2>/dev/null)
[ -n "$cmd" ] || exit 0

# Commands that discard tracked working-tree changes, plus git clean, which is
# the only one that also destroys untracked files.
printf '%s' "$cmd" | grep -Eq \
  'git[[:space:]]+(checkout[[:space:]]+(--|\.|HEAD)|restore([[:space:]]+--staged)?[[:space:]]|reset[[:space:]]+--hard|clean[[:space:]]+-|stash[[:space:]]+(push|save|drop|clear))' \
  || exit 0

[ -n "$(git status --porcelain 2>/dev/null)" ] || exit 0

stamp=$(date +%Y%m%d-%H%M%S)
snap=$(git stash create 2>/dev/null)
if [ -n "$snap" ]; then
  git update-ref "refs/wazn-safety/${stamp}" "$snap" 2>/dev/null
  echo "git-safety: tracked changes snapshotted to refs/wazn-safety/${stamp} before running: ${cmd}"
  echo "git-safety: restore one file with  git checkout refs/wazn-safety/${stamp} -- <path>"
fi

# git clean is the only matched command that destroys untracked files, and
# git stash create does not carry them.
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+clean[[:space:]]+-'; then
  untracked=$(git ls-files --others --exclude-standard 2>/dev/null)
  if [ -n "$untracked" ]; then
    mkdir -p .git/wazn-safety
    printf '%s\n' "$untracked" | tar czf ".git/wazn-safety/${stamp}.tgz" -T - 2>/dev/null \
      && echo "git-safety: untracked files archived to .git/wazn-safety/${stamp}.tgz"
  fi
fi

# Keep the 20 newest snapshots so the refs cannot pin objects forever.
git for-each-ref refs/wazn-safety --sort=-creatordate --format='%(refname)' 2>/dev/null \
  | tail -n +21 | while read -r old; do git update-ref -d "$old" 2>/dev/null; done

exit 0
