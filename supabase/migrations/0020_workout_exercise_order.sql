-- U2b: the block order the user chose, so a reload does not forget it.
--
-- Design v2.2 makes the active workout a ledger of blocks rather than a
-- corridor of one exercise at a time, and blocks can be dragged into a
-- different order. The addendum is explicit that "a reordering a lock screen
-- forgets is worse than none", and leaves where the order lives to this phase.
--
-- WHY A COLUMN AND NOT A TABLE
--   The obvious relational answer is a `workout_exercises` join table. It was
--   rejected on the one property that matters most here: how it fails when it
--   is not there. Every migration in this repo up to 0015 was applied by hand,
--   and 0016-0018 were three days late; an unapplied table would make every
--   write in the overview error, mid-workout, in a gym. An unapplied COLUMN
--   makes exactly one PATCH fail, which the client already treats as "no
--   stored order" and falls back to deriving the order from the sets — which
--   is precisely today's behaviour. The feature degrades to the status quo
--   instead of breaking the screen. Same posture as 0015 and `exercise_rest`.
--
--   The join table also buys less than it looks: its only extra guarantee is a
--   foreign key on exercise_id, and an exercise is never hard-deleted (0014
--   archives custom ones for exactly this reason). An id in this array that no
--   longer resolves is dropped by `mergeOrder` in `src/lib/plan.ts`, which has
--   to handle a stale id anyway.
--
-- WHY THE NAME
--   NOT `position`. That is a reserved word, and migration 0007 shipped a
--   column called it and failed to parse in its entirety. The design addendum
--   carries the warning forward in writing; this is it being obeyed.
--
-- WHAT IS AND IS NOT IN HERE
--   This array is membership and order, not history. It says "these lifts are
--   on today's board, in this order". It does NOT say any of them happened —
--   that remains the exclusive meaning of a `workout_sets` row, and nothing in
--   v2.2 changes it. A planned exercise with no sets is a ghost block here and
--   a `SKIPPED` line on the finish summary, never a lift in History.

alter table public.workouts
  add column if not exists exercise_order uuid[];

comment on column public.workouts.exercise_order is
  'Exercise ids in the order the user arranged the blocks for this workout. Membership and order only — it never implies a set was performed. Null or absent means derive the order from the sets logged, which is the pre-v2.2 behaviour.';

-- No RLS change. `workouts` already carries owner-scoped select/insert/update/
-- delete policies from 0001, and a column inherits them; adding a policy here
-- would be a second, divergent copy of the same predicate.
