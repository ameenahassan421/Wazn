-- Stage 1 cycles set types normal/warmup/failure/drop in the UI, but the
-- original CHECK constraint rejects 'drop' — the insert would fail at the
-- database with a constraint violation, mid-workout, on the hot path.
-- Widening the constraint now costs nothing and is not a feature.

alter table public.workout_sets
  drop constraint if exists workout_sets_set_type_check;

alter table public.workout_sets
  add constraint workout_sets_set_type_check
  check (set_type in ('normal', 'warmup', 'failure', 'drop'));
