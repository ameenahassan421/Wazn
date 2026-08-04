-- Stage 2: "PR detection computed on log, celebrated inline, stored
-- consistently."
--
-- Until now a PR existed only in memory, for the ninety seconds the finish
-- summary was on screen. History could not badge the set that set the record,
-- the exercise detail page could not point at it, and reopening the summary
-- recomputed it from scratch. This migration gives a record somewhere to live.
--
-- The flags are per SET, not per workout, and they mean exactly one thing:
-- *this set beat every qualifying set of the same exercise that came before
-- it, for this user*. That definition is what makes the badge honest on a row
-- in History six months later — it is a fact about the row, not about the
-- session it happened in.
--
-- The finish summary keeps its own per-EXERCISE view (the day's best vs all
-- prior history, with the "was 100 kg" line). The two agree by construction:
-- the summary names the exercise that improved, the flag marks the set that
-- did it.

alter table public.workout_sets
  add column if not exists pr_weight boolean not null default false;

alter table public.workout_sets
  add column if not exists pr_e1rm boolean not null default false;

comment on column public.workout_sets.pr_weight is
  'This set is heavier than every earlier qualifying set of the same exercise by the same user.';
comment on column public.workout_sets.pr_e1rm is
  'This set has a higher Epley estimate than every earlier qualifying set of the same exercise by the same user.';

-- History badges read sets by workout, which workout_sets_workout_idx already
-- covers. What has no index is "show me the records for this exercise", which
-- the exercise detail page wants. Partial, because records are a few dozen rows
-- out of thousands — the index is a fraction of the size of a full one and the
-- planner can use it for exactly the query that needs it.
create index if not exists workout_sets_records_idx
  on public.workout_sets (exercise_id)
  where pr_weight or pr_e1rm;

