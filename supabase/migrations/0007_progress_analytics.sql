-- Progress: the data behind the Strength, Volume and Balance sub-tabs.
--
-- All four are security invoker, so RLS still applies to the caller and a
-- user only ever aggregates their own sets — same contract as the three
-- helpers in 0001. Aggregating server-side rather than pulling raw sets to
-- the client matters here: the Volume tab covers the whole training history,
-- which is already 3,200 rows for one user.
--
-- Warm-ups and sets missing weight or reps are excluded everywhere, matching
-- exercise_1rm_history and the Epley footnote the Progress tab shows.

-- Working-set rep counts for one lift, bucketed the way lifters think about
-- them. Buckets are returned even when empty so the chart keeps five bars.
--
-- The ordinal is `bucket_order`, not `position`: POSITION is a reserved word
-- in Postgres (it is SQL-standard string function syntax), and using it as a
-- column name is a parse error rather than a runtime one.
create or replace function public.exercise_rep_distribution(p_exercise_id uuid)
returns table (bucket text, bucket_order int, set_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with buckets(bucket, bucket_order, lo, hi) as (
    values ('1–5', 1, 1, 5),
           ('6–8', 2, 6, 8),
           ('9–12', 3, 9, 12),
           ('13–15', 4, 13, 15),
           ('16+', 5, 16, 1000)
  )
  select b.bucket,
         b.bucket_order,
         count(s.id) as set_count
  from buckets b
  left join public.workout_sets s
    on s.exercise_id = p_exercise_id
   and s.set_type <> 'warmup'
   and s.reps is not null
   and s.weight_kg is not null
   and s.reps between b.lo and b.hi
  group by b.bucket, b.bucket_order
  order by b.bucket_order;
$$;

-- One row per finished workout: when it happened and how much was moved.
-- Sessions-per-week, monthly volume, the workload scatter and the training
-- calendar are all derived from this single series on the client, so the
-- Volume tab costs one round trip rather than four.
create or replace function public.session_volume_history()
returns table (
  workout_id uuid,
  started_at timestamptz,
  volume_kg numeric,
  set_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select w.id,
         w.started_at,
         coalesce(sum(s.weight_kg * s.reps), 0) as volume_kg,
         count(s.id) as set_count
  from public.workouts w
  left join public.workout_sets s
    on s.workout_id = w.id
   and s.set_type <> 'warmup'
   and s.weight_kg is not null
   and s.reps is not null
  where w.ended_at is not null
  group by w.id, w.started_at
  order by w.started_at;
$$;

-- Working sets per muscle group over a trailing window, for the 10-20 set
-- productive band. Default is the last 7 days; the caller passes the window
-- so "this week" can mean whatever the UI means by it.
create or replace function public.muscle_group_weekly_sets(p_days int default 7)
returns table (muscle_group text, set_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select e.muscle_group::text,
         count(s.id) as set_count
  from public.workout_sets s
  join public.workouts w on w.id = s.workout_id
  join public.exercises e on e.id = s.exercise_id
  where s.set_type <> 'warmup'
    and s.reps is not null
    and w.started_at >= now() - make_interval(days => greatest(p_days, 1))
  group by e.muscle_group
  order by count(s.id) desc;
$$;

-- Best estimated 1RM per exercise, all time. The Balance tab picks its four
-- anchor lifts out of this by name on the client, which keeps the lift
-- names — a presentation choice that has already changed once — out of SQL.
create or replace function public.exercise_best_e1rm()
returns table (exercise_id uuid, name text, best_e1rm_kg numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select e.id,
         e.name,
         max(s.weight_kg * (1 + s.reps / 30.0)) as best_e1rm_kg
  from public.workout_sets s
  join public.exercises e on e.id = s.exercise_id
  where s.set_type <> 'warmup'
    and s.weight_kg is not null
    and s.reps is not null
  group by e.id, e.name;
$$;

-- Same posture as 0006: these are called by signed-in users through PostgREST
-- and rely on the caller's RLS, so authenticated needs execute and anon does
-- not. revoke from public first, since functions are created with execute
-- granted to public by default.
revoke execute on function public.exercise_rep_distribution(uuid) from public, anon;
revoke execute on function public.session_volume_history() from public, anon;
revoke execute on function public.muscle_group_weekly_sets(int) from public, anon;
revoke execute on function public.exercise_best_e1rm() from public, anon;

grant execute on function public.exercise_rep_distribution(uuid) to authenticated;
grant execute on function public.session_volume_history() to authenticated;
grant execute on function public.muscle_group_weekly_sets(int) to authenticated;
grant execute on function public.exercise_best_e1rm() to authenticated;
