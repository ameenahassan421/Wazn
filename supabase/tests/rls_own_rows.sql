-- 0026: "my" queries return only mine, and the feed still sees the circle.
--
-- The bug this locks down was systemic rather than local. Fifteen reporting
-- functions read `public.workouts` with no user predicate, trusting RLS to
-- scope them; `workouts_select_visible` deliberately admitted other people's
-- FINISHED workouts so the friends feed could read them, so every one of
-- those fifteen inherited the permission. It never showed, because
-- `profiles.visibility` defaults to 'private' and `can_view` answered false —
-- the whole class of defect was one settings change away from going live.
--
-- So the fixture makes A public and has B follow them, which is exactly the
-- state that used to leak, and then asserts both halves:
--
--   1. B's own reads and B's own stats contain nothing of A's.
--   2. B's feed and leaderboard still contain A — the definer path works.
--
-- Half of that is not enough on its own. Tightening the policy while
-- breaking the feed would pass any test that only checked isolation, and
-- shipping the feed while leaking would pass any test that only checked the
-- feed.
--
-- HOW TO RUN
--   ./scripts/check_sql.sh   — throwaway local cluster, every migration from
--   empty, no network and no credentials. Ends in ROLLBACK either way.

begin;

do $$
declare
  a uuid;
  b uuid;
  e_bench uuid;
  w_a uuid;
  w_b uuid;
  seen bigint;
  vol numeric;
begin
  -- ── Seed ────────────────────────────────────────────────────────────────
  insert into auth.users (email) values ('own-rows-a@example.invalid')
    returning id into a;
  insert into auth.users (email) values ('own-rows-b@example.invalid')
    returning id into b;

  insert into public.exercises (name, muscle_group, equipment)
    values ('ZZ Own Rows Bench', 'chest', 'barbell') returning id into e_bench;

  -- A is public and has trained. This is the state that used to leak.
  update public.profiles set visibility = 'public', username = 'own_rows_a'
    where id = a;
  update public.profiles set visibility = 'private', username = 'own_rows_b'
    where id = b;

  insert into public.workouts (user_id, name, started_at, ended_at)
    values (a, 'A session', now() - interval '2 days',
            now() - interval '2 days' + interval '45 minutes')
    returning id into w_a;
  insert into public.workout_sets
    (workout_id, exercise_id, set_number, weight_kg, reps, set_type)
    values (w_a, e_bench, 1, 100, 5, 'normal');

  -- B has trained exactly once, with a weight nothing of A's could be
  -- confused for.
  insert into public.workouts (user_id, name, started_at, ended_at)
    values (b, 'B session', now() - interval '1 day',
            now() - interval '1 day' + interval '30 minutes')
    returning id into w_b;
  insert into public.workout_sets
    (workout_id, exercise_id, set_number, weight_kg, reps, set_type)
    values (w_b, e_bench, 1, 60, 5, 'normal');

  -- B follows A, so the feed has something to show and the old policy would
  -- have been at its most permissive.
  insert into public.follows (follower_id, following_id) values (b, a);

  -- ── B is the caller from here on ────────────────────────────────────────
  -- Both spellings, deliberately. A real Supabase project's `auth.uid()`
  -- reads the `request.jwt.claims` JSON; the local shim in scripts/pg_shim.sql
  -- reads the flattened `request.jwt.claim.sub`. Setting only the first made
  -- `auth.uid()` NULL under the local runner, which turns every isolation
  -- assertion below into a tautology — nothing is visible to nobody. That is
  -- a test that passes for the wrong reason, so assertion 2 exists to catch
  -- it: B has to still see B.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', b, 'role', 'authenticated')::text,
    true
  );

  -- 1. The table itself. This is the assertion the whole migration exists
  --    for: before 0026 this returned 1.
  select count(*) into seen from public.workouts where user_id = a;
  if seen <> 0 then
    raise exception 'FAIL: B read % of A''s workouts directly', seen;
  end if;

  select count(*) into seen
  from public.workout_sets s join public.workouts w on w.id = s.workout_id
  where w.user_id = a;
  if seen <> 0 then
    raise exception 'FAIL: B read % of A''s sets', seen;
  end if;

  -- 2. An unscoped select — the shape every one of the fifteen functions
  --    uses, and the shape the app's own History query uses.
  select count(*) into seen from public.workouts;
  if seen <> 1 then
    raise exception 'FAIL: an unscoped select returned % workouts, expected only B''s 1', seen;
  end if;

  -- 3. A reporting function, end to end. `workout_totals` has no user
  --    predicate of its own; it is correct now only because the table is.
  select coalesce(sum(t.volume_kg), 0) into vol
  from public.workout_totals() t;
  if vol <> 300 then
    raise exception 'FAIL: B''s totals came to % kg, expected 300 (60x5). A''s 500 leaked in.', vol;
  end if;

  -- 4. And the feed still works, which is the half a leak-only test misses.
  select count(*) into seen from public.social_feed() f where f.user_id = a;
  if seen <> 1 then
    raise exception 'FAIL: the feed showed % of A''s sessions, expected 1', seen;
  end if;

  select count(*) into seen from public.weekly_leaderboard() l where l.user_id = a;
  if seen <> 1 then
    raise exception 'FAIL: the leaderboard showed A % times, expected 1', seen;
  end if;

  -- 5. Visibility is still honoured inside the definer function. A going
  --    private has to remove them from the feed even though B follows them —
  --    that check used to be RLS's job and is now the query's.
  set local role postgres;
  update public.profiles set visibility = 'private' where id = a;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', b, 'role', 'authenticated')::text,
    true
  );

  select count(*) into seen from public.social_feed() f where f.user_id = a;
  if seen <> 0 then
    raise exception 'FAIL: a private profile B follows still appeared in the feed % times', seen;
  end if;

  set local role postgres;
  raise notice 'rls_own_rows: all assertions passed';
end $$;

rollback;
