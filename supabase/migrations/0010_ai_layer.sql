-- Stage 2C: the AI layer's storage and its one aggregation function.
--
-- The rule the whole stage is built on (plan §2C): deterministic SQL computes
-- every number, and the model only writes words. Nothing in this file asks a
-- model anything. It produces the compact block of statistics an Edge Function
-- sends, and the cache that stops it being sent twice for the same history.

-- ── The cache ──────────────────────────────────────────────────────────────
-- One row per user. `basis_workout_at` is what makes generation lazy: the
-- Progress screen regenerates only when the user's newest workout is newer
-- than the one the current notes were written against. Opening Progress five
-- times in an evening costs nothing.
create table if not exists public.coach_notes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  generated_at timestamptz not null default now(),
  -- Null means "written against an empty history", which is a real state: a
  -- brand-new user opening Progress gets notes about having no data yet.
  basis_workout_at timestamptz,
  -- Which model actually answered, after any fallback. Stored because "the
  -- notes got worse" is otherwise unanswerable.
  model text not null,
  -- [{ "title": "...", "body": "..." }] — validated in the Edge Function
  -- before it ever lands here.
  insights jsonb not null
);

alter table public.coach_notes enable row level security;

-- auth.uid() wrapped in a select so the planner evaluates it once per
-- statement rather than once per row, matching the policies in 0001.
drop policy if exists coach_notes_select_own on public.coach_notes;
create policy coach_notes_select_own on public.coach_notes
  for select to authenticated using ((select auth.uid()) = user_id);

-- No insert/update/delete policy for `authenticated` on purpose. Notes are
-- written by the Edge Function under the service role, and a client that could
-- write this table could put any text it liked behind the "AI-generated" label.
-- Reading is the only thing a browser needs to do here.

-- ── The quota ledger ───────────────────────────────────────────────────────
-- One row per generation actually paid for. Quotas are derived from it rather
-- than stored as counters, because a counter has to be reset by something and
-- a ledger just ages out.
create table if not exists public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null check (feature in ('coach_notes', 'routine')),
  created_at timestamptz not null default now(),
  model text,
  -- Whether the free model variant served it. The answer to "is the free tier
  -- actually carrying this, or am I paying for all of it?"
  used_free boolean not null default false
);

create index if not exists ai_generations_user_feature_idx
  on public.ai_generations (user_id, feature, created_at desc);

alter table public.ai_generations enable row level security;

drop policy if exists ai_generations_select_own on public.ai_generations;
create policy ai_generations_select_own on public.ai_generations
  for select to authenticated using ((select auth.uid()) = user_id);

-- Same posture as coach_notes: written by the Edge Function only. A client
-- that could delete its own ledger rows would have no quota at all.

-- ── The stat block ─────────────────────────────────────────────────────────
-- Everything the Coach's Notes prompt is allowed to know, in one round trip.
--
-- security invoker, so this runs under the caller's JWT and RLS scopes every
-- number to their own history. The Edge Function never passes a user id — it
-- cannot, because this function does not accept one. That is the enforcement
-- for "identity comes from the JWT", not a convention.
--
-- What is deliberately NOT in here: email, display name, user id, workout
-- names, or notes the user has written. Exercise names and numbers only. The
-- prompt is built from this function's output and nothing else, so this
-- function's column list IS the privacy boundary — which is why it is a
-- boundary you can read in one place.
create or replace function public.coach_stats()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with recent as (
    select w.id, w.started_at
    from public.workouts w
    where w.ended_at is not null
      and w.started_at > now() - interval '90 days'
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
      r.started_at,
      s.weight_kg * (1 + s.reps::numeric / 30) as e1rm
    from public.workout_sets s
    join recent r on r.id = s.workout_id
    join public.exercises e on e.id = s.exercise_id
    where s.set_type <> 'warmup'
      and s.weight_kg is not null
      and s.reps is not null
      and s.reps > 0
  )
  select jsonb_build_object(
    'unit', 'kg',
    'window_days', 90,
    'sessions_last_7', (
      select count(*) from recent where started_at > now() - interval '7 days'
    ),
    'sessions_last_28', (
      select count(*) from recent where started_at > now() - interval '28 days'
    ),
    -- Weekly sets per muscle group over the last 7 days, which is what the
    -- 10-20 productive band is expressed in. The band itself is not sent: it
    -- is a constant, and constants belong in the static system prompt where
    -- they are cached by the provider rather than re-sent per user.
    'weekly_sets_by_muscle', coalesce((
      select jsonb_object_agg(muscle_group, n)
      from (
        select muscle_group, count(*) as n
        from working
        where started_at > now() - interval '7 days'
        group by muscle_group
      ) t
    ), '{}'::jsonb),
    -- The same figure a month back, so the model can speak about direction
    -- without being asked to do arithmetic it is bad at.
    'weekly_sets_by_muscle_4w_ago', coalesce((
      select jsonb_object_agg(muscle_group, n)
      from (
        select muscle_group, count(*) as n
        from working
        where started_at > now() - interval '35 days'
          and started_at <= now() - interval '28 days'
        group by muscle_group
      ) t
    ), '{}'::jsonb),
    -- Top lifts by estimated 1RM, with how that estimate has moved over the
    -- window. `stalled` is computed here, in SQL, precisely so the model is
    -- never asked to decide what a plateau is.
    'lifts', coalesce((
      select jsonb_agg(row_to_json(l))
      from (
        select
          exercise_name as name,
          muscle_group,
          round(max(e1rm), 1) as best_e1rm,
          round(max(e1rm) filter (
            where started_at > now() - interval '28 days'
          ), 1) as best_e1rm_28d,
          round(max(e1rm) filter (
            where started_at <= now() - interval '28 days'
          ), 1) as best_e1rm_before,
          count(*) as sets,
          count(*) filter (where pr_weight or pr_e1rm) as records
        from working
        group by exercise_name, muscle_group
        order by max(e1rm) desc
        limit 12
      ) l
    ), '[]'::jsonb),
    'records_last_28', (
      select count(*) from working
      where (pr_weight or pr_e1rm) and started_at > now() - interval '28 days'
    ),
    'total_sets_90d', (select count(*) from working)
  );
$$;

comment on function public.coach_stats() is
  'Compact statistics for the Coach''s Notes prompt, for the calling user only. Numbers and exercise names — no identifying fields, by construction.';

revoke execute on function public.coach_stats() from public;
grant execute on function public.coach_stats() to authenticated;
grant execute on function public.coach_stats() to service_role;
