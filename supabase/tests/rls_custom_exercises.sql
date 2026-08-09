-- Custom exercises are private by construction. This proves it the same way
-- `rls_social.sql` does: by switching to the `authenticated` role and setting
-- `request.jwt.claims`, which is exactly what PostgREST does before running a
-- query. A caller with a valid token talking to the REST API directly travels
-- this path.
--
-- Runs inside a transaction ending in ROLLBACK. Every assertion raises on
-- failure; reaching the final SELECT means they all passed.

begin;

do $$
declare
  user_a uuid;
  user_b uuid;
  seeded uuid;
  mine uuid;
  visible bigint;
  refused boolean;
begin
  select w.user_id into user_a
  from public.workouts w group by w.user_id order by count(*) desc limit 1;
  select p.id into user_b from public.profiles p where p.id <> user_a limit 1;
  select e.id into seeded from public.exercises e where e.owner_id is null limit 1;

  if user_a is null or user_b is null or seeded is null then
    raise exception 'need two profiles and a seeded exercise to test with';
  end if;

  -- ── A creates a custom exercise ──────────────────────────────────────────
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text, true);

  insert into public.exercises (name, muscle_group, equipment, is_custom, owner_id)
  values ('Test Hack Squat', 'quads', 'machine', true, user_a)
  returning id into mine;

  -- ── 1. A can see it, alongside the shared library ────────────────────────
  select count(*) into visible from public.exercises where id = mine;
  if visible <> 1 then
    raise exception 'FAIL: the owner cannot see their own custom exercise';
  end if;

  -- ── 2. The same name twice is refused ────────────────────────────────────
  refused := false;
  begin
    insert into public.exercises (name, muscle_group, equipment, is_custom, owner_id)
    values ('test hack squat', 'quads', 'machine', true, user_a);
  exception when others then refused := true;
  end;
  if not refused then
    raise exception 'FAIL: a duplicate custom name was accepted (case-insensitively)';
  end if;

  -- ── 3. A cannot create one owned by B ────────────────────────────────────
  refused := false;
  begin
    insert into public.exercises (name, muscle_group, equipment, is_custom, owner_id)
    values ('Planted On B', 'quads', 'machine', true, user_b);
  exception when others then refused := true;
  end;
  if not refused then
    raise exception 'FAIL: A created an exercise owned by B';
  end if;

  -- ── 4. A cannot forge a seeded row ───────────────────────────────────────
  -- Without the is_custom check in the insert policy this would succeed, and
  -- the row would then be indistinguishable from the shared library.
  refused := false;
  begin
    insert into public.exercises (name, muscle_group, equipment, is_custom, owner_id)
    values ('Fake Seeded', 'quads', 'machine', false, user_a);
  exception when others then refused := true;
  end;
  if not refused then
    raise exception 'FAIL: A inserted a row claiming not to be custom';
  end if;

  -- ── 5. A cannot edit a seeded exercise ───────────────────────────────────
  update public.exercises set name = 'Hijacked' where id = seeded;
  select count(*) into visible from public.exercises
   where id = seeded and name = 'Hijacked';
  if visible <> 0 then
    raise exception 'FAIL: a seeded exercise was editable';
  end if;

  -- ── 6. B cannot see A's custom exercise ──────────────────────────────────
  -- The headline claim: a custom exercise is private, not merely unlisted.
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text, true);

  select count(*) into visible from public.exercises where id = mine;
  if visible <> 0 then
    raise exception 'FAIL: B can see A''s custom exercise';
  end if;

  -- ── 7. B cannot edit or delete it either ─────────────────────────────────
  update public.exercises set name = 'Stolen' where id = mine;
  delete from public.exercises where id = mine;

  reset role;
  select count(*) into visible from public.exercises
   where id = mine and name = 'Test Hack Squat';
  if visible <> 1 then
    raise exception 'FAIL: B modified or deleted A''s custom exercise';
  end if;

  -- ── 8. B still sees the shared library ───────────────────────────────────
  -- The point of the split: private does not mean the seed became invisible.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text, true);
  select count(*) into visible from public.exercises where owner_id is null;
  if visible = 0 then
    raise exception 'FAIL: the shared exercise library is not visible to B';
  end if;

  -- ── 9. Archiving (0024) is an owner update, and never a way to hide ──────
  -- Archived rows must stay READABLE or History would blank the exercise name
  -- on every past workout that used one, which is the opposite of the
  -- guarantee "archive not delete" is named after.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text, true);
  update public.exercises set archived_at = now() where id = mine;
  select count(*) into visible from public.exercises
   where id = mine and archived_at is not null;
  if visible <> 1 then
    raise exception 'FAIL: the owner could not archive their own custom exercise';
  end if;

  -- Still selectable by its owner while archived.
  select count(*) into visible from public.exercises where id = mine;
  if visible <> 1 then
    raise exception 'FAIL: archiving hid the exercise from its own owner';
  end if;

  -- ── 10. B cannot archive A's exercise ────────────────────────────────────
  update public.exercises set archived_at = null where id = mine;
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text, true);
  update public.exercises set archived_at = now() where id = mine;
  reset role;
  select count(*) into visible from public.exercises
   where id = mine and archived_at is not null;
  if visible <> 0 then
    raise exception 'FAIL: B archived A''s custom exercise';
  end if;

  reset role;
  raise notice 'all custom-exercise RLS assertions passed';
end
$$;

select 'ALL CUSTOM-EXERCISE RLS ASSERTIONS PASSED' as result;

rollback;
