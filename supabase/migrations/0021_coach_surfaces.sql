-- B1/B2: the proactive coach's surfaces, and the numbers behind them.
--
-- The division of labour is the one §2C established and every AI feature here
-- has kept: **SQL computes every figure, the model only writes words.** The
-- three functions below are the whole factual basis for the pre-workout
-- briefing, the post-workout debrief and the weekly review. If a number
-- appears on any of those three surfaces and it is not in one of these three
-- blocks, that is a bug in the Edge Function, not a judgement call.
--
-- FIVE PROPERTIES EVERY FUNCTION HERE HAS, and they are the same five 0019
-- states, because the reasoning has not changed:
--
--  1. `security invoker` — runs as the caller, so RLS scopes every row to
--     their own history.
--  2. **No user id parameter.** `session_debrief` takes a workout id, which is
--     not the same thing: RLS already decides whether that workout is visible,
--     so the worst a forged id can do is return an empty block.
--  3. `set search_path = ''` with fully-qualified names, so nothing in a
--     `public` schema can shadow what they call.
--  4. **Numbers, exercise names and routine names only.** No email, no display
--     name, no user id, no workout name, no user-written note. These bodies
--     are the privacy boundary, and `checkBlockPrivacy()` in
--     `_shared/note-contract.ts` asserts it against real output.
--  5. Every list caps its own row count. A block goes into a prompt, so an
--     unbounded result is an unbounded bill.
--
-- ── ON "PLANNED VS DONE" ────────────────────────────────────────────────────
-- The B2 spec asks the weekly review for "adherence (planned vs done)". There
-- is no plan to compare against: `routines` carry a name, a position and a set
-- list, and nothing anywhere in the schema says which day a routine is meant
-- to fall on or how many sessions a week are intended. Inventing one — "you
-- have 4 routines, so 4 sessions is the plan" — would make the review's very
-- first figure a guess dressed as a measurement, on the one surface whose
-- whole promise is that every number is traceable.
--
-- So adherence is measured against the lifter's **own established cadence**:
-- sessions this week against their 8-week average, weeks trained out of 8, the
-- longest gap, and how much of the last 28 days ran from a routine rather than
-- freestyle. Every one of those is a fact. Logged as a deviation in
-- DECISIONS.md; revisit it the day routines grow a schedule.

-- ── The ledger learns two new words ─────────────────────────────────────────
-- `ai_generations.feature` has been `check (feature in ('coach_notes',
-- 'routine'))` since 0010, and the briefing and the debrief are neither. Left
-- alone, every ledger write from `coach-brief` would fail its check — and
-- because `recordGeneration()` deliberately never throws, that failure would
-- be a console line nobody reads while the two new surfaces ran **completely
-- unmetered**. The quota is derived by counting this table, so a row that
-- cannot land is a limit that does not exist.
--
-- Dropped and recreated rather than added to, because a check constraint has
-- no ALTER form.
alter table public.ai_generations
  drop constraint if exists ai_generations_feature_check;
alter table public.ai_generations
  add constraint ai_generations_feature_check
  check (feature in ('coach_notes', 'routine', 'briefing', 'debrief'));

-- ── The brief cache ─────────────────────────────────────────────────────────
-- One row per user per surface. `basis` is what makes generation lazy, exactly
-- as `coach_notes.basis_workout_at` does: for the briefing it is the newest
-- finished workout's timestamp (nothing has happened, so there is nothing new
-- to say), and for the debrief it is the workout id (a debrief is about one
-- session and can never go stale).
--
-- `text` rather than two typed columns because the two surfaces key on
-- different things and a column that is a timestamp for one row and a uuid for
-- the next is worse than a string that is honestly opaque.
create table if not exists public.coach_briefs (
  user_id uuid not null references auth.users (id) on delete cascade,
  surface text not null check (surface in ('briefing', 'debrief')),
  generated_at timestamptz not null default now(),
  basis text,
  -- Which model actually answered, after any fallback.
  model text not null,
  -- Bumped when the prompt changes, which is far more often than the model
  -- does. A cache hit requires both to match.
  prompt_version text,
  line text not null,
  chip text,
  primary key (user_id, surface)
);

