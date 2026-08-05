-- Custom exercises — the last unchecked item on Stage 2's insight list.
--
-- Until now `exercises` had exactly one policy: SELECT. There was no way for a
-- signed-in user to add a lift, in the client or over the API. That was fine
-- while the only user was Ameen and the 134 seeded rows came from his own
-- history. It stops being fine the moment a cohort of other people's gyms is
-- involved: a tester whose gym has a machine the seed does not know about
-- currently cannot log it at all, and "log a set in under 30 seconds" becomes
-- "you cannot".
--
-- The shape is already half-built. `exercises` has carried `is_custom` and
-- `owner_id` since 0001, and the SELECT policy already reads
-- `owner_id is null or owner_id = auth.uid()` — seeded rows are shared, owned
-- rows are private. This migration adds only the three write policies that
-- were missing, so a custom exercise is private by construction rather than by
-- a filter somebody has to remember.

-- Own rows only, and only as a custom row. Without the `is_custom` check a
-- client could insert a row with `is_custom = false`, which would look seeded
-- everywhere the UI distinguishes them.
drop policy if exists exercises_insert_own on public.exercises;
create policy exercises_insert_own on public.exercises
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and is_custom
  );

-- The USING and WITH CHECK halves both matter: USING decides which rows you
-- may edit, WITH CHECK decides what they may become. Without the second, a
-- user could edit their own row into somebody else's by rewriting owner_id.
drop policy if exists exercises_update_own on public.exercises;
create policy exercises_update_own on public.exercises
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and is_custom);

-- Deleting is allowed but will usually be refused by the database, and that is
-- correct: workout_sets.exercise_id is `on delete restrict`, so an exercise
-- that has ever been logged cannot be removed. Deleting it would silently take
-- history with it, and history is what every chart in the app is built from.
-- A custom exercise created by mistake and never used deletes cleanly.
drop policy if exists exercises_delete_own on public.exercises;
create policy exercises_delete_own on public.exercises
  for delete to authenticated
  using (owner_id = (select auth.uid()) and is_custom);

-- Seeded names are globally unique (0001). Custom names are unique *per
-- owner*: two different users may both add "Hack Squat", and neither should be
-- able to add it twice. A partial index keyed on the owner says exactly that,
-- and gives the client a 23505 to turn into "you already have one of those"
-- rather than a duplicate that only shows up later in the picker.
create unique index if not exists exercises_custom_owner_name_key
  on public.exercises (owner_id, lower(name))
  where owner_id is not null;

comment on column public.exercises.is_custom is
  'True for a user-created exercise. Seeded rows have owner_id null and is_custom false; the two always agree, enforced by the insert policy.';
