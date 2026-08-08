-- Owner-column defaults for the social writes.
--
-- `follows.follower_id` and `workout_likes.user_id` are NOT NULL with no
-- default, and the client inserts omitted them — so every follow and every
-- like the app ever attempted was refused before RLS had an opinion. The
-- client now sends both columns explicitly (that fix ships without this
-- migration and does not depend on it); this adds the database-side default
-- so the next person to write an insert here cannot make the same omission.
--
-- `auth.uid()` as a column default is the Supabase idiom and is safe under
-- RLS: the insert policies still require `follower_id = auth.uid()` and
-- `user_id = auth.uid()`, so the default agrees with the check rather than
-- widening it. A service-role import that supplies the column explicitly is
-- unaffected — a default only fills a column that was not named.

-- Note the bare call, not `(select auth.uid())`. The subselect wrapper is an
-- RLS-policy optimisation (it lets the planner cache the value as an
-- InitPlan); a column DEFAULT must be a variable-free expression and Postgres
-- rejects a subquery there. `check_migrations.py` parses both happily, so this
-- one is a rule the parser cannot enforce.

alter table public.follows
  alter column follower_id set default auth.uid();

alter table public.workout_likes
  alter column user_id set default auth.uid();
