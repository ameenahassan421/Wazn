"""Parse every migration with the real Postgres grammar.

    pip install pglast && python3 scripts/check_migrations.py

`pglast` wraps libpg_query — the actual parser Postgres uses — so this catches
syntax errors without a server, a connection, or a Supabase project.

It exists because `0007` originally declared a column named `position`, which
is a reserved word (SQL-standard string-function syntax). That is a parse
error, not a runtime one: the whole migration was rejected before a single
statement ran, and the only way it surfaced was Ameen pasting it into the SQL
editor and getting `42601`.

A parse check is the floor, not the ceiling. It cannot see a wrong column
name, a type mismatch, or a broken RLS predicate — those need the statements
actually executed against the schema. Before shipping a migration that matters,
apply it to a Supabase branch database and call the functions.
"""

import glob
import os
import sys

try:
    import pglast
except ImportError:
    sys.exit("pglast is not installed. Run: pip install pglast")

ROOT = os.path.join(os.path.dirname(__file__), "..", "supabase", "migrations")


def main() -> int:
    paths = sorted(glob.glob(os.path.join(ROOT, "*.sql")))
    if not paths:
        sys.exit(f"no migrations found in {ROOT}")

    failed = 0
    for path in paths:
        name = os.path.basename(path)
        with open(path, encoding="utf-8") as fh:
            sql = fh.read()
        try:
            pglast.parse_sql(sql)
        except Exception as exc:  # noqa: BLE001 — any parse failure is a failure
            failed += 1
            print(f"FAIL  {name}\n      {exc}")
        else:
            print(f"ok    {name}")

    if failed:
        print(f"\n{failed} migration(s) will not parse.")
        return 1
    print(f"\n{len(paths)} migrations parse.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