-- ── Recompute ──────────────────────────────────────────────────────────────
-- One statement rebuilds every flag for one exercise, in chronological order,
-- using a running maximum over all preceding rows. A window function is the
-- whole algorithm: no loop, no per-row subquery, and it is correct regardless
-- of what happened before it ran, which is what makes it safe to use for both
-- the trigger and the backfill.
--
-- security invoker, so a signed-in caller can only ever see and rewrite their
-- own sets — RLS is the scope. The window still partitions by user_id, because
-- the same function runs as the table owner during backfill, where RLS is not
-- in the path and every user's rows are visible at once.
--
-- Chronology is (workout start, set number, id). workout_sets has no
-- created_at; set_number is the order within a session and id is the
-- tiebreaker, so the ordering is total and stable.
create or replace function public.recompute_pr_flags(p_exercise uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed integer;
begin
  with ordered as (
    select
      s.id,
      w.user_id,
      w.started_at,
      s.set_number,
      -- Plan §5: warmups and sets missing weight or reps never count toward
      -- records. They are still selected, so a set that stops qualifying
      -- (edited to a warmup) gets its flags cleared rather than left stale.
      (
        s.set_type <> 'warmup'
        and s.weight_kg is not null
        and s.reps is not null
        and s.reps > 0
      ) as qualifies,
      s.weight_kg,
      s.weight_kg * (1 + s.reps::numeric / 30) as e1rm
    from public.workout_sets s
    join public.workouts w on w.id = s.workout_id
    where s.exercise_id = p_exercise
  ),
  flagged as (
    select
      id,
      qualifies
        and weight_kg > coalesce(
          max(case when qualifies then weight_kg end) over prior, -1
        ) as pr_weight,
      qualifies
        and e1rm > coalesce(
          max(case when qualifies then e1rm end) over prior, -1
        ) as pr_e1rm
    from ordered
    window prior as (
      partition by user_id
      order by started_at, set_number, id
      rows between unbounded preceding and 1 preceding
    )
  )
  update public.workout_sets t
     set pr_weight = f.pr_weight,
         pr_e1rm = f.pr_e1rm
    from flagged f
   where t.id = f.id
     -- Write only what actually changed. Logging one set touches one row
     -- rather than rewriting the exercise's whole history every time.
     and (t.pr_weight, t.pr_e1rm) is distinct from (f.pr_weight, f.pr_e1rm);

  get diagnostics changed = row_count;
  return changed;
end;
$$;

comment on function public.recompute_pr_flags(uuid) is
  'Rebuild pr_weight / pr_e1rm for every set of one exercise, for the calling user. Idempotent.';

revoke execute on function public.recompute_pr_flags(uuid) from public;
grant execute on function public.recompute_pr_flags(uuid) to authenticated;

-- ── Per-workout totals, for the History list ───────────────────────────────
-- History showed a name, a date and a duration, and nothing about what
-- actually happened — you had to expand a session to find out whether it was
-- heavy. This is the one round trip that lets a collapsed row carry volume,
-- set count and whether the session set a record.
--
-- Deliberately NOT folded into session_volume_history: that function feeds the
-- Volume tab, where `set_count` means *qualifying working sets* because it
-- drives charts that exclude warmups. A History row counts what the user
-- logged, warmups included, because that is what they will count if they look.
-- Two different questions that happen to share a word.
create or replace function public.workout_totals()
returns table (
  workout_id uuid,
  volume_kg numeric,
  set_count bigint,
  record_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.workout_id,
    coalesce(sum(s.weight_kg * s.reps) filter (
      where s.set_type <> 'warmup' and s.weight_kg is not null and s.reps is not null
    ), 0),
    count(*),
    count(*) filter (where s.pr_weight or s.pr_e1rm)
  from public.workout_sets s
  group by s.workout_id;
$$;

comment on function public.workout_totals() is
  'Volume, total set count and record count per workout, for the calling user only. One row per workout that has at least one set.';

revoke execute on function public.workout_totals() from public;
grant execute on function public.workout_totals() to authenticated;

-- ── Triggers ───────────────────────────────────────────────────────────────
-- Flags are maintained by the database, not by the client. Three reasons, and
-- the first is the one that matters: §2.1 makes the logging flow sacred, and a
-- client-side implementation means a second round trip between tapping "Log
-- set" and knowing whether it was a record. Second, History's edit-a-set path
-- and the importer both write sets without going near the log screen, and any
-- client-side rule would have to be duplicated in all three. Third, a stored
-- value that only one caller knows how to maintain is a value that goes stale.
--
-- INSERT is handled BEFORE, not AFTER, and that is the whole point. PostgREST
-- returns the row from the INSERT's own RETURNING clause, which is evaluated
-- before any AFTER trigger runs — so an AFTER trigger would set the flag in
-- the table and hand the client back `false`. The log screen would then need a
-- second query to find out whether the set it just logged was a record, on the
-- one path in the app that must never wait. Assigning to NEW in a BEFORE
-- trigger puts the answer in the response the client already asked for.
--
-- The comparison is against sets strictly EARLIER in (workout start, set
-- number) order rather than "every set that already exists", so the importer —
-- which inserts nine months of history in arbitrary order — gets the same
-- answer as a live log.
create or replace function public.workout_sets_pr_flags_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid;
  v_started timestamptz;
  v_e1rm numeric;
  v_prev_weight numeric;
  v_prev_e1rm numeric;
begin
  if new.set_type = 'warmup'
     or new.weight_kg is null
     or new.reps is null
     or new.reps <= 0 then
    new.pr_weight := false;
    new.pr_e1rm := false;
    return new;
  end if;

  select w.user_id, w.started_at into v_user, v_started
  from public.workouts w
  where w.id = new.workout_id;

  v_e1rm := new.weight_kg * (1 + new.reps::numeric / 30);

  select
    max(s.weight_kg),
    max(s.weight_kg * (1 + s.reps::numeric / 30))
  into v_prev_weight, v_prev_e1rm
  from public.workout_sets s
  join public.workouts w on w.id = s.workout_id
  where s.exercise_id = new.exercise_id
    and w.user_id = v_user
    and s.set_type <> 'warmup'
    and s.weight_kg is not null
    and s.reps is not null
    and s.reps > 0
    and (w.started_at, s.set_number) < (v_started, new.set_number);

  new.pr_weight := new.weight_kg > coalesce(v_prev_weight, -1);
  new.pr_e1rm := v_e1rm > coalesce(v_prev_e1rm, -1);
  return new;
end;
$$;

drop trigger if exists workout_sets_pr_flags_ins on public.workout_sets;
create trigger workout_sets_pr_flags_ins
  before insert on public.workout_sets
  for each row
  execute function public.workout_sets_pr_flags_insert();

-- Editing or deleting a set can invalidate every flag after it — correcting a
-- typo'd 150 kg down to 50 kg promotes whatever set came next. That is rare,
-- off the hot path, and worth a full rebuild of the exercise rather than a
-- clever incremental update.
--
-- The depth guard is real: the rebuild's own UPDATE would fire this trigger
-- again. Bailing above depth 1 stops that and costs nothing at depth 1.
create or replace function public.workout_sets_pr_flags_rebuild()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  perform public.recompute_pr_flags(
    case when tg_op = 'DELETE' then old.exercise_id else new.exercise_id end
  );
  if tg_op = 'UPDATE' and old.exercise_id is distinct from new.exercise_id then
    perform public.recompute_pr_flags(old.exercise_id);
  end if;
  return null;
end;
$$;

drop trigger if exists workout_sets_pr_flags on public.workout_sets;
drop trigger if exists workout_sets_pr_flags_upd on public.workout_sets;
create trigger workout_sets_pr_flags_upd
  after delete or update of weight_kg, reps, set_type, exercise_id
  on public.workout_sets
  for each row
  execute function public.workout_sets_pr_flags_rebuild();