-- `user_id` leads the primary key, so the cascade and every lookup are already
-- indexed. No second index.

alter table public.coach_briefs enable row level security;

drop policy if exists coach_briefs_select_own on public.coach_briefs;
create policy coach_briefs_select_own on public.coach_briefs
  for select to authenticated using ((select auth.uid()) = user_id);

-- No insert/update/delete policy for `authenticated`, same posture as
-- `coach_notes`: a browser that could write this table could put any sentence
-- it liked behind the "AI-generated" label.

-- ── The view ledger ─────────────────────────────────────────────────────────
-- GATE B1 is "≥half of active testers read the briefing without being told it
-- exists", and a gate with no instrument is an opinion. This is the
-- instrument.
--
-- Written by the client, unlike everything else the AI layer stores, because
-- the event being recorded is "this was on screen" and only the client knows.
-- That is safe here in a way it is not for `coach_notes`: a forged row inflates
-- the owner's own telemetry and nothing else. It carries no text.
--
-- `user_id` defaults to `auth.uid()`. Migration 0016 exists because following
-- and liking had shipped with an owner column the client never sent, and
-- neither had ever worked; the fix is a default, not a convention.
create table if not exists public.coach_views (
  id uuid primary key default gen_random_uuid(),
  -- Bare `auth.uid()`, not the `(select auth.uid())` used in the policies
  -- below: a column default may not contain a subquery, and the planner-caching
  -- reason for the wrapper does not apply to a default that runs once per row
  -- anyway. 0016 spells it the same way.
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  surface text not null
    check (surface in ('briefing', 'debrief', 'weekly_review')),
  -- 'view' is exposure — the card rendered. 'dismiss' is the only in-app
  -- signal of attention this design can honestly claim: you cannot dismiss
  -- something you did not look at. Neither is proof of *reading*, and the
  -- gate's second half ("a tester changed a session because of it") is an
  -- exit-interview question on purpose.
  action text not null default 'view' check (action in ('view', 'dismiss')),
  created_at timestamptz not null default now()
);

create index if not exists coach_views_user_surface_idx
  on public.coach_views (user_id, surface, created_at desc);

alter table public.coach_views enable row level security;

