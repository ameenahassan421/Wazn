-- U1 item 6: a rest duration the user can actually set.
--
-- `exercises.default_rest_seconds` has existed since 0004 and has never had a
-- writer — and it could not have one. `exercises` is a shared catalogue: its
-- 134 seeded rows have `owner_id` null, and the only update policy on the
-- table (`exercises_update_own`, 0014) lets a user edit rows they own. A user
-- cannot write to a seeded row, which is correct twice over: the write would
-- be refused, and if it succeeded it would set everyone's rest for Bench Press
-- at once. That is not a preference, it is a collision.
--
-- Same split, same reasoning as `exercise_notes` in 0008: what is true of the
-- lift lives on the lift, what is true of one person's relationship to the
-- lift lives in a user-scoped table. 0004's column stays as the catalogue
-- fallback, so an importer can still seed a sensible default per movement and
-- the user's own value simply wins over it.

create table if not exists public.exercise_rest (
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  -- Seconds, matching 0004's column so the two are directly comparable.
  -- Zero is meaningful: it is "no timer for this lift", which is what people
  -- want on curls and abs. Deleting the row is the separate, different thing —
  -- "go back to whatever the app decides".
  rest_seconds integer not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id),
  constraint exercise_rest_seconds_range
    check (rest_seconds between 0 and 3600)
);

comment on table public.exercise_rest is
  'Per-user rest default for one exercise, in seconds. Overrides exercises.default_rest_seconds; absence means fall back to that, then to the app default.';

-- The primary key serves (user_id, exercise_id) and user_id alone.
-- exercise_id is not covered by it, and both foreign keys cascade on delete —
-- index it so removing an exercise does not seq-scan this table.
create index if not exists exercise_rest_exercise_id_idx
  on public.exercise_rest (exercise_id);

alter table public.exercise_rest enable row level security;

-- auth.uid() wrapped in a select so the planner evaluates it once per
-- statement rather than once per row, matching every policy since 0001.
drop policy if exists exercise_rest_select_own on public.exercise_rest;
create policy exercise_rest_select_own on public.exercise_rest
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists exercise_rest_insert_own on public.exercise_rest;
create policy exercise_rest_insert_own on public.exercise_rest
  for insert to authenticated with check (user_id = (select auth.uid()));

-- USING decides which rows may be edited, WITH CHECK what they may become.
-- Without the second half a user could rewrite user_id and hand their row to
-- somebody else — the same trap 0014 documents on exercises.
drop policy if exists exercise_rest_update_own on public.exercise_rest;
create policy exercise_rest_update_own on public.exercise_rest
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Deleting is how "reset to the app default" is expressed, so it needs a
-- policy of its own rather than being an admin-only operation.
drop policy if exists exercise_rest_delete_own on public.exercise_rest;
create policy exercise_rest_delete_own on public.exercise_rest
  for delete to authenticated using (user_id = (select auth.uid()));
