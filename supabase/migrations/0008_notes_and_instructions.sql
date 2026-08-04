-- Stage 2B: the exercise detail page needs three things the schema does not
-- have yet — how to perform the lift, what the user has learned about it, and
-- what they want to remember about a session.
--
-- The split matters. `exercises` is a shared library: seeded rows have
-- owner_id null and are visible to every authenticated user (see the
-- exercises_select_visible policy in 0001). Instruction text is a property of
-- the lift and belongs there. A note like "seat position 4" is a property of
-- one person's relationship to the lift and cannot be a column on a shared
-- row, so it gets its own user-scoped table. See DECISIONS.md.

-- ── Instructions: shared, read-only to clients ─────────────────────────────
-- Ordered steps, straight from free-exercise-db (public domain), imported by
-- scripts/import_instructions.ts under the service-role key. There is no
-- insert/update policy on exercises for `authenticated`, so this column is
-- writable only by the importer, which is the intent.
alter table public.exercises
  add column if not exists instructions text[];

comment on column public.exercises.instructions is
  'Ordered how-to steps from free-exercise-db. Null where the exercise had no confident match — the UI omits the section rather than showing an empty one.';

-- ── Workout notes ──────────────────────────────────────────────────────────
-- Covered by the existing workouts RLS policies: a user can only select or
-- update their own rows, so the column needs no policy of its own.
alter table public.workouts
  add column if not exists notes text;

alter table public.workouts
  drop constraint if exists workouts_notes_length;
alter table public.workouts
  add constraint workouts_notes_length
  check (notes is null or char_length(notes) <= 2000);

-- ── Per-user, per-exercise notes ───────────────────────────────────────────
create table if not exists public.exercise_notes (
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  note text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id),
  constraint exercise_notes_note_length check (char_length(note) <= 2000),
  -- An empty note is a deleted note. Storing '' would make the detail page
  -- render an empty card that the user cannot tell from a real one.
  constraint exercise_notes_note_not_blank check (btrim(note) <> '')
);

-- The primary key already serves lookups keyed on (user_id, exercise_id) and
-- on user_id alone. exercise_id is not covered by it — index it so the
-- ON DELETE CASCADE from exercises does not seq-scan this table.
create index if not exists exercise_notes_exercise_id_idx
  on public.exercise_notes (exercise_id);

alter table public.exercise_notes enable row level security;

-- auth.uid() is wrapped in a select so the planner evaluates it once per
-- statement rather than once per row, matching the policies in 0001.
drop policy if exists exercise_notes_select_own on public.exercise_notes;
create policy exercise_notes_select_own on public.exercise_notes
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists exercise_notes_insert_own on public.exercise_notes;
create policy exercise_notes_insert_own on public.exercise_notes
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists exercise_notes_update_own on public.exercise_notes;
create policy exercise_notes_update_own on public.exercise_notes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists exercise_notes_delete_own on public.exercise_notes;
create policy exercise_notes_delete_own on public.exercise_notes
  for delete to authenticated using (user_id = (select auth.uid()));

-- ── Detail-page records, in one round trip ─────────────────────────────────
-- The page shows best top set, best estimated 1RM (Epley) and best session
-- volume. Computing these client-side would mean pulling every set for the
-- exercise to the phone — 148 rows for bench today, and that grows forever.
--
-- Security invoker, so RLS still applies to the caller and a user can only
-- ever aggregate their own sets. Same contract as the helpers in 0001 and
-- 0007. search_path is pinned because a function that resolves table names
-- through a caller-controlled path is a privilege-escalation shape, even
-- when it is invoker-rights.
create or replace function public.exercise_records(target_exercise uuid)
returns table (
  best_weight_kg numeric,
  best_e1rm_kg numeric,
  best_session_volume_kg numeric,
  total_sets bigint,
  total_sessions bigint,
  first_logged_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with working as (
    select
      w.id as workout_id,
      w.started_at,
      s.weight_kg,
      s.reps
    from public.workout_sets s
    join public.workouts w on w.id = s.workout_id
    where s.exercise_id = target_exercise
      -- Warmups and incomplete sets are excluded from records everywhere in
      -- this app (WAZN_PLAN §5). Keep that true here.
      and s.set_type <> 'warmup'
      and s.weight_kg is not null
      and s.reps is not null
      and s.reps > 0
  ),
  per_session as (
    select workout_id, sum(weight_kg * reps) as session_volume
    from working
    group by workout_id
  )
  select
    max(working.weight_kg),
    max(working.weight_kg * (1 + working.reps::numeric / 30)),
    (select max(session_volume) from per_session),
    count(*),
    count(distinct working.workout_id),
    min(working.started_at)
  from working;
$$;

comment on function public.exercise_records(uuid) is
  'Best top set, best Epley 1RM, best session volume and counts for one exercise, for the calling user only. Warmups and sets missing weight or reps are excluded.';
