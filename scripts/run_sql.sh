#!/usr/bin/env bash
#
# Run a .sql file against the project database.
#
# WHY THIS EXISTS
#   `supabase/tests/rls_social.sql` has told people to run
#
#       ./scripts/run_sql.sh supabase/tests/rls_social.sql
#
#   since the day it was written, and this file did not exist. So both
#   security suites were paste-into-the-dashboard rituals — and `LAUNCH.md`
#   gates sending invites on one of them. A test whose runner is missing is a
#   test that gets skipped on the day it is inconvenient.
#
# USAGE
#   export DATABASE_URL='postgresql://postgres.<ref>:<password>@<host>:6543/postgres'
#   ./scripts/run_sql.sh supabase/tests/rls_social.sql
#
#   Supabase dashboard → Project Settings → Database → Connection string.
#   Use the **session** pooler or the direct connection, not the transaction
#   pooler: both suites wrap everything in a single transaction and end in
#   ROLLBACK, and the transaction pooler does not guarantee one session for
#   the whole file.
#
#   The URL contains a password. Keep it in your shell, not in the repo —
#   .env is gitignored if you would rather put it there and `source` it.
#
# WHAT IT GUARANTEES
#   ON_ERROR_STOP=1. Without it psql prints the error, carries on to the next
#   statement, and exits 0 — so a suite whose first assertion raised would
#   report success. Every assertion in those files is a `raise exception`, so
#   that flag is the entire difference between a test and a transcript.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <file.sql>" >&2
  echo "example: $0 supabase/tests/rls_social.sql" >&2
  exit 2
fi

FILE="$1"

if [ ! -f "$FILE" ]; then
  echo "no such file: $FILE" >&2
  exit 2
fi

if [ -z "${DATABASE_URL:-}" ]; then
  cat >&2 <<'EOF'
DATABASE_URL is not set.

  export DATABASE_URL='postgresql://postgres.<ref>:<password>@<host>:6543/postgres'

Supabase dashboard -> Project Settings -> Database -> Connection string.
Use the session pooler or the direct connection, not the transaction pooler.
EOF
  exit 2
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is not installed. On Debian/Ubuntu: apt-get install postgresql-client" >&2
  exit 2
fi

echo "running $FILE"
psql "$DATABASE_URL" \
  --set ON_ERROR_STOP=1 \
  --no-psqlrc \
  --quiet \
  --file "$FILE"
