-- Per-exercise bests for PR detection at the end of a workout.
--
-- Excludes one workout by design: the workout being summarised must not be
-- compared against itself, or every set is a PR the first time an exercise is
-- logged. Warmups and sets missing weight or reps are excluded per plan §5.
--
-- security invoker, so RLS scopes it to the caller's own history.

create or replace function public.exercise_bests(p_exclude_workout uuid default null)
returns table (exercise_id uuid, best_weight_kg numeric, best_e1rm_kg numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    s.exercise_id,
    max(s.weight_kg) as best_weight_kg,
    max(s.weight_kg * (1 + s.reps / 30.0)) as best_e1rm_kg
  from public.workout_sets s
  join public.workouts w on w.id = s.workout_id
  where s.set_type <> 'warmup'
    and s.weight_kg is not null
    and s.reps is not null
    and (p_exclude_workout is null or s.workout_id <> p_exclude_workout)
  group by s.exercise_id;
$$;
