-- 0026: your own numbers are your own.
--
-- `workouts_select_visible` (0011) reads:
--
--     user_id = (select auth.uid())
--     or (ended_at is not null and private.can_view(user_id))
--
-- That second arm exists for two surfaces — the friends feed and the weekly
-- leaderboard — but it applies to EVERY select on the table, and fifteen of
-- the app's reporting functions read `workouts` with no user predicate of
-- their own, trusting RLS to scope them: session_volume_history,
-- workout_totals, exercise_bests, muscle_group_weekly_sets, weekly_streak,
-- adherence, exercise_records, exercise_rep_distribution, records_ladder,
-- rep_distribution, weekly_band, session_brief, session_debrief,
-- exercise_usage and previous_session. All are SECURITY INVOKER, so all of
-- them see through the permissive arm.
--
-- Nothing leaks today only because `profiles.visibility` defaults to
-- 'private' and `can_view` therefore answers false. The moment one person
-- sets themselves public or followers, their finished workouts start
-- appearing inside other people's History pages, volume charts, streaks and
-- PR comparisons — and `previous_session`, which feeds the mid-workout
-- auto-fill, would hand a lifter a stranger's working weight.
--
-- The fix is not fifteen predicates that must each be remembered again by
-- the sixteenth function. It is to make the table mean "mine" and give the
-- two surfaces that legitimately read other people's training their own
-- explicit gate. After this migration a query that forgets to scope itself
-- returns the caller's rows, which is the safe direction to be wrong in.

-- ── The two surfaces that read other people ─────────────────────────────
--
-- SECURITY DEFINER, so they keep working once the policy below no longer
-- admits anyone else's rows. Both already filter to the caller's follow
-- graph; what they took from RLS was the visibility check, and that is now
-- stated in the query as `private.can_view(w.user_id)`. A private profile
-- you follow stays invisible, which is what the setting has to mean.

create or replace function public.social_feed(p_limit int default 30, p_before timestamptz default null)
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
security definer
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
    and private.can_view(w.user_id)
    and w.user_id in (
      select f.following_id from public.follows f
      where f.follower_id = (select auth.uid())
    )
    and (p_before is null or w.started_at < p_before)
  group by w.id, w.user_id, p.username, p.display_name, w.name, w.started_at, w.ended_at
  order by w.started_at desc
  limit least(greatest(p_limit, 1), 50);
$$;

create or replace function public.weekly_leaderboard()
returns table (
  user_id uuid,
  username text,
  display_name text,
  volume_kg numeric,
  session_count bigint,
  is_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with circle as (
    select (select auth.uid()) as id
    union
    select f.following_id from public.follows f where f.follower_id = (select auth.uid())
  ),
  sessions as (
    select w.id, w.user_id
    from public.workouts w
    where w.ended_at is not null
      and private.can_view(w.user_id)
      and w.started_at >= date_trunc('week', now())
      and w.user_id in (select id from circle)
  )
  select
    c.id,
    p.username,
    p.display_name,
    coalesce(sum(s.weight_kg * s.reps) filter (
      where s.set_type <> 'warmup' and s.weight_kg is not null and s.reps is not null
    ), 0),
    count(distinct sess.id),
    c.id = (select auth.uid())
  from circle c
  join public.profiles p on p.id = c.id
  left join sessions sess on sess.user_id = c.id
  left join public.workout_sets s on s.workout_id = sess.id
  group by c.id, p.username, p.display_name
  order by 4 desc, 5 desc;
$$;

-- Definer functions are only as safe as who may call them.
revoke execute on function public.social_feed(int, timestamptz) from public, anon;
grant execute on function public.social_feed(int, timestamptz) to authenticated;
revoke execute on function public.weekly_leaderboard() from public, anon;
grant execute on function public.weekly_leaderboard() to authenticated;

-- ── The tables mean "mine" again ────────────────────────────────────────

drop policy if exists workouts_select_own on public.workouts;
drop policy if exists workouts_select_visible on public.workouts;
create policy workouts_select_own on public.workouts
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists workout_sets_select_own on public.workout_sets;
drop policy if exists workout_sets_select_visible on public.workout_sets;
create policy workout_sets_select_own on public.workout_sets
  for select to authenticated
  using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_sets.workout_id
        and w.user_id = (select auth.uid())
    )
  );
