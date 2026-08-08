-- Stage 3 visibility, proved rather than asserted.
--
-- Plan §Stage 3: "Visibility enforced in RLS (private default / followers),
-- never client-side." This file is the evidence for that sentence. It is not a
-- unit test of a helper — it switches to the `authenticated` role and sets
-- `request.jwt.claims`, which is exactly what PostgREST does before it runs a
-- query. A caller holding a valid access token and talking to the REST API
-- directly, with no Wazn client involved, travels this same path.
--
-- HOW TO RUN
--   Paste into the Supabase SQL editor, or:
--     ./scripts/run_sql.sh supabase/tests/rls_social.sql
--   It runs inside a transaction and ends in ROLLBACK, so it leaves nothing
--   behind. Every assertion raises on failure; reaching the final SELECT means
--   they all passed.
--
-- WHY IT USES REAL ACCOUNTS
--   It parameterises over the two profiles that exist rather than creating
--   auth users, because creating and deleting auth users is a change to auth
--   that §2.6 puts behind an ask. The rollback makes the borrowing invisible.

begin;

do $$
declare
  -- A has the training history; B is the other account. Chosen at runtime so
  -- this keeps working as accounts change.
  user_a uuid;
  user_b uuid;
  visible bigint;
  finished bigint;
  refused boolean;
begin
  select w.user_id into user_a
  from public.workouts w
  group by w.user_id
  order by count(*) desc
  limit 1;

  select p.id into user_b
  from public.profiles p
  where p.id <> user_a
  limit 1;

  if user_a is null or user_b is null then
    raise exception 'need two profiles and at least one workout to test with';
  end if;

  -- Both accounts opt in to being followable. Rolled back at the end.
  update public.profiles set visibility = 'followers', username = 'test_a' where id = user_a;
  update public.profiles set visibility = 'followers', username = 'test_b' where id = user_b;

  select count(*) into finished
  from public.workouts where user_id = user_a and ended_at is not null;

  -- ── 1. A non-follower reads nothing ──────────────────────────────────────
  -- The headline claim. B is a real, signed-in user with a valid token asking
  -- PostgREST for A's workouts.
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text,
    true
  );

  select count(*) into visible from public.workouts where user_id = user_a;
  if visible <> 0 then
    raise exception 'FAIL: a non-follower saw % of A''s workouts', visible;
  end if;

  -- Sets are the same rule. A feed that leaked sets while hiding workouts
  -- would leak everything that matters.
  select count(*) into visible
  from public.workout_sets s
  join public.workouts w on w.id = s.workout_id
  where w.user_id = user_a;
  if visible <> 0 then
    raise exception 'FAIL: a non-follower saw % of A''s sets', visible;
  end if;

  -- ── 2. B cannot forge a follow on someone else's behalf ──────────────────
  refused := false;
  begin
    insert into public.follows (follower_id, following_id) values (user_a, user_b);
  exception when others then
    refused := true;
  end;
  if not refused then
    raise exception 'FAIL: B inserted a follow with A as the follower';
  end if;

  -- ── 3. Following makes finished workouts, and only those, visible ────────
  insert into public.follows (follower_id, following_id) values (user_b, user_a);

  select count(*) into visible from public.workouts where user_id = user_a;
  if visible <> finished then
    raise exception 'FAIL: follower saw % workouts, expected % finished ones',
      visible, finished;
  end if;

  -- An in-progress session is never anyone else's business, at any setting.
  select count(*) into visible
  from public.workouts where user_id = user_a and ended_at is null;
  if visible <> 0 then
    raise exception 'FAIL: follower saw % in-progress workouts', visible;
  end if;

  -- ── 4. Going private revokes access without deleting the follow ──────────
  -- The setting has to bite on read, not on follow. If it only checked at
  -- follow time, turning your profile private would do nothing.
  reset role;
  update public.profiles set visibility = 'private' where id = user_a;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text,
    true
  );
  select count(*) into visible from public.workouts where user_id = user_a;
  if visible <> 0 then
    raise exception 'FAIL: a private profile showed % workouts to a follower', visible;
  end if;

  -- A private profile is not even discoverable.
  select count(*) into visible from public.profiles where id = user_a;
  if visible <> 0 then
    raise exception 'FAIL: a private profile was readable by another user';
  end if;

  -- ── 5. Nobody can follow a private profile ───────────────────────────────
  reset role;
  delete from public.follows where follower_id = user_b and following_id = user_a;
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text,
    true
  );

  refused := false;
  begin
    insert into public.follows (follower_id, following_id) values (user_b, user_a);
  exception when others then
    refused := true;
  end;
  if not refused then
    raise exception 'FAIL: a private profile was followable';
  end if;

  -- ── 6. Public means public ───────────────────────────────────────────────
  reset role;
  update public.profiles set visibility = 'public' where id = user_a;
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text,
    true
  );
  select count(*) into visible from public.workouts where user_id = user_a;
  if visible <> finished then
    raise exception 'FAIL: a public profile showed % workouts, expected %',
      visible, finished;
  end if;

  -- ── 7. A like cannot be planted under someone else's name ────────────────
  refused := false;
  begin
    insert into public.workout_likes (user_id, workout_id)
    select user_a, id from public.workouts where user_id = user_a limit 1;
  exception when others then
    refused := true;
  end;
  if not refused then
    raise exception 'FAIL: B liked a workout as A';
  end if;

  -- ── 7b. The CLIENT's insert shape works, not just SQL's ─────────────────
  -- Every other assertion in this file names both columns, the way raw SQL
  -- does. The app does not: it inserts `{following_id}` and lets the column
  -- default supply the owner. That gap is why follows and likes were refused
  -- in production while all eight assertions here passed. Insert exactly the
  -- way the client does, and require it to work.
  reset role;
  update public.profiles set visibility = 'followers' where id = user_a;
  delete from public.follows where follower_id = user_b;
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text,
    true
  );

  insert into public.follows (following_id) values (user_a);
  if not exists (
    select 1 from public.follows
    where follower_id = user_b and following_id = user_a
  ) then
    raise exception 'FAIL: an insert omitting follower_id did not record B -> A';
  end if;

  insert into public.workout_likes (workout_id)
  select id from public.workouts
  where user_id = user_a and ended_at is not null
  limit 1;
  if not exists (select 1 from public.workout_likes where user_id = user_b) then
    raise exception 'FAIL: an insert omitting user_id did not record B''s like';
  end if;

  -- ── 8. The feed shows nothing you do not follow ──────────────────────────
  reset role;
  delete from public.follows where follower_id = user_b;
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text,
    true
  );
  select count(*) into visible from public.social_feed(50, null);
  if visible <> 0 then
    raise exception 'FAIL: the feed returned % rows with no follows', visible;
  end if;

  reset role;
  raise notice 'all social RLS assertions passed (A had % finished workouts)', finished;
end
$$;

select 'ALL SOCIAL RLS ASSERTIONS PASSED' as result;

rollback;
