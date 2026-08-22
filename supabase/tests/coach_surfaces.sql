-- B1/B2: the coach's deterministic layer, asserted against a seeded history.
--
-- B2's instruction is "deterministic layer computes every figure … RLS-scoped,
-- unit-tested". This is the unit test. It is the first SQL in this repo that
-- checks what a function *returns* rather than whether a statement is accepted:
-- `check_migrations.py` parses, `scripts/check_sql.sh` executes, and this
-- proves the arithmetic.
--
-- HOW TO RUN
--   ./scripts/check_sql.sh
--     Spins up a throwaway local cluster, applies every migration from empty,
--     and runs this. No network, no Supabase project, nothing to configure.
--
--   ./scripts/run_sql.sh supabase/tests/coach_surfaces.sql
--     Against a real database. It ends in ROLLBACK and every row it writes is
--     its own, but it does create an auth user, so prefer the local runner.
--
-- WHY IT SEEDS ITS OWN HISTORY
--   The two RLS suites borrow real accounts, because what they test is
--   visibility between people and real accounts are the honest fixture. This
--   tests arithmetic, and arithmetic needs *known* inputs — "the briefing
--   suggests 102.5 kg" is only a test if you can say why 102.5 and not 105.
--
-- THE FIXTURE, IN WORDS
--   One lifter, ten finished sessions, every one of them 2 days-mod-7 old so
--   each falls in its own week and nothing lands on a window boundary.
--     -2   Pull A   lat pulldown 70x10, 70x10, 72.5x8
--     -9   Push A   bench 100x5, 95x5, 90x5 · pulldown 67.5x10 · calf 50x15 x2
--     -16  freestyle  bench 95x5 · pulldown 65x10
--     -23  freestyle  pulldown 60x10
--     -30  freestyle  squat 140x3 · pulldown 55x10
--     -37 … -65      squat 140x3, five more sessions, never moving
--   So: the pulldown climbs every session (a win, and a progression streak),
--   the squat is flat across six sessions (a plateau), chest and calves have
--   nothing this week (a band gap), and Push A is the routine due because Pull
--   A ran more recently.

begin;

do $$
declare
  u uuid;
  e_bench uuid;
  e_squat uuid;
  e_pulldown uuid;
  e_calf uuid;
  r_push uuid;
  r_pull uuid;
  w1 uuid;
  brief jsonb;
  debrief jsonb;
  review jsonb;

  -- Assertion helpers are inline `if … raise` rather than a function, so a
  -- failure names the figure in the message and the line in the context.
  procedure_note text;
