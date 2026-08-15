-- 0027: the second dataset is private, and the dials only move named columns.
--
-- Three things are worth executing rather than reading:
--
--   1. RLS. Body weight, protein and measurements are the most personal rows
--      in the app — more than a set is, and the design promises photos are
--      "never uploaded, never seen by the model". The tables underneath that
--      promise have to mean "mine" the way `workouts` was made to in 0026.
--   2. The owner default. 0016's whole lesson was that a client which forgets
--      `user_id` should still write a row that belongs to the right person.
--      An insert with no owner column is the fixture for that.
--   3. `upsert_user_preference`'s allowlist. It grew five branches; a typo in
--      one of them is a preference that silently never persists, which is
--      exactly the class of bug that has no symptom until somebody reinstalls.
--
-- HOW TO RUN
--   ./scripts/check_sql.sh   — throwaway local cluster, every migration from
--   empty, no network and no credentials. Ends in ROLLBACK either way.

begin;

do $$
declare
  a uuid;
  b uuid;
  seen bigint;
  v_prefs public.user_preferences;
  v_body jsonb;
begin
  -- ── Seed ────────────────────────────────────────────────────────────────
  insert into auth.users (email) values ('body-a@example.invalid')
    returning id into a;
  insert into auth.users (email) values ('body-b@example.invalid')
    returning id into b;

  -- ── A logs a body, without ever naming themselves ───────────────────────
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', a, 'role', 'authenticated')::text,
    true
  );

  -- No user_id column anywhere below. If the default is missing, RLS refuses
  -- these inserts and the test fails here rather than three assertions later.
  insert into public.body_weights (measured_on, weight_kg)
    values (current_date - 28, 82.4), (current_date, 82.1);
  insert into public.protein_days (day, grams, target_g)
    values (current_date - 1, 168, 160), (current_date, 140, 160);
  insert into public.body_measurements (site, measured_on, value_cm)
    values ('chest', current_date - 30, 103.0), ('chest', current_date, 104.0);
  insert into public.daily_checkins (day, state)
    values (current_date, 'drained');

  select count(*) into seen from public.body_weights;
  if seen <> 2 then
    raise exception 'FAIL: A wrote % weigh-ins, expected 2 (owner default?)', seen;
  end if;

  -- ── The overview reads A's own numbers, deltas included ─────────────────
  select public.body_overview() into v_body;

  if jsonb_array_length(v_body -> 'weights') <> 2 then
    raise exception 'FAIL: body_overview returned % weights, expected 2',
      jsonb_array_length(v_body -> 'weights');
  end if;

  -- One row per site — the latest — carrying the reading from 28+ days back.
  if jsonb_array_length(v_body -> 'measurements') <> 1 then
    raise exception 'FAIL: body_overview returned % measurement rows, expected 1',
      jsonb_array_length(v_body -> 'measurements');
  end if;
  if (v_body -> 'measurements' -> 0 ->> 'cm')::numeric <> 104.0 then
    raise exception 'FAIL: latest chest reading is %, expected 104.0',
      v_body -> 'measurements' -> 0 ->> 'cm';
  end if;
  if (v_body -> 'measurements' -> 0 ->> 'previous_cm')::numeric <> 103.0 then
    raise exception 'FAIL: 4-week-old chest reading is %, expected 103.0',
      v_body -> 'measurements' -> 0 ->> 'previous_cm';
  end if;

  -- ── B sees none of it ───────────────────────────────────────────────────
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', b, 'role', 'authenticated')::text,
    true
  );

  select count(*) into seen from public.body_weights;
  if seen <> 0 then
    raise exception 'FAIL: B can read % of A''s weigh-ins', seen;
  end if;
  select count(*) into seen from public.protein_days;
  if seen <> 0 then
    raise exception 'FAIL: B can read % of A''s protein days', seen;
  end if;
  select count(*) into seen from public.body_measurements;
  if seen <> 0 then
    raise exception 'FAIL: B can read % of A''s measurements', seen;
  end if;
  select count(*) into seen from public.daily_checkins;
  if seen <> 0 then
    raise exception 'FAIL: B can read % of A''s check-ins', seen;
  end if;

  select public.body_overview() into v_body;
  if jsonb_array_length(v_body -> 'weights') <> 0 then
    raise exception 'FAIL: body_overview leaked % weights to B',
      jsonb_array_length(v_body -> 'weights');
  end if;

  -- ── The dials ───────────────────────────────────────────────────────────
  -- Every branch, because a typo in one of them is a preference that never
  -- persists and has no symptom until a reinstall.
  select * into v_prefs from public.upsert_user_preference('coach_mode', 'meetprep');
  if v_prefs.coach_mode <> 'meetprep' then
    raise exception 'FAIL: coach_mode is %, expected meetprep', v_prefs.coach_mode;
  end if;

  select * into v_prefs from public.upsert_user_preference('coach_volume', 'quiet');
  if v_prefs.coach_volume <> 'quiet' then
    raise exception 'FAIL: coach_volume is %, expected quiet', v_prefs.coach_volume;
  end if;

  select * into v_prefs from public.upsert_user_preference('meet_date', '2026-11-14');
  if v_prefs.meet_date <> date '2026-11-14' then
    raise exception 'FAIL: meet_date is %, expected 2026-11-14', v_prefs.meet_date;
  end if;

  -- Un-dating meet prep is a real state, and the empty string is how the
  -- client says so without a second RPC.
  select * into v_prefs from public.upsert_user_preference('meet_date', '');
  if v_prefs.meet_date is not null then
    raise exception 'FAIL: meet_date did not clear, it is %', v_prefs.meet_date;
  end if;

  select * into v_prefs from public.upsert_user_preference('weekly_target', '4');
  if v_prefs.weekly_target <> 4 then
    raise exception 'FAIL: weekly_target is %, expected 4', v_prefs.weekly_target;
  end if;

  select * into v_prefs
    from public.upsert_user_preference('protein_target_g', '160');
  if v_prefs.protein_target_g <> 160 then
    raise exception 'FAIL: protein_target_g is %, expected 160',
      v_prefs.protein_target_g;
  end if;

  -- The columns 0023 and 0025 shipped still move. This function is rewritten
  -- wholesale by each migration that extends it, so the old branches are the
  -- half most likely to be dropped by accident.
  select * into v_prefs from public.upsert_user_preference('theme', 'dark');
  if v_prefs.theme <> 'dark' then
    raise exception 'FAIL: theme is %, expected dark', v_prefs.theme;
  end if;
  select * into v_prefs from public.upsert_user_preference('weight_unit', 'lbs');
  if v_prefs.weight_unit <> 'lbs' then
    raise exception 'FAIL: weight_unit is %, expected lbs', v_prefs.weight_unit;
  end if;

  -- And an unknown column is a no-op rather than an error or a way through.
  select * into v_prefs from public.upsert_user_preference('user_id', a::text);
  if v_prefs.user_id <> b then
    raise exception 'FAIL: an unknown column moved user_id to %', v_prefs.user_id;
  end if;

  -- ── The forecast gate ───────────────────────────────────────────────────
  -- The eight-week rule is the whole reason this function exists, and it is
  -- measured as a SPAN. Twelve sessions three days apart is five weeks of
  -- evidence, not twelve; a lifter who trains often must not get a forecast
  -- sooner than one who trains rarely.
  declare
    e_bench uuid;
    w_id uuid;
    v_weeks integer;
    v_sessions integer;
    v_slope numeric;
    v_latest numeric;
  begin
    set local role postgres;
    insert into public.exercises (name, muscle_group, equipment)
      values ('ZZ Forecast Bench', 'chest', 'barbell') returning id into e_bench;

    set local role authenticated;
    perform set_config('request.jwt.claim.sub', b::text, true);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', b, 'role', 'authenticated')::text,
      true
    );

    -- Ten sessions, one a week, climbing 2.5 kg a session at a fixed rep count.
    for i in 0..9 loop
      insert into public.workouts (user_id, started_at, ended_at)
        values (b, now() - ((63 - i * 7) || ' days')::interval,
                   now() - ((63 - i * 7) || ' days')::interval + interval '1 hour')
        returning id into w_id;
      insert into public.workout_sets
        (workout_id, exercise_id, set_number, weight_kg, reps, set_type)
        values (w_id, e_bench, 1, 100 + i * 2.5, 5, 'normal');
      -- A warm-up on every session, which must not reach the regression.
      insert into public.workout_sets
        (workout_id, exercise_id, set_number, weight_kg, reps, set_type)
        values (w_id, e_bench, 2, 40, 10, 'warmup');
    end loop;

    select f.weeks_of_data, f.sessions, f.slope_kg_per_week, f.latest_e1rm_kg
      into v_weeks, v_sessions, v_slope, v_latest
      from public.strength_forecast() f
      where f.exercise_id = e_bench;

    if v_sessions <> 10 then
      raise exception 'FAIL: strength_forecast counted % sessions, expected 10', v_sessions;
    end if;
    if v_weeks <> 9 then
      raise exception 'FAIL: strength_forecast spans % weeks, expected 9', v_weeks;
    end if;
    -- 2.5 kg a week at a fixed rep count, so the estimate climbs by the same
    -- Epley multiple: 2.5 * (1 + 5/30).
    if abs(v_slope - 2.5 * (1 + 5.0 / 30)) > 0.05 then
      raise exception 'FAIL: slope is % kg/wk, expected ~2.917', v_slope;
    end if;
    -- The warm-up is 40 × 10; if it had reached the regression the latest
    -- estimate would be far below the 122.5 × 5 working set.
    if v_latest < 140 then
      raise exception 'FAIL: latest e1RM is %, so warm-ups reached the fit', v_latest;
    end if;

    -- And A, who logged none of this, sees no row for it.
    perform set_config('request.jwt.claim.sub', a::text, true);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', a, 'role', 'authenticated')::text,
      true
    );
    if exists (select 1 from public.strength_forecast() f where f.exercise_id = e_bench) then
      raise exception 'FAIL: strength_forecast leaked B''s lift to A';
    end if;
  end;

  set local role postgres;
  raise notice 'body_and_coach: all assertions passed';
end $$;

rollback;
