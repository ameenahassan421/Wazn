#!/usr/bin/env bash
#
# Execute every migration from an empty database, then run the SQL test suites.
#
# WHY THIS EXISTS
#   `npm run check:migrations` parses every migration with Postgres's own
#   grammar. That is the floor, and it is not enough: 0021 shipped a
#   `default (select auth.uid())` that parsed perfectly and that a real server
#   rejects outright, because a column default may not contain a subquery. It
#   also shipped `order by x.sets_7d` against a subquery that had aliased the
#   column to `sets`. Neither is visible to a parser, and neither survived the
#   first execution.
#
#   STATUS has said for weeks that "a migration that has never been executed is
#   unverified". This is the thing that executes them. It needs no Supabase
#   project, no network and no credentials — a local Postgres binary is enough,
#   which is exactly why it can run in CI and in a sandboxed session.
#
# WHAT IT DOES NOT PROVE
#   That production will accept them. Production is at 0018 with a ledger that
#   only knows about three migrations (see STATUS), so "applies cleanly from
#   empty" and "applies cleanly to production" are different claims. This makes
#   the first one true; only Ameen applying them makes the second one true.
#
#   It also does not test RLS between two people — `supabase/tests/rls_*.sql`
#   do that against real accounts, because real accounts are the honest fixture
#   for a visibility question.
#
# USAGE
#   ./scripts/check_sql.sh            # or: npm run check:sql
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${PGPORT_TEST:-55432}"
SOCKET_DIR="${TMPDIR:-/tmp}"
DATA_DIR="$(mktemp -d)"
PG_BIN=""

for candidate in /usr/lib/postgresql/*/bin /usr/local/pgsql/bin /opt/homebrew/opt/postgresql*/bin; do
  if [ -x "$candidate/initdb" ]; then PG_BIN="$candidate"; fi
done
if [ -z "$PG_BIN" ] && command -v initdb >/dev/null 2>&1; then
  PG_BIN="$(dirname "$(command -v initdb)")"
fi

if [ -z "$PG_BIN" ]; then
  echo "no local Postgres found (need initdb + pg_ctl)." >&2
  echo "On Debian/Ubuntu: apt-get install postgresql" >&2
  exit 2
fi

export PATH="$PG_BIN:$PATH"

# initdb refuses to run as root, and a sandboxed session usually is root. Drop
# to the `postgres` system user when there is one; otherwise run as ourselves.
RUN_AS=""
if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
  RUN_AS="postgres"
  chown -R postgres "$DATA_DIR"
fi

as_pg() {
  if [ -n "$RUN_AS" ]; then
    su "$RUN_AS" -c "PATH='$PG_BIN:\$PATH' $*"
  else
    sh -c "$*"
  fi
}

cleanup() {
  as_pg "pg_ctl -D '$DATA_DIR' -m immediate stop" >/dev/null 2>&1 || true
  rm -rf "$DATA_DIR"
}
trap cleanup EXIT

echo "starting a throwaway cluster on port $PORT"
as_pg "initdb -D '$DATA_DIR' -U postgres --auth=trust" >/dev/null
# `listen_addresses=` empty means unix socket only: nothing this script starts
# is reachable over the network, even for a moment.
as_pg "pg_ctl -D '$DATA_DIR' -o '-k $SOCKET_DIR -p $PORT -c listen_addresses=' -l '$DATA_DIR/log' -w start" >/dev/null

PSQL="psql -h $SOCKET_DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 --no-psqlrc --quiet"

$PSQL -d postgres -c "create database wazn_check;" >/dev/null
$PSQL -d wazn_check -f scripts/pg_shim.sql >/dev/null
echo "ok    scripts/pg_shim.sql (auth schema, platform roles, default privileges)"

for file in supabase/migrations/*.sql; do
  if $PSQL -d wazn_check -f "$file" >/dev/null 2>"$DATA_DIR/err"; then
    echo "ok    $(basename "$file")"
  else
    echo "FAIL  $(basename "$file")" >&2
    grep -v '^psql.*NOTICE' "$DATA_DIR/err" >&2 || true
    exit 1
  fi
done

echo
for file in supabase/tests/coach_surfaces.sql supabase/tests/rls_own_rows.sql; do
  echo "running $file"
  # Run ONCE, and read the exit code rather than the output. Every assertion in
  # the suite is a `raise exception`, and ON_ERROR_STOP is the entire
  # difference between a test and a transcript — the same point
  # `scripts/run_sql.sh` makes. NOTICEs are shown either way, because the
  # suite's own "all assertions passed" line is one.
  if $PSQL -d wazn_check -f "$file" >"$DATA_DIR/out" 2>&1; then
    grep -E 'NOTICE|ERROR' "$DATA_DIR/out" || true
  else
    grep -E 'NOTICE|ERROR' "$DATA_DIR/out" >&2 || true
    echo "FAIL  $file" >&2
    exit 1
  fi
done

echo
echo "all migrations execute from empty, and the SQL suites pass."
