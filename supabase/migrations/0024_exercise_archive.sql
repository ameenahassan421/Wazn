-- 0024 — archive a custom exercise instead of living with it in the picker.
--
-- U4 asks for "custom exercise edit plus archive-not-delete". Edit shipped
-- without a migration. Archive needs this column, and the name of the feature
-- turned out to be misleading in a way worth writing down:
--
-- **Archiving is not what protects history.** `workout_sets.exercise_id` is
-- `on delete restrict` (0001), so the database already refuses to delete any
-- exercise a single set has ever been logged against. Logged sets are
-- structurally unlosable and no client code can change that. What archiving
-- adds is tidiness: getting a custom lift you have finished with out of a
-- picker that is scanned one-handed mid-workout, without pretending it never
-- happened.
--
-- ── Why a nullable timestamp and not a boolean ─────────────────────────────
-- `archived_at is null` means active, which needs no default and no backfill:
-- every existing row is already correct the instant this runs. It also records
-- WHEN, which a boolean throws away, and "archived in March" is the kind of
-- thing the owner asks when a lift reappears in a list.
--
-- ── Deliberately no index ──────────────────────────────────────────────────
-- The picker filters on this. `exercises` is 134 rows, and DECISIONS.md
-- already refused three indexes on this table for the same reason: an index
-- nothing can use profitably is write cost and bloat in exchange for a plan
-- the planner will not pick. Revisit if a user ever has thousands of custom
-- lifts, which is not a shape this app has.
--
-- ── Deliberately no RLS change ─────────────────────────────────────────────
-- `exercises_update_own` (0014) already requires `owner_id = auth.uid() and
-- is_custom`, so setting this column is covered and a seeded row still cannot
-- be touched. `exercises_select_visible` is left alone ON PURPOSE: an archived
-- exercise must stay READABLE, because History has to render the name of a set
-- performed against it. Hiding archived rows in RLS would blank the exercise
-- name on every past workout that used one, which is the opposite of the
-- guarantee this feature is named after. The filtering belongs in the picker's
-- query, where it is a product decision rather than a permission.
--
-- ── UNTIL THIS IS APPLIED ──────────────────────────────────────────────────
-- The client's `archived_at` reads come back undefined, which the picker treats
-- as "not archived", so every custom exercise stays listed exactly as it is
-- today. The archive control is hidden when the column is absent rather than
-- offering a button that cannot work. Nothing degrades.

alter table public.exercises
  add column if not exists archived_at timestamptz;

comment on column public.exercises.archived_at is
  'When the owner archived this custom exercise. Null means active. Archived rows stay readable so past workouts can still name them; the picker filters them out. Seeded rows (owner_id null) are never archived because nobody owns them.';
