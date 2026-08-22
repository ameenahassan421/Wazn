-- 0030: three defects the simulator and a peer audit found on 2026-08-21, and
-- one column the Crew work needs.
--
-- 1. `public.e1rm(weight, reps)`. Ten live functions inline the Epley formula at
--    fourteen sites, which means the estimate a lifter sees has ten definitions
--    that only happen to agree. This migration creates the function and adopts
--    it in `weekly_review` only. The other nine are a mechanical sweep with a
--    trigger function among them, and they get their own migration where the
--    diff can be read as pure refactor.
--
--    **It is deliberately behaviour-identical, with no rep ceiling.** Epley is
--    unreliable above about ten reps and the open question in WAZN_PLAN is
--    whether to cap it. Capping it here would silently re-flag historical PRs
--    and move every forecast, which is a product decision about what counts as
--    a record — not something to smuggle into a refactor. One definition first;
--    changing that definition is the next conversation.
--
-- 2. A workout with no sets is not a session. See the comment in `finished`.
--
-- 3. "9 of 8 weeks". See the comment on `weeks_trained_8w`.
--
-- 4. `profiles.weekly_target`, which the Week Board ranks on.

-- ── 1. One definition of an estimated 1RM ────────────────────────────────────
-- `immutable` because it is pure arithmetic on its arguments: that lets the
-- planner fold it into index scans and inline it, so extracting it costs
-- nothing at query time. `strict` so a null weight or null rep count yields
-- null rather than 0, which is what every inline site already did by virtue of
-- null propagation.
create or replace function public.e1rm(weight_kg numeric, reps integer)
returns numeric
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select weight_kg * (1 + reps::numeric / 30)
$$;

comment on function public.e1rm(numeric, integer) is
  'Epley estimated 1RM. Behaviour-identical to the fourteen sites that inlined '
  'it as of 0030. No rep ceiling: adding one changes which historical sets are '
  'records, and that is a product decision rather than a refactor.';

-- Supabase grants EXECUTE to `anon` via `alter default privileges`, so a new
-- function is callable by a signed-out request unless that is revoked
-- explicitly. 0027 tried this with `revoke ... from public` and it did nothing,
-- because the grant is direct rather than inherited. Naming the roles is what
-- works, and `has_function_privilege` is how it gets verified afterwards.
revoke execute on function public.e1rm(numeric, integer) from anon;

-- ── 4. The committed weekly target ───────────────────────────────────────────
-- The Week Board ranks on sessions completed against each person's OWN
-- committed target, never on output — the STEP UP trial's scoring detail, and
-- the load-bearing design decision in docs/FRIENDS_PLAN.md.
--
-- On `profiles` rather than a new table: it is one scalar per person with no
-- history requirement yet. When targets need a history (to show that somebody
-- lowered theirs, which the plan says should be visible to the crew) that is a
-- second table and this column becomes its current value.
--
-- Nullable on purpose. Null means "has not set one", which is a real state the
-- board has to render, and is not the same as zero. The check allows 1 to 14
-- because a target of zero is not a commitment and more than fourteen is not a
-- week of training.
alter table public.profiles
  add column if not exists weekly_target smallint
    check (weekly_target is null or (weekly_target between 1 and 14));

comment on column public.profiles.weekly_target is
  'Sessions per week this person committed to. Null means unset, which the '
  'Week Board renders differently from zero. Ranked on adherence to THIS, '
  'never on volume.';

-- No RLS change. `profiles` already carries its policies and they are row
-- scoped, so a new column inherits them; a column added under an existing
-- policy needs no new grant. Verified against pg_policies after applying
-- rather than assumed.

-- ── 2 and 3. weekly_review(), with the two fixes ─────────────────────────────
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
      -- A workout with no sets in it is not a session, and counting it as one
      -- had three separate symptoms. Production on 2026-08-21 held three such
      -- rows from stray taps on Start: they inflated `sessions_this_week` to 7
      -- against 4 real sessions, they advanced `coach-notes`' cache key (which
      -- is max(started_at) over finished workouts) so a pre-import review was
      -- served indefinitely, and they sat at the top of History reading
      -- "0 sets".
      --
      -- `exists` over ANY set, not over a WORKING set. Excluding warm-up-only
      -- sessions as well would be redefining what a session is, which is a
      -- product decision and not this migration's business. This one only says
      -- that a workout nobody put anything into did not happen.
      and exists (
        select 1 from public.workout_sets s where s.workout_id = w.id
      )
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
      public.e1rm(s.weight_kg, s.reps) as e1rm
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
      -- Bounded to WHOLE weeks, because the denominator is a literal 8.
      --
      -- This counted distinct `date_trunc('week', ...)` buckets over a ROLLING
      -- 56-day window, and a 56-day window that starts mid-week touches NINE
      -- calendar weeks. The coach duly reported "9 of 8 weeks" on a simulator
      -- (2026-08-21). The count was right and the denominator was wrong, so the
      -- window is what moves: from `date_trunc('week', now()) - 7 weeks` is
      -- exactly eight buckets including the current partial one.
      count(distinct date_trunc('week', s.started_at)) filter (
        where s.started_at >= date_trunc('week', now()) - interval '7 weeks'
      ) as weeks_trained_8w,
      count(*) filter (
        where s.routine_id is not null
          and s.started_at > now() - interval '28 days'
      ) as from_routine_28,
      count(*) filter (
        where s.started_at > now() - interval '28 days'
      ) as sessions_28
    from sessions_8w s
  ),
  -- ── The longest gap, measured against the WINDOW and not only between
  --    sessions (fixed 0029) ─────────────────────────────────────────────
  -- This was `max(gap between consecutive sessions inside 28 days)` with
  -- `coalesce(..., 0)`. An account that has not trained at all in 28 days has
  -- no consecutive pair, so `max` was null and the fallback answered ZERO —
  -- which reads as "no gaps, perfect attendance" and means its exact opposite.
  -- The model then repeated it faithfully as a mitigating clause, and a lifter
  -- 32 days off the bar was told "your longest gap in the last 28 days is 0
  -- days" (seen on a simulator 2026-08-21, account with 149 workouts).
  --
  -- Same shape as the `|| echo "no"` scar in CLAUDE.md: the branch that runs
  -- when there is nothing to measure must not answer the FLATTERING value.
  --
  -- Bracketing the window fixes both the zero-session case and the one-session
  -- case: the start of the window and `now()` are gap boundaries in their own
  -- right, so a stretch with no training is a gap rather than an absence of
  -- gaps. Zero sessions now answers 28. One session ten days ago answers 18,
  -- not 0. The `coalesce` is unreachable with two sentinel rows always
  -- present, and it defaults to the window rather than to zero anyway.
  gap_points as (
    select now() - interval '28 days' as at
    union all
    select f.started_at from finished f where f.started_at > now() - interval '28 days'
    union all
    select now()
  ),
  gap as (
    select coalesce(max(g.days), 28) as longest_gap_days_28
    from (
      select floor(extract(
        epoch from p.at - lag(p.at) over (order by p.at)
      ) / 86400)::int as days
      from gap_points p
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
