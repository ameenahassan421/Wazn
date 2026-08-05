-- Design v2.1's feed card carries a "fact line" quoting the best moment of the
-- session — "Bench Press — new e1RM 142 lb". That is one more column, not one
-- more query: adding it to social_feed keeps the feed at a single round trip.
--
-- Everything else about the function is unchanged, including the part that
-- matters: it is `security invoker` and contains no visibility logic of its
-- own. The policies on `workouts` and `workout_sets` decide what it can see,
-- so a fact line can never quote a session the reader is not allowed to read.
-- `create or replace` cannot widen a function's OUT parameters, so the old
-- signature is dropped first. Safe here because nothing in Postgres depends on
-- it — the client calls it over PostgREST by name, and the grant is
-- re-established below in the same migration.
drop function if exists public.social_feed(int, timestamptz);

create function public.social_feed(p_limit int default 30, p_before timestamptz default null)
returns table (
  workout_id uuid,
  user_id uuid,
  username text,
  display_name text,
  name text,
  started_at timestamptz,
  ended_at timestamptz,
  volume_kg numeric,
  set_count bigint,
  record_count bigint,
  like_count bigint,
  liked_by_me boolean,
  best_record_name text,
  best_record_e1rm_kg numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    w.id,
    w.user_id,
    p.username,
    p.display_name,
    w.name,
    w.started_at,
    w.ended_at,
    coalesce(sum(s.weight_kg * s.reps) filter (
      where s.set_type <> 'warmup' and s.weight_kg is not null and s.reps is not null
    ), 0),
    count(s.id),
    count(s.id) filter (where s.pr_weight or s.pr_e1rm),
    (select count(*) from public.workout_likes l where l.workout_id = w.id),
    exists (
      select 1 from public.workout_likes l
      where l.workout_id = w.id and l.user_id = (select auth.uid())
    ),
    -- The single best record of the session, by estimated 1RM. A lateral
    -- rather than a window because it is one row out of a handful and the
    -- group-by above is already doing the heavy lifting.
    (
      select e.name
      from public.workout_sets r
      join public.exercises e on e.id = r.exercise_id
      where r.workout_id = w.id
        and (r.pr_weight or r.pr_e1rm)
        and r.weight_kg is not null and r.reps is not null
      order by r.weight_kg * (1 + r.reps::numeric / 30) desc
      limit 1
    ),
    (
      select round(max(r.weight_kg * (1 + r.reps::numeric / 30)), 1)
      from public.workout_sets r
      where r.workout_id = w.id
        and (r.pr_weight or r.pr_e1rm)
        and r.weight_kg is not null and r.reps is not null
    )
  from public.workouts w
  join public.profiles p on p.id = w.user_id
  left join public.workout_sets s on s.workout_id = w.id
  where w.ended_at is not null
    and w.user_id in (
      select f.following_id from public.follows f
      where f.follower_id = (select auth.uid())
    )
    and (p_before is null or w.started_at < p_before)
  group by w.id, w.user_id, p.username, p.display_name, w.name, w.started_at, w.ended_at
  order by w.started_at desc
  limit least(greatest(p_limit, 1), 50);
$$;

revoke execute on function public.social_feed(int, timestamptz) from public;
grant execute on function public.social_feed(int, timestamptz) to authenticated;