begin
  -- ── Seed ─────────────────────────────────────────────────────────────────
  insert into auth.users (email) values ('coach-surfaces-test@example.invalid')
    returning id into u;

  insert into public.exercises (name, muscle_group, equipment)
    values ('ZZ Test Bench', 'chest', 'barbell') returning id into e_bench;
  insert into public.exercises (name, muscle_group, equipment)
    values ('ZZ Test Squat', 'quads', 'barbell') returning id into e_squat;
  insert into public.exercises (name, muscle_group, equipment)
    values ('ZZ Test Pulldown', 'back', 'cable') returning id into e_pulldown;
  insert into public.exercises (name, muscle_group, equipment)
    values ('ZZ Test Calf Raise', 'calves', 'machine') returning id into e_calf;

  -- Push A is created first and therefore sorts first on `position`, but the
  -- rotation rule is "least recently run", and Pull A runs 2 days ago against
  -- Push A's 9. Push A must come back as due, which is the whole point of the
  -- rule and the reason both routines exist here.
  insert into public.routines (user_id, name, position)
    values (u, 'Push A', 0) returning id into r_push;
  insert into public.routines (user_id, name, position)
    values (u, 'Pull A', 1) returning id into r_pull;

  insert into public.routine_exercises (routine_id, exercise_id, position)
    values (r_push, e_bench, 0), (r_push, e_calf, 1), (r_pull, e_pulldown, 0);

  -- Sessions. `ended_at` is always set: every function here filters on it.
  insert into public.workouts (user_id, started_at, ended_at, routine_id)
    values (u, now() - interval '2 days',
               now() - interval '2 days' + interval '45 minutes', r_pull)
    returning id into w1;

  insert into public.workout_sets
    (workout_id, exercise_id, set_number, weight_kg, reps, set_type)
  values
    (w1, e_pulldown, 1, 70, 10, 'normal'),
    (w1, e_pulldown, 2, 70, 10, 'normal'),
    (w1, e_pulldown, 3, 72.5, 8, 'normal');

  declare
    w uuid;
    d int;
  begin
    -- -9: the Push A session. Bench's top set here is what the briefing's
    -- target is computed from.
    insert into public.workouts (user_id, started_at, ended_at, routine_id)
      values (u, now() - interval '9 days',
                 now() - interval '9 days' + interval '60 minutes', r_push)
      returning id into w;
    insert into public.workout_sets
      (workout_id, exercise_id, set_number, weight_kg, reps, set_type)
    values
      -- A warm-up, so the test also proves warm-ups are excluded everywhere:
      -- if it counted, `total_sets_90d` would be 20 rather than 19 and the
      -- bench target would be computed from 60 kg.
      (w, e_bench, 1, 60, 10, 'warmup'),
      (w, e_bench, 2, 100, 5, 'normal'),
      (w, e_bench, 3, 95, 5, 'normal'),
      (w, e_bench, 4, 90, 5, 'normal'),
      (w, e_pulldown, 5, 67.5, 10, 'normal'),
      (w, e_calf, 6, 50, 15, 'normal'),
      (w, e_calf, 7, 50, 15, 'normal');

    insert into public.workouts (user_id, started_at, ended_at)
      values (u, now() - interval '16 days',
                 now() - interval '16 days' + interval '50 minutes')
      returning id into w;
    insert into public.workout_sets
      (workout_id, exercise_id, set_number, weight_kg, reps, set_type)
    values (w, e_bench, 1, 95, 5, 'normal'), (w, e_pulldown, 2, 65, 10, 'normal');

    insert into public.workouts (user_id, started_at, ended_at)
      values (u, now() - interval '23 days',
                 now() - interval '23 days' + interval '40 minutes')
      returning id into w;
    insert into public.workout_sets
      (workout_id, exercise_id, set_number, weight_kg, reps, set_type)
    values (w, e_pulldown, 1, 60, 10, 'normal');

    -- Six squat sessions that never move, plus the pulldown's oldest session
    -- riding along on the first of them so the lift has a "before 28 days"
    -- best to be a win against.
    foreach d in array array[30, 37, 44, 51, 58, 65] loop
      insert into public.workouts (user_id, started_at, ended_at)
        values (u, now() - (d * interval '1 day'),
                   now() - (d * interval '1 day') + interval '55 minutes')
        returning id into w;
      insert into public.workout_sets
        (workout_id, exercise_id, set_number, weight_kg, reps, set_type)
      values (w, e_squat, 1, 140, 3, 'normal');
      if d = 30 then
        insert into public.workout_sets
          (workout_id, exercise_id, set_number, weight_kg, reps, set_type)
        values (w, e_pulldown, 2, 55, 10, 'normal');
      end if;
    end loop;
  end;

  -- ── Become the lifter ────────────────────────────────────────────────────
  -- Everything below runs the way PostgREST runs it: the `authenticated` role
  -- with a JWT subject claim. The functions are `security invoker`, so if RLS
  -- did not scope them this would return nothing at all.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u::text, true);

  -- ── session_brief() ──────────────────────────────────────────────────────
  brief := public.session_brief();

  if (brief -> 'days_since_last')::int <> 2 then
    raise exception 'days_since_last: expected 2, got %', brief -> 'days_since_last';
  end if;
  if (brief -> 'sessions_last_7')::int <> 1 then
    raise exception 'sessions_last_7: expected 1, got %', brief -> 'sessions_last_7';
  end if;
  if (brief -> 'sessions_last_28')::int <> 4 then
    raise exception 'sessions_last_28: expected 4, got %', brief -> 'sessions_last_28';
  end if;
  -- 19 working sets in 90 days. The warm-up at -9 is the 20th and must not be
  -- counted.
  if (brief -> 'total_sets_90d')::int <> 19 then
    raise exception 'total_sets_90d: expected 19, got %', brief -> 'total_sets_90d';
  end if;

  -- Rotation, not recency: Pull A ran 2 days ago, Push A 9, so Push A is due.
  if brief #>> '{due_routine,name}' <> 'Push A' then
    raise exception 'due_routine: expected Push A, got %', brief -> 'due_routine';
  end if;
  if (brief #>> '{due_routine,exercises}')::int <> 2 then
    raise exception 'due_routine.exercises: expected 2, got %', brief -> 'due_routine';
  end if;
  if (brief #>> '{due_routine,days_since_run}')::int <> 9 then
    raise exception 'due_routine.days_since_run: expected 9, got %', brief -> 'due_routine';
  end if;

  -- The target. Bench is the first exercise of the due routine with any
  -- history; its last session was -9 days and its top set there was 100x5,
  -- which is also its best ever — e1RM 100 * (1 + 5/30) = 116.7.
  --
  -- So the target has to *beat* a set the lifter has already hit at this rep
  -- count, and the smallest 2.5 step that does is 102.5. This is the case the
  -- `floor(x/2.5)*2.5 + 2.5` form exists for: a naive ceil() returns 100 and
  -- the briefing tells them to repeat what they just did.
  if brief #>> '{target,exercise}' <> 'ZZ Test Bench' then
    raise exception 'target.exercise: got %', brief -> 'target';
  end if;
  if (brief #>> '{target,last_weight_kg}')::numeric <> 100.00 then
    raise exception 'target.last_weight_kg: expected 100, got %', brief -> 'target';
  end if;
  if (brief #>> '{target,last_reps}')::int <> 5 then
    raise exception 'target.last_reps: expected 5, got %', brief -> 'target';
  end if;
  if (brief #>> '{target,best_e1rm}')::numeric <> 116.7 then
    raise exception 'target.best_e1rm: expected 116.7, got %', brief -> 'target';
  end if;
  if (brief #>> '{target,next_weight_kg}')::numeric <> 102.50 then
    raise exception 'target.next_weight_kg: expected 102.5, got %', brief -> 'target';
  end if;
  if (brief #>> '{target,next_e1rm}')::numeric <> 119.6 then
    raise exception 'target.next_e1rm: expected 119.6, got %', brief -> 'target';
  end if;
  if (brief #>> '{target,last_done_days_ago}')::int <> 9 then
    raise exception 'target.last_done_days_ago: expected 9, got %', brief -> 'target';
  end if;

  -- Band gaps: calves and chest at zero this week, back at three. Quads is
  -- absent because the last squat session was 30 days ago and the coach does
  -- not open a front on a muscle group that is not currently in the programme.
  if jsonb_array_length(brief -> 'low_bands') <> 3 then
    raise exception 'low_bands: expected 3, got %', brief -> 'low_bands';
  end if;
  if brief #>> '{low_bands,0,muscle}' <> 'calves'
     or (brief #>> '{low_bands,0,sets}')::int <> 0 then
    raise exception 'low_bands[0]: expected calves at 0, got %', brief -> 'low_bands';
  end if;
  if brief #>> '{low_bands,1,muscle}' <> 'chest' then
    raise exception 'low_bands[1]: expected chest, got %', brief -> 'low_bands';
  end if;
  if brief #>> '{low_bands,2,muscle}' <> 'back'
     or (brief #>> '{low_bands,2,sets}')::int <> 3 then
    raise exception 'low_bands[2]: expected back at 3, got %', brief -> 'low_bands';
  end if;

  -- ── session_debrief() ────────────────────────────────────────────────────
  debrief := public.session_debrief(w1);

  if not (debrief -> 'found')::boolean then
    raise exception 'debrief: workout not found';
  end if;
  if (debrief -> 'sets')::int <> 3 then
    raise exception 'debrief.sets: expected 3, got %', debrief -> 'sets';
  end if;
  if (debrief -> 'exercises')::int <> 1 then
    raise exception 'debrief.exercises: expected 1, got %', debrief -> 'exercises';
  end if;
  -- 70*10 + 70*10 + 72.5*8 = 1980
  if (debrief -> 'volume_kg')::numeric <> 1980.0 then
    raise exception 'debrief.volume_kg: expected 1980, got %', debrief -> 'volume_kg';
  end if;
  if (debrief -> 'duration_min')::int <> 45 then
    raise exception 'debrief.duration_min: expected 45, got %', debrief -> 'duration_min';
  end if;

  -- The top set is ONE set. 70x10 estimates higher than 72.5x8 (93.3 against
  -- 91.8), so the anchor is 70 kg AND 10 reps — never 72.5 paired with 10,
  -- which is the set nobody did and which the first draft of this function
  -- reported.
  if debrief #>> '{anchor,exercise}' <> 'ZZ Test Pulldown' then
    raise exception 'anchor.exercise: got %', debrief -> 'anchor';
  end if;
  if (debrief #>> '{anchor,top_weight_kg}')::numeric <> 70.00
     or (debrief #>> '{anchor,top_reps}')::int <> 10 then
    raise exception 'anchor top set: expected 70x10, got %', debrief -> 'anchor';
  end if;
  if (debrief #>> '{anchor,e1rm}')::numeric <> 93.3 then
    raise exception 'anchor.e1rm: expected 93.3, got %', debrief -> 'anchor';
  end if;
  if (debrief #>> '{anchor,previous_e1rm}')::numeric <> 90.0 then
    raise exception 'anchor.previous_e1rm: expected 90.0, got %', debrief -> 'anchor';
  end if;
  if (debrief #>> '{anchor,gain_since_last_e1rm}')::numeric <> 3.3 then
    raise exception 'anchor.gain_since_last_e1rm: expected 3.3, got %', debrief -> 'anchor';
  end if;
  -- Five pulldown sessions, each beating the one before: 55, 60, 65, 67.5, 70.
  -- The oldest cannot be a progression (there is nothing before it), so four.
  if (debrief #>> '{anchor,progression_streak}')::int <> 4 then
    raise exception 'anchor.progression_streak: expected 4, got %', debrief -> 'anchor';
  end if;
  if (debrief #>> '{anchor,e1rm_28d}')::numeric <> 93.3 then
    raise exception 'anchor.e1rm_28d: expected 93.3, got %', debrief -> 'anchor';
  end if;
  if (debrief #>> '{anchor,e1rm_before_28d}')::numeric <> 73.3 then
    raise exception 'anchor.e1rm_before_28d: expected 73.3, got %', debrief -> 'anchor';
  end if;
  if debrief #>> '{low_band,muscle}' <> 'calves' then
    raise exception 'debrief.low_band: expected calves, got %', debrief -> 'low_band';
  end if;

  -- The blocks themselves, printed. `evals/fixtures/*.json` are supposed to be
  -- GOLDEN — the shape the SQL really returns, not a hand-written guess that
  -- drifts the first time a key is renamed. Printing them here is how they get
  -- regenerated: run the suite, copy the block, paste it into the fixture.
  raise notice 'FIXTURE session_brief %', brief;
  raise notice 'FIXTURE session_debrief %', debrief;

  -- A workout id that is not theirs must return an empty block rather than an
  -- error or, far worse, someone else's session. RLS is what makes that true;
  -- this is the assertion that says so.
  debrief := public.session_debrief(gen_random_uuid());
  if (debrief -> 'found')::boolean then
    raise exception 'session_debrief accepted a foreign workout id';
  end if;
  if (debrief -> 'sets')::int <> 0 or debrief -> 'anchor' <> 'null'::jsonb then
    raise exception 'session_debrief leaked data for an unknown id: %', debrief;
  end if;

  -- ── weekly_review() ──────────────────────────────────────────────────────
  review := public.weekly_review();

  if (review #>> '{adherence,sessions_this_week}')::int <> 1 then
    raise exception 'adherence.sessions_this_week: got %', review -> 'adherence';
  end if;
  if (review #>> '{adherence,sessions_prev_week}')::int <> 1 then
    raise exception 'adherence.sessions_prev_week: got %', review -> 'adherence';
  end if;
  -- Eight sessions inside 56 days, over eight weeks.
  if (review #>> '{adherence,avg_sessions_per_week_8w}')::numeric <> 1.0 then
    raise exception 'adherence.avg: expected 1.0, got %', review -> 'adherence';
  end if;
  if (review #>> '{adherence,weeks_trained_of_8}')::int <> 8 then
    raise exception 'adherence.weeks_trained_of_8: expected 8, got %', review -> 'adherence';
  end if;
  if (review #>> '{adherence,sessions_last_28}')::int <> 4 then
    raise exception 'adherence.sessions_last_28: expected 4, got %', review -> 'adherence';
  end if;
  -- Two of the four ran from a routine; the other two were freestyle. This is
  -- the honest half of "planned vs done" — see the header of 0021.
  if (review #>> '{adherence,from_routine_last_28}')::int <> 2 then
    raise exception 'adherence.from_routine_last_28: expected 2, got %', review -> 'adherence';
  end if;
  if (review #>> '{adherence,longest_gap_days_28}')::int <> 7 then
    raise exception 'adherence.longest_gap_days_28: expected 7, got %', review -> 'adherence';
  end if;

  if jsonb_array_length(review -> 'bands') <> 3 then
    raise exception 'bands: expected 3 groups, got %', review -> 'bands';
  end if;
  if review #>> '{bands,0,muscle}' <> 'calves'
     or review #>> '{bands,0,status}' <> 'under'
     or (review #>> '{bands,0,sets_prev}')::int <> 2 then
    raise exception 'bands[0]: got %', review -> 'bands';
  end if;
  if review #>> '{bands,2,muscle}' <> 'back'
     or (review #>> '{bands,2,sets}')::int <> 3 then
    raise exception 'bands[2]: got %', review -> 'bands';
  end if;

  -- The squat: six sessions, 140x3 every time, so the fitted slope is exactly
  -- zero and it flags. The pulldown has five sessions and climbs, so it must
  -- NOT flag — a plateau list that catches a lift going up is worse than none.
  if jsonb_array_length(review -> 'plateaus') <> 1 then
    raise exception 'plateaus: expected exactly 1, got %', review -> 'plateaus';
  end if;
  if review #>> '{plateaus,0,exercise}' <> 'ZZ Test Squat'
     or (review #>> '{plateaus,0,sessions}')::int <> 6
     or (review #>> '{plateaus,0,slope_per_session}')::numeric <> 0
     or (review #>> '{plateaus,0,first_e1rm}')::numeric <> 154.0
     or (review #>> '{plateaus,0,last_e1rm}')::numeric <> 154.0 then
    raise exception 'plateaus[0]: got %', review -> 'plateaus';
  end if;

  -- The pulldown is the one lift with a best inside 28 days AND a best before
  -- it: 93.3 against 73.3.
  if jsonb_array_length(review -> 'wins') <> 1 then
    raise exception 'wins: expected 1, got %', review -> 'wins';
  end if;
  if review #>> '{wins,0,exercise}' <> 'ZZ Test Pulldown'
     or (review #>> '{wins,0,gain}')::numeric <> 20.0 then
    raise exception 'wins[0]: got %', review -> 'wins';
  end if;

  if (review -> 'total_sets_90d')::int <> 19 then
    raise exception 'review.total_sets_90d: expected 19, got %', review -> 'total_sets_90d';
  end if;

  -- One recommendation, chosen in SQL. They are turning up (1 session against
  -- a 1.0 average), so adherence does not fire; calves at zero is the worst
  -- band and outranks the squat plateau.
  if review #>> '{recommendation,kind}' <> 'raise_band'
     or review #>> '{recommendation,muscle}' <> 'calves'
     or (review #>> '{recommendation,sets}')::int <> 0 then
    raise exception 'recommendation: got %', review -> 'recommendation';
  end if;

  raise notice 'FIXTURE weekly_review %', review;

  -- ── The privacy boundary ─────────────────────────────────────────────────
  -- `checkBlockPrivacy()` asserts this against fixtures in CI; this asserts it
  -- against the SQL itself, which is the only place it can actually change.
  -- The lifter's own id and email are in the database and must appear in none
  -- of the three blocks.
  procedure_note := brief::text || debrief::text || review::text;
  if procedure_note like '%' || u::text || '%' then
    raise exception 'a coach block leaked the user id';
  end if;
  if procedure_note like '%@example.invalid%' then
    raise exception 'a coach block leaked an email address';
  end if;

  -- ── The empty account ────────────────────────────────────────────────────
  -- Two real users hit the no-data path on 2026-08-05 and it cost them a
  -- week's quota. Every block must survive a history of nothing without
  -- raising, so the surfaces can render their empty state instead of an error.
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  brief := public.session_brief();
  review := public.weekly_review();
  if (brief -> 'total_sets_90d')::int <> 0
     or brief -> 'target' <> 'null'::jsonb
     or brief -> 'due_routine' <> 'null'::jsonb
     or brief -> 'low_bands' <> '[]'::jsonb then
    raise exception 'empty account brief is not empty: %', brief;
  end if;
  if (review #>> '{adherence,sessions_this_week}')::int <> 0
     or review -> 'plateaus' <> '[]'::jsonb
     or review -> 'wins' <> '[]'::jsonb
     or review #>> '{recommendation,kind}' <> 'start_again' then
    raise exception 'empty account review is wrong: %', review;
  end if;

  raise notice 'coach_surfaces: all assertions passed';
end
$$;


-- ── Privileges, asserted rather than assumed ─────────────────────────────────
--
-- CLAUDE.md: "A test that asserts behaviour will never catch a grant that reads
-- correctly and does nothing. Assert the privilege." Nothing in this repo did,
-- and on 2026-08-22 that cost a real defect: 0030 shipped `public.e1rm` with
-- `revoke execute ... from anon` and left it anon-callable, because a new
-- function also carries Postgres's own default grant to PUBLIC (the
-- `=X/postgres` entry with an empty grantee) and anon resolves through it.
--
-- `0007_progress_analytics.sql:122` had the rule right and 0028 overwrote it
-- with a wrong explanation. The lesson is not "write better comments", it is
-- that no comment is load-bearing once the end state is asserted.
--
-- `scripts/pg_shim.sql` mirrors both grants (Postgres's PUBLIC default plus the
-- platform's `alter default privileges ... to anon, authenticated`), so this
-- runs against the same privilege model production has.

-- ── 1. Named functions, in both directions ──────────────────────────────────
do $$
declare
  fn text;
  -- Signed-out callers have no business here. Each either writes, or reads one
  -- person's history, or is arithmetic the API has no reason to expose.
  --
  -- `resolve_invite` is deliberately NOT in this list: an invite link is how
  -- somebody arrives before they have an account, so anon EXECUTE is the point.
  -- Migration 0011 grants it and 0028 records why.
  denied constant text[] := array[
    'public.e1rm(numeric,integer)',
    'public.body_overview(integer)',
    'public.strength_forecast()',
    'public.upsert_user_preference(text,text)',
    'public.social_feed(integer,timestamptz)',
    'public.weekly_leaderboard()'
  ];
begin
  foreach fn in array denied loop
    if has_function_privilege('anon', fn::regprocedure, 'EXECUTE') then
      raise exception 'anon can EXECUTE %, which is the 0030 defect', fn;
    end if;
    -- The opposite bug, and the one a panicked over-revoke produces: a function
    -- locked so hard the app cannot call it either.
    if not has_function_privilege('authenticated', fn::regprocedure, 'EXECUTE') then
      raise exception 'authenticated CANNOT execute %, which breaks the app', fn;
    end if;
  end loop;
end
$$;

-- ── 2. The check that would actually have caught 0030 ───────────────────────
--
-- The list above is a REGRESSION guard. It protects six functions somebody
-- already thought about, and `e1rm` was not on any list the day it shipped
-- open: a named-function assertion cannot catch the next new function, which is
-- exactly the shape of every instance of this bug so far.
--
-- So this one inverts it. Every function in `public` that still carries the
-- PUBLIC grant must be one we have already looked at and left alone. A new
-- function lands here BY DEFAULT, so the default is now a failing test.
--
-- `coalesce(proacl, acldefault(...))` because a null `proacl` means "untouched
-- defaults", which includes the PUBLIC grant; `aclexplode` on null returns no
-- rows and would read as clean.
do $$
declare
  leaked text;
  -- Grandfathered, not endorsed. These nine predate the check and are all
  -- `security invoker` behind RLS, so an anonymous call returns zero rows
  -- rather than data. Three are trigger functions that are never reachable as
  -- an RPC at all. Cleaning them up is a change to auth and therefore Ameen's
  -- call under plan §2.6, not something to slip into a test commit.
  known constant text[] := array[
    'exercise_1rm_history(uuid)',
    'exercise_bests(uuid)',
    'exercise_records(uuid)',
    'exercise_usage()',
    'previous_session(uuid,uuid)',
    'weekly_streak(text)',
    'workout_sets_pr_flags_insert()',
    'workout_sets_pr_flags_rebuild()',
    'workout_sets_pr_flags_trigger()'
  ];
begin
  select string_agg(x.fn, ', ' order by x.fn) into leaked
  from (
    select p.oid::regprocedure::text as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      -- Extension-owned functions are excluded, and finding out why is half the
      -- value of this check. `scripts/pg_shim.sql` installs pgcrypto into
      -- `public`, so the first run flagged all 35 of its functions plus
      -- `gen_random_uuid`. Revoking those would break `gen_random_uuid()`, which
      -- is the DEFAULT on nearly every primary key in this schema.
      --
      -- It also means local and production differ here: Supabase puts pgcrypto
      -- in the `extensions` schema, so production never had them in `public` at
      -- all. `deptype = 'e'` is the portable way to say "this belongs to an
      -- extension, not to us" and is correct under both layouts.
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.deptype = 'e'
      )
      and exists (
        select 1
        from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE'
      )
  ) x
  where x.fn <> all (known);

  if leaked is not null then
    raise exception
      'new function(s) still carry the PUBLIC execute grant: %. This is how 0030 shipped e1rm open. Add `revoke execute on function ... from public, anon;` to the migration, then grant back what the app needs.',
      leaked;
  end if;

  raise notice 'privileges: all assertions passed';
end
$$;

rollback;
