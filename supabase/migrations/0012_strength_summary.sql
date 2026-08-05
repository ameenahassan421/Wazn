-- Design v2.1's Progress dashboard adds a strength list: every trained lift
-- with its estimated 1RM and how that has moved over four weeks.
--
-- The delta is deliberately NOT "all-time best now vs all-time best then",
-- because an all-time best can only ever go up and a chart that can only go up
-- says nothing. It is **best in the last 28 days against best in the 28 days
-- before that** — recent form, which can fall, and falling is the signal worth
-- surfacing. That is also why the design specifies a down arrow at all.
--
-- security invoker, so RLS scopes every figure to the caller. Warm-ups and
-- sets missing weight or reps are excluded, matching every other record
-- surface in this app (plan §5).
create or replace function public.strength_summary()
returns table (
  exercise_id uuid,
  name text,
  muscle_group text,
  image_url text,
  last_trained_at timestamptz,
  best_e1rm_kg numeric,
  recent_e1rm_kg numeric,
  previous_e1rm_kg numeric,
  set_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with working as (
    select
      s.exercise_id,
      w.started_at,
      s.weight_kg * (1 + s.reps::numeric / 30) as e1rm
    from public.workout_sets s
    join public.workouts w on w.id = s.workout_id
    where s.set_type <> 'warmup'
      and s.weight_kg is not null
      and s.reps is not null
      and s.reps > 0
  )
  select
    e.id,
    e.name,
    e.muscle_group,
    e.image_url,
    max(k.started_at),
    round(max(k.e1rm), 1),
    round(max(k.e1rm) filter (
      where k.started_at > now() - interval '28 days'
    ), 1),
    round(max(k.e1rm) filter (
      where k.started_at <= now() - interval '28 days'
        and k.started_at > now() - interval '56 days'
    ), 1),
    count(*)
  from working k
  join public.exercises e on e.id = k.exercise_id
  group by e.id, e.name, e.muscle_group, e.image_url
  order by count(*) desc, max(k.started_at) desc;
$$;

comment on function public.strength_summary() is
  'Per-exercise estimated 1RM with 28-day recent form and the 28 days before it, for the calling user only. Ordered most-trained first.';

revoke execute on function public.strength_summary() from public;
grant execute on function public.strength_summary() to authenticated;
