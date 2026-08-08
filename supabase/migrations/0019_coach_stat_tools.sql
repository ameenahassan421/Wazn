-- The stat tools: the coach's ability to ask a second question.
--
-- `docs/INFRASTRUCTURE_AUDIT.md` §3-A1. `coach_stats()` is one view — 90 days,
-- top 12 lifts — and it is the only thing the model has ever been able to see.
-- "Why did my bench stall in March?" was unanswerable, not because the data
-- was missing but because there was no way to ask for it.
--
-- These are that way. Each is the retrieval mechanism §2 of the audit argues
-- for instead of a vector store: whitelisted, parameterised, and scoped by the
-- database rather than by a prompt.
--
-- FOUR PROPERTIES EVERY FUNCTION HERE HAS, AND WHY
--
--  1. `security invoker` — runs as the caller, so RLS scopes every row to
--     their own history. This is what makes it safe to let a model choose the
--     arguments: the worst it can do is ask about data the caller already owns.
--  2. **No user id parameter.** Not "we don't pass one" — the functions do not
--     accept one, so there is no code path that can point them at anyone else.
--     Same enforcement as `coach_stats()`.
--  3. `set search_path = ''` and fully-qualified names, so a `public` schema
--     object cannot shadow anything they call.
--  4. **Numbers and exercise names only.** No email, no display name, no user
--     id, no workout name, no user-written note. These function bodies are the
--     privacy boundary, the way `coach_stats()` is, and `checkBlockPrivacy()`
--     in `_shared/note-contract.ts` asserts it against real output.
--
-- Every one caps its own row count. A tool result goes into a prompt, so an
-- unbounded result set is an unbounded bill.

