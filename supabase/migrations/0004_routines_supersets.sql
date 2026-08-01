-- Stage 1: routines, supersets, and per-exercise rest defaults.
--
-- Design notes:
--
-- Supersets are a group id on the SET, not on a routine or a separate table.
-- A superset is a property of how sets were performed in a given workout —
-- the same two exercises can be supersetted one day and not the next. Putting
-- it on the set keeps freestyle logging and routine-driven logging identical,
-- and lets the Hevy CSV's superset_id backfill straight in (335 rows, 3 groups).
--
-- Routines mirror the workout shape (routine -> exercises -> planned sets)
-- rather than storing a JSON blob, so "pre-fill from last performance" is a
-- join and not a parse, and a routine can be edited one set at a time.

-- ---------------------------------------------------------------------------
-- Supersets and rest defaults on existing tables
-- ---------------------------------------------------------------------------

-- Sets sharing a group id within one workout were performed alternating.
-- Nullable: the overwhelming majority of sets are not supersetted.
alter table public.workout_sets
  add column if not exists superset_group smallint;

create index if not exists workout_sets_superset_idx
  on public.workout_sets (workout_id, superset_group)
  where superset_group is not null;

-- Per-exercise rest default, in seconds. Null means "use the app default".
-- Lives on the exercise because rest is a property of the movement (a heavy
-- squat needs longer than a curl), and Stage 1 wants it remembered per lift.
alter table public.exercises
  add column if not exists default_rest_seconds integer
  check (default_rest_seconds is null or default_rest_seconds between 0 and 3600);

-- ---------------------------------------------------------------------------
-- Routines
-- ---------------------------------------------------------------------------

create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists routines_user_position_idx
  on public.routines (user_id, position, created_at);

create table if not exists public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  position integer not null,
  superset_group smallint,
  notes text
);

create index if not exists routine_exercises_routine_idx
  on public.routine_exercises (routine_id, position);

-- Planned sets. weight_kg and reps are nullable because a routine may say
-- "3 sets of bench" without prescribing a load — the UI then pre-fills from
-- the last actual performance instead.
create table if not exists public.routine_sets (
  id uuid primary key default gen_random_uuid(),
  routine_exercise_id uuid not null
    references public.routine_exercises (id) on delete cascade,
  set_number integer not null,
  weight_kg numeric(6, 2),
  reps integer,
  set_type text not null default 'normal'
    check (set_type in ('normal', 'warmup', 'failure', 'drop'))
);

create index if not exists routine_sets_exercise_idx
  on public.routine_sets (routine_exercise_id, set_number);

-- Which routine a workout came from, if any. Null for freestyle, which stays
-- a first-class path per Stage 1 ("freestyle still works"). on delete set null
-- so deleting a routine never destroys logged history.
alter table public.workouts
  add column if not exists routine_id uuid
  references public.routines (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Row level security — owner only, same shape as workouts/workout_sets
-- ---------------------------------------------------------------------------

alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.routine_sets enable row level security;

drop policy if exists routines_select_own on public.routines;
create policy routines_select_own on public.routines
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists routines_insert_own on public.routines;
create policy routines_insert_own on public.routines
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists routines_update_own on public.routines;
create policy routines_update_own on public.routines
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists routines_delete_own on public.routines;
create policy routines_delete_own on public.routines
  for delete to authenticated using (user_id = (select auth.uid()));

-- routine_exercises and routine_sets inherit ownership through the routine.
drop policy if exists routine_exercises_all_own on public.routine_exercises;
create policy routine_exercises_all_own on public.routine_exercises
  for all to authenticated
  using (
    exists (
      select 1 from public.routines r
      where r.id = routine_exercises.routine_id and r.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.routines r
      where r.id = routine_exercises.routine_id and r.user_id = (select auth.uid())
    )
  );

drop policy if exists routine_sets_all_own on public.routine_sets;
create policy routine_sets_all_own on public.routine_sets
  for all to authenticated
  using (
    exists (
      select 1
      from public.routine_exercises re
      join public.routines r on r.id = re.routine_id
      where re.id = routine_sets.routine_exercise_id
        and r.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.routine_exercises re
      join public.routines r on r.id = re.routine_id
      where re.id = routine_sets.routine_exercise_id
        and r.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Weekly streak, computed server-side.
--
-- A "week" is Monday-based in the caller's timezone, which has to be passed in:
-- the server has no idea where the user is, and getting this wrong by a few
-- hours silently breaks a streak the user believes they kept.
-- ---------------------------------------------------------------------------

create or replace function public.weekly_streak(p_timezone text default 'UTC')
returns table (weeks integer, current_week_sessions integer)
language sql
stable
security invoker
set search_path = public
as $$
  with weeks_logged as (
    select distinct
      date_trunc('week', (w.started_at at time zone p_timezone))::date as wk,
      count(*) over (
        partition by date_trunc('week', (w.started_at at time zone p_timezone))
      ) as sessions
    from public.workouts w
    where w.ended_at is not null
  ),
  this_week as (
    select date_trunc('week', (now() at time zone p_timezone))::date as wk
  ),
  -- Consecutive weeks ending at the current one: rank descending and keep
  -- rows whose gap from "this week" matches their position in the run.
  ranked as (
    select
      wl.wk,
      wl.sessions,
      row_number() over (order by wl.wk desc) as rn,
      ((select wk from this_week) - wl.wk) / 7 as weeks_ago
    from weeks_logged wl
    where wl.wk <= (select wk from this_week)
  )
  select
    coalesce(max(rn) filter (where weeks_ago = rn - 1), 0)::integer as weeks,
    coalesce(
      (select sessions from ranked where weeks_ago = 0 limit 1), 0
    )::integer as current_week_sessions
  from ranked
  where weeks_ago = rn - 1;
$$;
