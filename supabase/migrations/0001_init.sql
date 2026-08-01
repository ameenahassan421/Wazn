-- Workout tracker — slice 1 schema.
-- Run this once in the Supabase SQL editor (or via `supabase db push`).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscle_group text not null check (muscle_group in (
    'chest', 'back', 'shoulders', 'biceps', 'triceps',
    'quads', 'hamstrings', 'glutes', 'calves', 'core', 'cardio'
  )),
  equipment text not null,
  is_custom boolean not null default false,
  owner_id uuid references auth.users (id) on delete cascade
);

-- Seeded exercises (owner_id is null) are globally unique by name.
create unique index if not exists exercises_seeded_name_key
  on public.exercises (name) where owner_id is null;

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text,
  started_at timestamptz not null,
  ended_at timestamptz
);

-- Import idempotency key: one workout per (user, start time).
create unique index if not exists workouts_user_started_at_key
  on public.workouts (user_id, started_at);

create index if not exists workouts_user_started_at_desc_idx
  on public.workouts (user_id, started_at desc);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  set_number integer not null,
  weight_kg numeric(6, 2),
  reps integer,
  rpe numeric(3, 1),
  duration_seconds integer,
  distance_meters integer,
  set_type text not null default 'normal'
    check (set_type in ('normal', 'warmup', 'failure'))
);

create index if not exists workout_sets_workout_idx
  on public.workout_sets (workout_id);

create index if not exists workout_sets_exercise_idx
  on public.workout_sets (exercise_id);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_sets enable row level security;

-- profiles: owner only.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- exercises: every authenticated user reads the seeded catalogue plus their own.
-- v1 has no custom exercise creation, so there is no insert/update/delete policy.
drop policy if exists exercises_select_visible on public.exercises;
create policy exercises_select_visible on public.exercises
  for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));

-- workouts: owner only.
drop policy if exists workouts_select_own on public.workouts;
create policy workouts_select_own on public.workouts
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists workouts_insert_own on public.workouts;
create policy workouts_insert_own on public.workouts
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists workouts_update_own on public.workouts;
create policy workouts_update_own on public.workouts
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists workouts_delete_own on public.workouts;
create policy workouts_delete_own on public.workouts
  for delete to authenticated using (user_id = (select auth.uid()));

-- workout_sets: reachable only through a workout the user owns.
drop policy if exists workout_sets_select_own on public.workout_sets;
create policy workout_sets_select_own on public.workout_sets
  for select to authenticated using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_sets.workout_id and w.user_id = (select auth.uid())
    )
  );

drop policy if exists workout_sets_insert_own on public.workout_sets;
create policy workout_sets_insert_own on public.workout_sets
  for insert to authenticated with check (
    exists (
      select 1 from public.workouts w
      where w.id = workout_sets.workout_id and w.user_id = (select auth.uid())
    )
  );

drop policy if exists workout_sets_update_own on public.workout_sets;
create policy workout_sets_update_own on public.workout_sets
  for update to authenticated using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_sets.workout_id and w.user_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from public.workouts w
      where w.id = workout_sets.workout_id and w.user_id = (select auth.uid())
    )
  );

drop policy if exists workout_sets_delete_own on public.workout_sets;
create policy workout_sets_delete_own on public.workout_sets
  for delete to authenticated using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_sets.workout_id and w.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Profile bootstrap: every auth user gets a profile row on sign up.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Read helpers. All are security invoker, so RLS still applies to the caller.
-- ---------------------------------------------------------------------------

-- Drives exercise picker ordering: recently used first, then most used.
create or replace function public.exercise_usage()
returns table (exercise_id uuid, set_count bigint, last_used timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select s.exercise_id, count(*) as set_count, max(w.started_at) as last_used
  from public.workout_sets s
  join public.workouts w on w.id = s.workout_id
  group by s.exercise_id;
$$;

-- "Previous session" shown inline above the set input.
create or replace function public.previous_session(
  p_exercise_id uuid,
  p_exclude_workout uuid default null
)
returns table (
  workout_id uuid,
  started_at timestamptz,
  set_number integer,
  weight_kg numeric,
  reps integer,
  set_type text
)
language sql
stable
security invoker
set search_path = public
as $$
  with prev as (
    select w.id, w.started_at
    from public.workouts w
    join public.workout_sets s on s.workout_id = w.id
    where s.exercise_id = p_exercise_id
      and (p_exclude_workout is null or w.id <> p_exclude_workout)
    group by w.id, w.started_at
    order by w.started_at desc
    limit 1
  )
  select p.id, p.started_at, s.set_number, s.weight_kg, s.reps, s.set_type
  from prev p
  join public.workout_sets s on s.workout_id = p.id
  where s.exercise_id = p_exercise_id
  order by s.set_number;
$$;

-- Progress chart: one point per workout, max Epley estimated 1RM across that
-- workout's qualifying sets. Warmups and sets missing weight or reps excluded.
create or replace function public.exercise_1rm_history(p_exercise_id uuid)
returns table (workout_id uuid, started_at timestamptz, best_1rm_kg numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select w.id,
         w.started_at,
         max(s.weight_kg * (1 + s.reps / 30.0)) as best_1rm_kg
  from public.workout_sets s
  join public.workouts w on w.id = s.workout_id
  where s.exercise_id = p_exercise_id
    and s.set_type <> 'warmup'
    and s.weight_kg is not null
    and s.reps is not null
  group by w.id, w.started_at
  order by w.started_at;
$$;
