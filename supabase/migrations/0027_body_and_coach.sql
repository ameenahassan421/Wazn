-- 0027 — the second dataset, and the coach's dials.
--
-- Design v3.0 ("the coach everywhere") adds four inputs the AI may read and
-- two preferences that decide how loudly it speaks. None of them existed:
--
--   daily_checkins     one tap a day — fresh / normal / drained (spec §New
--                      inputs 1). Feeds `readiness`, never displayed raw.
--   body_weights       one weigh-in per day (spec §New inputs 3, §13).
--   protein_days       ONE nutrition number, on purpose (spec §New inputs 4).
--                      Grams logged and the target they were logged against,
--                      so a changed target does not rewrite last week's bars.
--   body_measurements  waist / chest / arm, mono list with 4-week deltas.
--
-- and on user_preferences:
--
--   coach_mode         strength | hypertrophy | meetprep — a LENS, never a
--                      fork. Nothing in this migration partitions any
--                      training table by mode, and that absence is the
--                      feature: History and every chart stay one dataset.
--   coach_volume       full | quiet | off. `off` renders the v2.2 app
--                      verbatim, which is why it is a stored preference and
--                      not a feature flag.
--   meet_date          meet-prep counts blocks back from the platform.
--   weekly_target      sessions per week the lifter set. The streak counts
--                      weeks against THIS, not days — a daily streak
--                      punishes rest, which a strength app must never do.
--   protein_target_g   the line the day-bars are measured against.
--
-- ── UNTIL THIS IS APPLIED ──────────────────────────────────────────────────
-- Same shape as 0023 and 0025, which both shipped before their DDL. Every
-- read below is wrapped in a `maybe`-style catch on the client: a missing
-- table answers "no rows", the Body tab renders its empty state ("Log a
-- weigh-in to start the second chart."), the check-in row is absent, and
-- mode/volume fall back to localStorage. Nothing throws and nothing nags.
--
-- ── WHY NO `readiness` COLUMN ──────────────────────────────────────────────
-- Readiness is computed from check-in + sleep debt + HRV trend + days rested
-- per group, and it is collapsed to three internal states. Storing it would
-- make yesterday's answer outlive its inputs, and the spec is explicit that
-- it surfaces only as changed behaviour with a chip — never as a gauge, and
-- therefore never as a number anyone can go stale on.

-- ---------------------------------------------------------------------------
-- Daily check-in
-- ---------------------------------------------------------------------------

-- One row per user per LOCAL day. The day is passed by the client rather than
-- defaulted to `current_date`, because `current_date` here is UTC and a 9pm
-- check-in in Cairo would land on tomorrow.
create table if not exists public.daily_checkins (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  state text not null check (state in ('fresh', 'normal', 'drained')),
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.daily_checkins enable row level security;

drop policy if exists daily_checkins_select_own on public.daily_checkins;
create policy daily_checkins_select_own on public.daily_checkins
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists daily_checkins_insert_own on public.daily_checkins;
create policy daily_checkins_insert_own on public.daily_checkins
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists daily_checkins_update_own on public.daily_checkins;
create policy daily_checkins_update_own on public.daily_checkins
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 0016's lesson, applied at the schema rather than left to the client: the
-- owner column defaults to the caller, so a forgotten `user_id` in an insert
-- is a row that belongs to the right person instead of a row RLS refuses.
-- Following and liking shipped broken for the whole life of the feature
-- because the client forgot exactly this.
alter table public.daily_checkins
  alter column user_id set default auth.uid();

-- ---------------------------------------------------------------------------
-- Body weight
-- ---------------------------------------------------------------------------

-- Kilograms, always — the same rule the bar obeys (WAZN_PLAN §2.5). The
-- header's lb toggle is display only and must never reach a stored number.
create table if not exists public.body_weights (
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(6, 2) not null check (weight_kg > 0 and weight_kg < 500),
  created_at timestamptz not null default now(),
  primary key (user_id, measured_on)
);

alter table public.body_weights enable row level security;

drop policy if exists body_weights_select_own on public.body_weights;
create policy body_weights_select_own on public.body_weights
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists body_weights_insert_own on public.body_weights;
create policy body_weights_insert_own on public.body_weights
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists body_weights_update_own on public.body_weights;
create policy body_weights_update_own on public.body_weights
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists body_weights_delete_own on public.body_weights;
create policy body_weights_delete_own on public.body_weights
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Protein — the only nutrition number in v3
-- ---------------------------------------------------------------------------

-- `target_g` is stamped on the ROW, not read from preferences at render time.
-- A lifter who raises their target on Friday must not find Monday through
-- Thursday retroactively recoloured as misses; the bar records what it was
-- measured against on the day it was logged.
create table if not exists public.protein_days (
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  day date not null,
  grams integer not null check (grams >= 0 and grams < 1000),
  target_g integer check (target_g > 0 and target_g < 1000),
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.protein_days enable row level security;

drop policy if exists protein_days_select_own on public.protein_days;
create policy protein_days_select_own on public.protein_days
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists protein_days_insert_own on public.protein_days;
create policy protein_days_insert_own on public.protein_days
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists protein_days_update_own on public.protein_days;
create policy protein_days_update_own on public.protein_days
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Measurements
-- ---------------------------------------------------------------------------

-- Centimetres. A fixed site list rather than free text: the Body tab draws a
-- delta against the same site four weeks ago, and "Waist" / "waist " / "Belly"
-- would each start their own series and none of them would ever have a delta.
create table if not exists public.body_measurements (
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  site text not null check (site in ('waist', 'chest', 'arm', 'thigh', 'hips')),
  measured_on date not null,
  value_cm numeric(5, 1) not null check (value_cm > 0 and value_cm < 300),
  created_at timestamptz not null default now(),
  primary key (user_id, site, measured_on)
);

alter table public.body_measurements enable row level security;

drop policy if exists body_measurements_select_own on public.body_measurements;
create policy body_measurements_select_own on public.body_measurements
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists body_measurements_insert_own on public.body_measurements;
create policy body_measurements_insert_own on public.body_measurements
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists body_measurements_update_own on public.body_measurements;
create policy body_measurements_update_own on public.body_measurements
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists body_measurements_delete_own on public.body_measurements;
create policy body_measurements_delete_own on public.body_measurements
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Preferences: the coach's dials
-- ---------------------------------------------------------------------------

alter table public.user_preferences
  add column if not exists coach_mode text not null default 'strength'
  check (coach_mode in ('strength', 'hypertrophy', 'meetprep'));

alter table public.user_preferences
  add column if not exists coach_volume text not null default 'full'
  check (coach_volume in ('full', 'quiet', 'off'));

-- Nullable on purpose: meet prep shows a dashed setup card until it has one,
-- and "no date yet" is a different fact from any date we could invent.
alter table public.user_preferences
  add column if not exists meet_date date;

alter table public.user_preferences
  add column if not exists weekly_target integer not null default 3
  check (weekly_target between 1 and 14);

alter table public.user_preferences
  add column if not exists protein_target_g integer
  check (protein_target_g > 0 and protein_target_g < 1000);

-- Extend the single-preference upsert allowlist. Same shape as 0023 and 0025:
-- the client sends (column, value) and only named columns move, so there is no
-- generic UPDATE to reach through.
--
-- The three new numeric/date columns are cast from text at the branch rather
-- than taking a second parameter, because the RPC's signature is already
-- deployed and a second overload is one more thing that can be called by
-- accident. An unparseable value raises, which is the honest outcome — the
-- client only ever sends values it produced itself.
create or replace function public.upsert_user_preference(
  p_column text,
  p_value text
)
returns public.user_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.user_preferences;
begin
  insert into public.user_preferences (user_id)
  values (v_uid)
  on conflict (user_id) do nothing;

  if p_column = 'weight_unit' then
    update public.user_preferences
    set weight_unit = p_value, updated_at = now()
    where user_id = v_uid
    returning * into v_row;
  elsif p_column = 'rpe_mode' then
    update public.user_preferences
    set rpe_mode = p_value, updated_at = now()
    where user_id = v_uid
    returning * into v_row;
  elsif p_column = 'locale' then
    update public.user_preferences
    set locale = p_value, updated_at = now()
    where user_id = v_uid
    returning * into v_row;
  elsif p_column = 'theme' then
    update public.user_preferences
    set theme = p_value, updated_at = now()
    where user_id = v_uid
    returning * into v_row;
  elsif p_column = 'coach_mode' then
    update public.user_preferences
    set coach_mode = p_value, updated_at = now()
    where user_id = v_uid
    returning * into v_row;
  elsif p_column = 'coach_volume' then
    update public.user_preferences
    set coach_volume = p_value, updated_at = now()
    where user_id = v_uid
    returning * into v_row;
  elsif p_column = 'meet_date' then
    update public.user_preferences
    -- Empty string clears the date. Meet prep can be un-dated again, and
    -- `nullif` is how the client says so without a second RPC.
    set meet_date = nullif(p_value, '')::date, updated_at = now()
    where user_id = v_uid
    returning * into v_row;
  elsif p_column = 'weekly_target' then
    update public.user_preferences
    set weekly_target = p_value::integer, updated_at = now()
    where user_id = v_uid
    returning * into v_row;
  elsif p_column = 'protein_target_g' then
    update public.user_preferences
    set protein_target_g = nullif(p_value, '')::integer, updated_at = now()
    where user_id = v_uid
    returning * into v_row;
  else
    select * into v_row from public.user_preferences where user_id = v_uid;
  end if;

  return v_row;
end;
$$;

revoke all on function public.upsert_user_preference(text, text) from public;
grant execute on function public.upsert_user_preference(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- One read for the Body tab
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER, like `session_brief` and every other reporting function
-- the app calls directly: RLS above already means "mine", and 0026 made that
-- true for `workouts` as well, so a function that forgets a predicate returns
-- the caller's rows rather than somebody else's.
--
-- One round trip for four series, for the same reason `session_volume_history`
-- feeds four charts: the Body tab is a dashboard, and four requests on a
-- Cairo mobile connection is four chances to draw half a screen.
create or replace function public.body_overview(p_weeks integer default 12)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'unit', 'kg',
    'weights', coalesce((
      select jsonb_agg(jsonb_build_object('on', w.measured_on, 'kg', w.weight_kg)
                       order by w.measured_on)
      from public.body_weights w
      where w.measured_on >= current_date - (greatest(p_weeks, 1) * 7)
    ), '[]'::jsonb),
    'protein', coalesce((
      select jsonb_agg(jsonb_build_object(
               'on', p.day, 'g', p.grams, 'target', p.target_g)
                       order by p.day)
      from public.protein_days p
      where p.day >= current_date - 27
    ), '[]'::jsonb),
    -- Latest per site, plus the closest reading at least 28 days older, so the
    -- client renders "104 cm ▲ 1" without a second query or a window function
    -- it would have to keep in sync with the chart.
    'measurements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'site', m.site,
               'cm', m.value_cm,
               'on', m.measured_on,
               'previous_cm', (
                 select p.value_cm
                 from public.body_measurements p
                 where p.site = m.site
                   and p.measured_on <= m.measured_on - 28
                 order by p.measured_on desc
                 limit 1
               ))
                       order by m.site)
      from public.body_measurements m
      where m.measured_on = (
        select max(x.measured_on) from public.body_measurements x
        where x.site = m.site
      )
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.body_overview(integer) from public;
grant execute on function public.body_overview(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- The forecast gate
-- ---------------------------------------------------------------------------

-- Design v3.0 §08: a forecast line renders only with **≥8 weeks of data on
-- that lift**, and otherwise shows a muted `FORECAST AT WK n OF 8`
-- placeholder. `strength_summary` (0012) cannot answer either half — it knows
-- the best estimate, the last 28 days and the 28 before that, and nothing
-- about how long the lift has been trained or how fast it is moving.
--
-- Computing that client-side would mean one `exercise_1rm_history` call per
-- lift, which on a forty-lift account is forty round trips to draw one screen.
-- So the regression happens where the rows are: one session per point, ordinary
-- least squares over (weeks since first session, best e1RM that session).
--
-- Only the SPAN counts toward the gate, never the session count. Eight sessions
-- crammed into a fortnight is two weeks of evidence, and a lifter who trains
-- twice a week must not get a forecast four weeks sooner than one who trains
-- once. `lib/forecast.ts` enforces the same rule on whatever it is handed; the
-- two agree because both measure first-to-last.
create or replace function public.strength_forecast()
returns table (
  exercise_id uuid,
  weeks_of_data integer,
  sessions integer,
  slope_kg_per_week numeric,
  latest_e1rm_kg numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with per_session as (
    -- One point per exercise per session: the best working estimate that day.
    -- Warm-ups never count, here or on any other record surface (plan §5).
    select
      s.exercise_id,
      w.started_at,
      max(s.weight_kg * (1 + s.reps::numeric / 30)) as e1rm
    from public.workout_sets s
    join public.workouts w on w.id = s.workout_id
    where s.set_type <> 'warmup'
      and s.weight_kg is not null
      and s.reps is not null
      and s.reps > 0
      and s.weight_kg > 0
    group by s.exercise_id, w.started_at
  ),
  framed as (
    select
      p.exercise_id,
      p.e1rm,
      -- Weeks since this lift's first session, as the regression's x-axis.
      extract(epoch from (
        p.started_at - min(p.started_at) over (partition by p.exercise_id)
      )) / 604800.0 as wk,
      p.started_at,
      max(p.started_at) over (partition by p.exercise_id) as last_at,
      min(p.started_at) over (partition by p.exercise_id) as first_at
    from per_session p
  )
  select
    f.exercise_id,
    floor(extract(epoch from (max(f.last_at) - min(f.first_at))) / 604800.0)::integer,
    count(*)::integer,
    -- OLS slope. `regr_slope(y, x)` is null for fewer than two distinct x
    -- values, which is exactly the case where there is no rate to report.
    round(regr_slope(f.e1rm, f.wk)::numeric, 3),
    round(max(f.e1rm) filter (where f.started_at = f.last_at), 1)
  from framed f
  group by f.exercise_id;
$$;

revoke all on function public.strength_forecast() from public;
grant execute on function public.strength_forecast() to authenticated;