drop policy if exists coach_views_select_own on public.coach_views;
create policy coach_views_select_own on public.coach_views
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists coach_views_insert_own on public.coach_views;
create policy coach_views_insert_own on public.coach_views
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- ── The pre-workout briefing's facts ────────────────────────────────────────
-- Everything the idle Log screen can say before a workout starts, in one round
-- trip. The client calls this directly and renders a deterministic skeleton
-- from it immediately; the Edge Function calls the same function again to
-- phrase it. That duplication is deliberate — it is what makes the card
-- survive the model being dark, which §12 requires and prose cannot enforce.
--
-- `next_weight_kg` is the one genuinely opinionated figure, and it is
-- arithmetic rather than judgement: the smallest 2.5 kg step, at the same reps
-- as last time, whose Epley estimate strictly beats the lift's best. 2.5 kg
-- because that is the smallest plate pair on a barbell; a dumbbell rack that
-- jumps in 2 kg will round to something that does not exist, which is why the
-- briefing states the target and never claims it is loadable.
create or replace function public.session_brief()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with finished as (
    select w.id, w.started_at, w.routine_id
    from public.workouts w
    where w.ended_at is not null
  ),
  last_session as (
    select f.started_at from finished f order by f.started_at desc limit 1
  ),
  working as (
    select
      s.exercise_id,
      e.name as exercise_name,
      e.muscle_group,
      s.weight_kg,
      s.reps,
      f.started_at,
      s.weight_kg * (1 + s.reps::numeric / 30) as e1rm
    from public.workout_sets s
    join finished f on f.id = s.workout_id
    join public.exercises e on e.id = s.exercise_id
    where s.set_type <> 'warmup'
      and s.weight_kg is not null
      and s.reps is not null
      and s.reps > 0
  ),
  -- Which routine is due. There is no schedule in the schema, so "due" is
  -- rotation: the routine run least recently, with never-run ones first. It is
  -- a defensible answer to "what is up today" that invents nothing, and the
  -- briefing phrases it as an offer rather than an instruction.
  due as (
    select r.id, r.name, max(f.started_at) as last_run
    from public.routines r
    left join finished f on f.routine_id = r.id
    group by r.id, r.name, r.position
    order by max(f.started_at) asc nulls first, r.position, r.id
    limit 1
  ),
  due_size as (
    select count(*) as n
    from public.routine_exercises re
    where re.routine_id = (select d.id from due d)
  ),
  -- Per exercise: the heaviest working set of its most recent session.
  last_top as (
    select distinct on (k.exercise_id)
      k.exercise_id,
      k.exercise_name,
      k.weight_kg,
      k.reps,
      k.started_at,
      k.e1rm
    from working k
    order by k.exercise_id, k.started_at desc, k.e1rm desc
  ),
  best as (
    select k.exercise_id, max(k.e1rm) as best_e1rm
    from working k
    group by k.exercise_id
  ),
  -- One target, from the first exercise of the due routine the lifter has
  -- actually trained. Falls back to their most-trained lift when there is no
  -- routine at all, because a freestyle lifter deserves a target too.
  target as (
    select
      lt.exercise_name,
      lt.weight_kg,
      lt.reps,
      lt.e1rm,
      b.best_e1rm,
      lt.started_at,
      -- The smallest 2.5 multiple strictly greater than what is required to
      -- beat `best_e1rm` at the same reps. `floor(x/2.5)*2.5 + 2.5` is that
      -- number for every x, including one already sitting exactly on the grid
      -- — which is the case that matters, because it is what "last session was
      -- your best" looks like.
      2.5 * floor(
        greatest(b.best_e1rm / (1 + lt.reps::numeric / 30), lt.weight_kg) / 2.5
      ) + 2.5 as next_weight_kg
    from last_top lt
    join best b on b.exercise_id = lt.exercise_id
    left join public.routine_exercises re
      on re.exercise_id = lt.exercise_id
      and re.routine_id = (select d.id from due d)
    order by
      -- Routine members first, in routine order; then whatever they lift most.
      (re.position is null),
      re.position,
      lt.started_at desc
    limit 1
  ),
  -- Working sets per muscle group over the last 7 days, restricted to groups
  -- that are part of the lifter's programme at all (trained in 28 days). A
  -- "you are low on calves" note aimed at someone who has never trained calves
  -- is the coach inventing a goal for them.
  bands as (
    select
      k.muscle_group,
      count(*) filter (where k.started_at > now() - interval '7 days') as sets_7d
    from working k
    where k.started_at > now() - interval '28 days'
    group by k.muscle_group
  )
  select jsonb_build_object(
    'unit', 'kg',
    'productive_range', jsonb_build_array(10, 20),
    'days_since_last', (
      select floor(
        extract(epoch from now() - ls.started_at) / 86400
      )::int from last_session ls
    ),
    'sessions_last_7', (
      select count(*) from finished f where f.started_at > now() - interval '7 days'
    ),
    'sessions_last_28', (
      select count(*) from finished f where f.started_at > now() - interval '28 days'
    ),
    'total_sets_90d', (
      select count(*) from working k where k.started_at > now() - interval '90 days'
    ),
    'due_routine', (
      select jsonb_build_object(
        'name', d.name,
        'exercises', (select ds.n from due_size ds),
        'days_since_run', case
          when d.last_run is null then null
          else floor(extract(epoch from now() - d.last_run) / 86400)::int
        end
      )
      from due d
    ),
    'target', (
      select jsonb_build_object(
        'exercise', t.exercise_name,
        'last_weight_kg', round(t.weight_kg, 2),
        'last_reps', t.reps,
        'last_e1rm', round(t.e1rm, 1),
        'best_e1rm', round(t.best_e1rm, 1),
        'last_done_days_ago',
          floor(extract(epoch from now() - t.started_at) / 86400)::int,
        'next_weight_kg', round(t.next_weight_kg, 2),
        'next_e1rm', round(t.next_weight_kg * (1 + t.reps::numeric / 30), 1)
      )
      from target t
    ),
    'low_bands', coalesce((
      -- `muscle_group` breaks the tie, and it is not cosmetic: three groups
      -- sitting at zero sets is the common case, and without a second key
      -- Postgres may return them in any order — so the same history would
      -- produce a different block, a different prompt, and a different cached
      -- sentence on every call.
      select jsonb_agg(row_to_json(x) order by x.sets, x.muscle)
      from (
        select b.muscle_group as muscle, b.sets_7d as sets
        from bands b
        where b.sets_7d < 10
        order by b.sets_7d, b.muscle_group
        limit 3
      ) x
    ), '[]'::jsonb)
  );