-- ── e1RM over time for one lift ────────────────────────────────────────────
-- The "why has my bench stalled" tool. Weekly buckets rather than per session,
-- because a model handed 60 sessions will summarise them badly and a model
-- handed 26 weeks can see a slope.
create or replace function public.e1rm_trend(
  exercise_name text,
  weeks integer default 26
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with bounded as (
    select least(greatest(coalesce(weeks, 26), 1), 104) as weeks
  ),
  working as (
    select
      date_trunc('week', w.started_at) as week,
      s.weight_kg * (1 + s.reps::numeric / 30) as e1rm,
      s.weight_kg,
      s.reps
    from public.workout_sets s
    join public.workouts w on w.id = s.workout_id
    join public.exercises e on e.id = s.exercise_id
    cross join bounded b
    where w.ended_at is not null
      and lower(e.name) = lower(exercise_name)
      and s.set_type <> 'warmup'
      and s.weight_kg is not null
      and s.reps is not null
      and s.reps > 0
      and w.started_at > now() - (b.weeks * interval '7 days')
  )
  select jsonb_build_object(
    'exercise', exercise_name,
    'unit', 'kg',
    'weeks', (select weeks from bounded),
    'series', coalesce((
      select jsonb_agg(row_to_json(t) order by t.week)
      from (
        select
          week::date as week,
          round(max(e1rm), 1) as best_e1rm,
          round(max(weight_kg), 1) as top_weight,
          count(*) as sets
        from working
        group by week
        order by week
        limit 104
      ) t
    ), '[]'::jsonb)
  );
$$;

comment on function public.e1rm_trend(text, integer) is
  'Weekly best estimated 1RM for one exercise, for the calling user only. Numbers and the exercise name — nothing identifying.';

-- ── Weekly working sets for one muscle group ───────────────────────────────
-- The 10-20 band tool. `coach_stats()` carries this week and four weeks ago;
-- this carries the whole run, which is what turns "you are low on back" into
-- "you have been low on back for six weeks".
create or replace function public.weekly_band(
  muscle text,
  weeks integer default 12
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with bounded as (
    select least(greatest(coalesce(weeks, 12), 1), 52) as weeks
  ),
  working as (
    select date_trunc('week', w.started_at) as week
    from public.workout_sets s
    join public.workouts w on w.id = s.workout_id
    join public.exercises e on e.id = s.exercise_id
    cross join bounded b
    where w.ended_at is not null
      and e.muscle_group = muscle
      and s.set_type <> 'warmup'
      and s.reps is not null
      and s.reps > 0
      and w.started_at > now() - (b.weeks * interval '7 days')
  )
  select jsonb_build_object(
    'muscle', muscle,
    'weeks', (select weeks from bounded),
    -- Sent with the data rather than left to the model's memory of the prompt,
    -- because this is the one tool whose whole point is a comparison.
    'productive_range', jsonb_build_array(10, 20),
    'series', coalesce((
      select jsonb_agg(row_to_json(t) order by t.week)
      from (
        select week::date as week, count(*) as sets
        from working
        group by week
        order by week
        limit 52
      ) t
    ), '[]'::jsonb)
  );
$$;

comment on function public.weekly_band(text, integer) is
  'Working sets per week for one muscle group, for the calling user only, with the 10-20 productive range.';

-- ── Where the reps actually land ───────────────────────────────────────────
-- "You think you train heavy; 70% of your bench sets are 10 or more reps."
-- A distribution is the kind of claim a lifter cannot make about themselves
-- from memory, which is exactly what makes it worth a tool.
create or replace function public.rep_distribution(
  exercise_name text default null,
  weeks integer default 12
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with bounded as (
    select least(greatest(coalesce(weeks, 12), 1), 52) as weeks
  ),
  working as (
    select
      s.reps,
      case
        when s.reps <= 5 then '1-5'
        when s.reps <= 8 then '6-8'
        when s.reps <= 12 then '9-12'
        else '13+'
      end as bucket
    from public.workout_sets s
    join public.workouts w on w.id = s.workout_id
    join public.exercises e on e.id = s.exercise_id
    cross join bounded b
    where w.ended_at is not null
      and s.set_type <> 'warmup'
      and s.reps is not null
      and s.reps > 0
      and (exercise_name is null or lower(e.name) = lower(exercise_name))
      and w.started_at > now() - (b.weeks * interval '7 days')
  )
  select jsonb_build_object(
    'exercise', coalesce(exercise_name, 'all'),
    'weeks', (select weeks from bounded),
    'total_sets', (select count(*) from working),
    'buckets', coalesce((
      select jsonb_object_agg(bucket, n)
      from (select bucket, count(*) as n from working group by bucket) t
    ), '{}'::jsonb)
  );
$$;

comment on function public.rep_distribution(text, integer) is
  'How working sets fall across rep ranges, for the calling user only.';

-- ── Did they turn up ───────────────────────────────────────────────────────
-- Adherence before analysis. Most "why am I not progressing" questions are
-- answered by a session count, and answering them with a session count is
-- cheaper and more honest than answering them with prose.
create or replace function public.adherence(weeks integer default 12)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with bounded as (
    select least(greatest(coalesce(weeks, 12), 1), 52) as weeks
  ),
  sessions as (
    select date_trunc('week', w.started_at) as week, w.started_at
    from public.workouts w
    cross join bounded b
    where w.ended_at is not null
      and w.started_at > now() - (b.weeks * interval '7 days')
  )
  select jsonb_build_object(
    'weeks', (select weeks from bounded),
    'total_sessions', (select count(*) from sessions),
    'weeks_trained', (select count(distinct week) from sessions),
    'longest_gap_days', coalesce((
      select round(max(gap) / 86400.0)::int
      from (
        select extract(epoch from started_at - lag(started_at) over (order by started_at)) as gap
        from sessions
      ) g
    ), 0),
    'series', coalesce((
      select jsonb_agg(row_to_json(t) order by t.week)
      from (
        select week::date as week, count(*) as sessions
        from sessions group by week order by week limit 52
      ) t
    ), '[]'::jsonb)
  );
$$;

comment on function public.adherence(integer) is
  'Sessions per week and the longest gap, for the calling user only.';

-- ── The records ladder ─────────────────────────────────────────────────────
-- What has actually moved. `pr_weight` and `pr_e1rm` are already computed by
-- 0009 on write, so this reads flags rather than recomputing what a record is
-- — the same division of labour the whole AI layer runs on.
create or replace function public.records_ladder(weeks integer default 26)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with bounded as (
    select least(greatest(coalesce(weeks, 26), 1), 104) as weeks
  )
  select jsonb_build_object(
    'weeks', (select weeks from bounded),
    'unit', 'kg',
    'records', coalesce((
      select jsonb_agg(row_to_json(t) order by t.at desc)
      from (
        select
          e.name as exercise,
          w.started_at::date as at,
          round(s.weight_kg, 1) as weight,
          s.reps,
          round((s.weight_kg * (1 + s.reps::numeric / 30))::numeric, 1) as e1rm
        from public.workout_sets s
        join public.workouts w on w.id = s.workout_id
        join public.exercises e on e.id = s.exercise_id
        cross join bounded b
        where w.ended_at is not null
          and (s.pr_weight or s.pr_e1rm)
          and s.weight_kg is not null
          and s.reps is not null
          and w.started_at > now() - (b.weeks * interval '7 days')
        order by w.started_at desc
        limit 40
      ) t
    ), '[]'::jsonb)
  );
$$;

comment on function public.records_ladder(integer) is
  'Recent personal records, for the calling user only. Reads the pr flags 0009 computes on write rather than recomputing what a record is.';

-- ── Grants ─────────────────────────────────────────────────────────────────
-- Revoked from `public` first, matching `coach_stats()`. `authenticated` and
-- `service_role` only; `anon` gets nothing.
revoke execute on function public.e1rm_trend(text, integer) from public;
revoke execute on function public.weekly_band(text, integer) from public;
revoke execute on function public.rep_distribution(text, integer) from public;
revoke execute on function public.adherence(integer) from public;
revoke execute on function public.records_ladder(integer) from public;

grant execute on function public.e1rm_trend(text, integer) to authenticated, service_role;
grant execute on function public.weekly_band(text, integer) to authenticated, service_role;
grant execute on function public.rep_distribution(text, integer) to authenticated, service_role;
grant execute on function public.adherence(integer) to authenticated, service_role;
grant execute on function public.records_ladder(integer) to authenticated, service_role;
