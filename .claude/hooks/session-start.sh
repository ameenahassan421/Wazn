#!/bin/bash
# Installs dependencies so lint, tests and builds work the moment a session
# starts. Runs on Claude Code on the web only; local machines manage their own
# node_modules.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# npm install rather than npm ci: the container image is cached after this
# hook completes, and install reuses whatever is already there.
npm install --no-audit --no-fund

# Playwright is not a project dependency — it is installed ad hoc for the
# occasional browser pass over the three screens, and npm install prunes it
# again. Chromium is preinstalled in the image, so never re-download it.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo 'export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1'
    echo 'export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers'
  } >> "$CLAUDE_ENV_FILE"
fi

echo "Dependencies ready: $(node -v), npm $(npm -v)"