$$;

comment on function public.session_brief() is
  'Facts for the pre-workout briefing — rotation, one target, band gaps — for the calling user only. Numbers, exercise names and routine names.';

revoke execute on function public.session_brief() from public;
grant execute on function public.session_brief() to authenticated;
grant execute on function public.session_brief() to service_role;

-- ── The post-workout debrief's facts ────────────────────────────────────────
-- The highest-emotion moment in the app, so the figures had better be right.
--
-- `p_workout` is not an identity: RLS decides whether that row is visible, so
-- pointing this at someone else's workout returns a block of nulls rather than
-- their training. That is the same reasoning that lets a model pick 0019's
-- arguments.
create or replace function public.session_debrief(p_workout uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with this_workout as (
    select w.id, w.started_at, w.ended_at
    from public.workouts w
    where w.id = p_workout
  ),
  -- Every finished session, this one included: the debrief runs after Finish,
  -- so excluding it would compare the session against itself minus itself.
  finished as (
    select w.id, w.started_at
    from public.workouts w
    where w.ended_at is not null
  ),
  working as (
    select
      s.exercise_id,
      s.workout_id,
      e.name as exercise_name,
      e.muscle_group,
      s.weight_kg,
      s.reps,
      s.pr_weight,
      s.pr_e1rm,
      f.started_at,
      s.weight_kg * (1 + s.reps::numeric / 30) as e1rm
    from public.workout_sets s
    join finished f on f.id = s.workout_id
    join public.exercises e on e.id = s.exercise_id
    where s.set_type <> 'warmup'
      and s.weight_kg is not null
      and s.reps is not null
      and s.reps > 0
  ),
  todays as (
    select k.* from working k where k.workout_id = p_workout
  ),
  -- The session's anchor: the single best set of it, by estimate. It is the
  -- lift the session was *about*, and it is the only one the debrief speaks
  -- to, because one line cannot carry four.
  --
  -- One ROW, not an aggregate per exercise, and that is the whole point: the
  -- first draft reported `max(weight)` beside the reps of the best-e1RM set,
  -- so a session of 70×10 and 72.5×8 was described as "72.5 × 10" — a set
  -- nobody did. The top set is a set, so it is selected as one.
  anchor as (
    select t.exercise_id, t.exercise_name, t.weight_kg, t.reps, t.e1rm
    from todays t
    order by t.e1rm desc, t.weight_kg desc
    limit 1
  ),
  anchor_sessions as (
    select k.started_at, max(k.e1rm) as e1rm
    from working k
    where k.exercise_id = (select a.exercise_id from anchor a)
    group by k.started_at
  ),
  ranked as (
    select
      s.started_at,
      s.e1rm,
      lag(s.e1rm) over (order by s.started_at) as prev,
      row_number() over (order by s.started_at desc) as rn
    from anchor_sessions s
  ),
  -- How many sessions in a row, counting back from this one, beat the session
  -- before them. The first session a lift ever had cannot be a progression, so
  -- its `prev is null` row terminates the run.
  streak as (
    select coalesce(
      min(r.rn) filter (where r.prev is null or r.e1rm <= r.prev),
      (select count(*) from ranked) + 1
    ) - 1 as n
    from ranked r
  ),
  bands as (
    select
      k.muscle_group,
      count(*) filter (where k.started_at > now() - interval '7 days') as sets_7d
    from working k
    where k.started_at > now() - interval '28 days'
    group by k.muscle_group
  )
  select jsonb_build_object(
    'unit', 'kg',
    'productive_range', jsonb_build_array(10, 20),
    'found', (select count(*) from this_workout) > 0,
    'sets', (select count(*) from todays),
    'exercises', (select count(distinct t.exercise_id) from todays t),
    'volume_kg', coalesce((
      select round(sum(t.weight_kg * t.reps), 1) from todays t
    ), 0),
    'duration_min', (
      select case
        when tw.ended_at is null then null
        else round(extract(epoch from tw.ended_at - tw.started_at) / 60)::int
      end
      from this_workout tw
    ),
    'records', (
      select count(*) from todays t where t.pr_weight or t.pr_e1rm
    ),
    'anchor', (
      select jsonb_build_object(
        'exercise', a.exercise_name,
        'e1rm', round(a.e1rm, 1),
        'top_weight_kg', round(a.weight_kg, 2),
        'top_reps', a.reps,
        'previous_e1rm', (select round(r.prev, 1) from ranked r where r.rn = 1),
        'gain_since_last_e1rm', (
          select round(r.e1rm - r.prev, 1) from ranked r where r.rn = 1
        ),
        'progression_streak', (select s.n from streak s),
        -- Movement over the month, which is the sentence the plan actually
        -- asks for: "5kg on your e1RM this month".
        'e1rm_28d', (
          select round(max(k.e1rm), 1) from working k
          where k.exercise_id = a.exercise_id
            and k.started_at > now() - interval '28 days'
        ),
        'e1rm_before_28d', (
          select round(max(k.e1rm), 1) from working k
          where k.exercise_id = a.exercise_id
            and k.started_at <= now() - interval '28 days'
        )
      )
      from anchor a
    ),
    -- The forward cue. One group, the furthest below the band, and only when
    -- it is a group they train — the debrief is not the place to open a
    -- second front.
    'low_band', (
      select jsonb_build_object('muscle', b.muscle_group, 'sets', b.sets_7d)
      from bands b
      where b.sets_7d < 10
      order by b.sets_7d, b.muscle_group
      limit 1
    )
  );
$$;

comment on function public.session_debrief(uuid) is
  'Facts for the post-workout debrief of one workout, for the calling user only. Numbers and exercise names.';

revoke execute on function public.session_debrief(uuid) from public;
grant execute on function public.session_debrief(uuid) to authenticated;
grant execute on function public.session_debrief(uuid) to service_role;

-- ── The weekly review's facts ───────────────────────────────────────────────
-- B2's review contract, computed. Five sections, the same five every week, and
-- the model's whole job is to say each of them in a sentence.
--
-- The ONE recommendation is chosen HERE, not by the model. "Exactly one
-- recommendation" is a promise about the product, and a promise a model keeps
-- only when asked nicely is not a promise. The priority order is: they stopped
-- turning up > a muscle group is starving > a lift has stalled > nothing is
-- wrong. Each rung is a fact about a bigger problem than the rung below it.
create or replace function public.weekly_review()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with finished as (
    select w.id, w.started_at, w.routine_id
    from public.workouts w
    where w.ended_at is not null
  ),
  working as (
    select
      s.exercise_id,
      e.name as exercise_name,
      e.muscle_group,
      s.weight_kg,
      s.reps,
      s.pr_weight,
      s.pr_e1rm,
      f.started_at,
      s.weight_kg * (1 + s.reps::numeric / 30) as e1rm
    from public.workout_sets s
    join finished f on f.id = s.workout_id
    join public.exercises e on e.id = s.exercise_id
    where s.set_type <> 'warmup'
      and s.weight_kg is not null
      and s.reps is not null
      and s.reps > 0
  ),
  -- ── Adherence ────────────────────────────────────────────────────────────
  sessions_8w as (
    select f.started_at, f.routine_id
    from finished f
    where f.started_at > now() - interval '56 days'
  ),
  adherence as (
    select
      count(*) filter (where s.started_at > now() - interval '7 days') as this_week,
      count(*) filter (
        where s.started_at > now() - interval '14 days'
          and s.started_at <= now() - interval '7 days'
      ) as prev_week,
      round(count(*)::numeric / 8, 1) as avg_per_week_8w,
      count(distinct date_trunc('week', s.started_at)) as weeks_trained_8w,
      count(*) filter (
        where s.routine_id is not null
          and s.started_at > now() - interval '28 days'
      ) as from_routine_28,
      count(*) filter (
        where s.started_at > now() - interval '28 days'
      ) as sessions_28
    from sessions_8w s
  ),
  gap as (
    select coalesce(max(g.days), 0) as longest_gap_days_28
    from (
      select floor(extract(
        epoch from s.started_at - lag(s.started_at) over (order by s.started_at)
      ) / 86400)::int as days
      from finished s
      where s.started_at > now() - interval '28 days'
    ) g
  ),
  -- ── Bands ────────────────────────────────────────────────────────────────
  bands as (
    select
      k.muscle_group,
      count(*) filter (where k.started_at > now() - interval '7 days') as sets,
      count(*) filter (
        where k.started_at > now() - interval '14 days'
          and k.started_at <= now() - interval '7 days'
      ) as sets_prev
    from working k
    where k.started_at > now() - interval '28 days'
    group by k.muscle_group
  ),
  -- ── Plateaus ─────────────────────────────────────────────────────────────
  -- Session-best e1RM per lift, numbered, so a slope can be fitted against
  -- session order rather than against dates. Six sessions is the floor the
  -- spec sets: fewer than that and a flat line is noise.
  lift_sessions as (
    select
      k.exercise_id,
      k.exercise_name,
      k.started_at,
      max(k.e1rm) as e1rm,
      row_number() over (
        partition by k.exercise_id order by k.started_at
      ) as n
    from working k
    where k.started_at > now() - interval '90 days'
    group by k.exercise_id, k.exercise_name, k.started_at
  ),
  plateaus as (
    select
      ls.exercise_name,
      count(*) as sessions,
      round(regr_slope(ls.e1rm, ls.n)::numeric, 2) as slope_per_session,
      round(min(ls.e1rm) filter (where ls.n = 1), 1) as first_e1rm,
      round(max(ls.e1rm) filter (
        where ls.n = (
          select max(x.n) from lift_sessions x where x.exercise_id = ls.exercise_id
        )
      ), 1) as last_e1rm
    from lift_sessions ls
    group by ls.exercise_id, ls.exercise_name
    having count(*) >= 6 and regr_slope(ls.e1rm, ls.n) <= 0
  ),
  -- ── Wins ─────────────────────────────────────────────────────────────────
  wins as (
    select
      k.exercise_name,
      round(max(k.e1rm) filter (
        where k.started_at > now() - interval '28 days'
      ), 1) as e1rm_28d,
      round(max(k.e1rm) filter (
        where k.started_at <= now() - interval '28 days'
      ), 1) as e1rm_before
    from working k
    group by k.exercise_id, k.exercise_name
  ),
  wins_up as (
    select
      w.exercise_name,
      w.e1rm_28d,
      w.e1rm_before,
      round(w.e1rm_28d - w.e1rm_before, 1) as gain
    from wins w
    where w.e1rm_28d is not null
      and w.e1rm_before is not null
      and w.e1rm_28d > w.e1rm_before
  ),
  -- ── The one recommendation ───────────────────────────────────────────────
  worst_band as (
    select b.muscle_group, b.sets
    from bands b
    where b.sets < 10
    order by b.sets, b.muscle_group
    limit 1
  ),
  worst_plateau as (
    select p.exercise_name, p.sessions, p.slope_per_session, p.first_e1rm, p.last_e1rm
    from plateaus p
    order by p.sessions desc, p.slope_per_session, p.exercise_name
    limit 1
  ),
  best_win as (
    select w.exercise_name, w.gain from wins_up w order by w.gain desc limit 1
  ),
  recommendation as (
    select case
      -- Nothing at all in the window: the review has no business recommending
      -- a change to training that is not happening.
      when (select a.sessions_28 from adherence a) = 0 then jsonb_build_object(
        'kind', 'start_again',
        'sessions_28', 0
      )
      -- Turning up is upstream of everything else, so it is checked first: a
      -- band recommendation aimed at someone who trained once this week is
      -- advice about the wrong problem.
      when (select a.this_week from adherence a) <
           (select a.avg_per_week_8w from adherence a) - 1
        then jsonb_build_object(
          'kind', 'add_sessions',
          'this_week', (select a.this_week from adherence a),
          'avg_per_week_8w', (select a.avg_per_week_8w from adherence a)
        )
      when exists (select 1 from worst_band) then jsonb_build_object(
        'kind', 'raise_band',
        'muscle', (select wb.muscle_group from worst_band wb),
        'sets', (select wb.sets from worst_band wb)
      )
      when exists (select 1 from worst_plateau) then jsonb_build_object(
        'kind', 'break_plateau',
        'exercise', (select wp.exercise_name from worst_plateau wp),
        'sessions', (select wp.sessions from worst_plateau wp),
        'first_e1rm', (select wp.first_e1rm from worst_plateau wp),
        'last_e1rm', (select wp.last_e1rm from worst_plateau wp)
      )
      else jsonb_build_object(
        'kind', 'hold',
        'exercise', (select bw.exercise_name from best_win bw),
        'gain', (select bw.gain from best_win bw)
      )
    end as body
  )
  select jsonb_build_object(
    'unit', 'kg',
    'window_days', 90,
    'productive_range', jsonb_build_array(10, 20),
    'plateau_min_sessions', 6,
    'adherence', (
      select jsonb_build_object(
        'sessions_this_week', a.this_week,
        'sessions_prev_week', a.prev_week,
        'avg_sessions_per_week_8w', a.avg_per_week_8w,
        'weeks_trained_of_8', a.weeks_trained_8w,
        'sessions_last_28', a.sessions_28,
        'from_routine_last_28', a.from_routine_28,
        'longest_gap_days_28', (select g.longest_gap_days_28 from gap g)
      )
      from adherence a
    ),
    'bands', coalesce((
      select jsonb_agg(row_to_json(x) order by x.sets, x.muscle)
      from (
        select
          b.muscle_group as muscle,
          b.sets,
          b.sets_prev,
          case
            when b.sets < 10 then 'under'
            when b.sets > 20 then 'over'
            else 'in'
          end as status
        from bands b
        order by b.sets, b.muscle_group
        limit 12
      ) x
    ), '[]'::jsonb),
    'plateaus', coalesce((
      select jsonb_agg(row_to_json(x) order by x.sessions desc)
      from (
        select
          p.exercise_name as exercise,
          p.sessions,
          p.slope_per_session,
          p.first_e1rm,
          p.last_e1rm
        from plateaus p
        order by p.sessions desc, p.exercise_name
        limit 5
      ) x
    ), '[]'::jsonb),
    'wins', coalesce((
      select jsonb_agg(row_to_json(x) order by x.gain desc)
      from (
        select w.exercise_name as exercise, w.e1rm_28d, w.e1rm_before, w.gain
        from wins_up w
        order by w.gain desc, w.exercise_name
        limit 5
      ) x
    ), '[]'::jsonb),
    'records_last_7', (
      select count(*) from working k
      where (k.pr_weight or k.pr_e1rm)
        and k.started_at > now() - interval '7 days'
    ),
    'total_sets_90d', (
      select count(*) from working k where k.started_at > now() - interval '90 days'
    ),
    'recommendation', (select r.body from recommendation r)
  );
$$;

comment on function public.weekly_review() is
  'The structured weekly review''s figures — adherence, bands, plateaus, wins and the one recommendation — for the calling user only. Numbers and exercise names.';

revoke execute on function public.weekly_review() from public;
grant execute on function public.weekly_review() to authenticated;
grant execute on function public.weekly_review() to service_role;
