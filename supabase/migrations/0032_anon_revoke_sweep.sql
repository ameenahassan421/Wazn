-- 0032: close the anon surface 0031's sweep exposed.
--
-- 0031 added a check to `supabase/tests/coach_surfaces.sql` that fails when a
-- `public` function still carries Postgres's default PUBLIC execute grant. Nine
-- functions were grandfathered rather than fixed, because revoking a grant is a
-- change to auth and plan section 2.6 makes that an ask. Ameen asked for it on
-- 2026-08-22, so the allowlist in that test is now empty and this is what
-- empties it.
--
-- Seventeen functions were executable by a signed-out request. None leaked
-- anything: every one is `security invoker`, so an anonymous call runs under
-- anon's RLS and returns zero rows. It is worth closing anyway, because
-- `/rest/v1/rpc/<name>` answering 200 to a signed-out caller is an invitation
-- to go looking for the one that does leak.
--
-- WHAT IS DELIBERATELY LEFT OPEN
--
-- `resolve_invite(text)` keeps anon EXECUTE. An invite link is how somebody
-- arrives BEFORE they have an account, so anon is the whole point. It is also
-- the only `security definer` function anon can reach, which is why Supabase's
-- linter flags it and why it stays flagged deliberately. 0011 grants it, 0028
-- records the reasoning, and 0031's test excludes it by name.
--
-- BOTH REVOKES, EVERY TIME
--
-- `from public, anon` in one statement, which is 0007's posture and the thing
-- 0028's comment talked the repo out of. Revoking only one leaves the other,
-- and that is the entire content of 0030's defect.
--
-- THE GRANT IS RESTATED, NOT ASSUMED
--
-- `revoke ... from public` also removes the grant `authenticated` would
-- otherwise inherit, so everything the app calls is granted back explicitly.
-- Verified against the callers rather than from memory: `exercise_1rm_history`
-- is called from `ProgressScreen.tsx` and `ExerciseDetail.tsx`, and a first
-- grep for `.rpc('` MISSED it because the call is split across lines. A revoke
-- written off that grep would have broken both charts.
--
-- `coach_stats()` is called by no screen; the Edge Functions build their stat
-- block from it (`functions/_shared/grounding.ts`). It keeps authenticated and
-- service_role for that reason.
--
-- The `workout_sets_pr_flags_*` functions return `trigger`. Postgres checks
-- EXECUTE when a trigger is CREATED, not when it fires, so they need no grant
-- to keep working. Granted anyway: it costs nothing, and a future
-- `create trigger` would otherwise fail for a reason unrelated to the trigger.
--
-- WHY THIS IS A LOOP AND NOT SEVENTEEN PAIRS OF STATEMENTS
--
-- Because one of the seventeen does not exist in this repo's own schema, and
-- the flat version died on it.
--
-- `workout_sets_pr_flags_trigger()` is live in production, is anon-executable,
-- and is created by NO migration. Reading it back explains why: it is an
-- earlier version of the PR-flag trigger that 0009 later split into
-- `_insert` and `_rebuild`. 0009 was edited after it had already been applied,
-- so production kept the superseded function and the chain never creates it.
-- Nothing references it either. `pg_trigger` on 2026-08-22 shows exactly two
-- triggers on `workout_sets`, bound to `_insert` and `_rebuild`; this one is
-- bound to nothing.
--
-- It is REVOKED here rather than dropped. Revoking closes the anon surface,
-- which is what was asked for, and does it without destroying an object whose
-- definition exists nowhere in version control. Dropping it is the right
-- follow-up and it is Ameen's call; its source is recorded in DECISIONS.md so
-- the decision can be made from the text rather than from a live database.
--
-- `to_regprocedure` returns null instead of raising for a name that is not
-- there, so the same migration is correct against an empty database and
-- against production, and says out loud which one it skipped.

do $$
declare
  sig text;
  fn regprocedure;
  targets constant text[] := array[
    'public.coach_stats()',
    'public.exercise_1rm_history(uuid)',
    'public.exercise_bests(uuid)',
    'public.exercise_records(uuid)',
    'public.exercise_usage()',
    'public.get_user_preferences()',
    'public.previous_session(uuid,uuid)',
    'public.recompute_pr_flags(uuid)',
    'public.session_brief()',
    'public.session_debrief(uuid)',
    'public.strength_summary()',
    'public.weekly_review()',
    'public.weekly_streak(text)',
    'public.workout_sets_pr_flags_insert()',
    'public.workout_sets_pr_flags_rebuild()',
    -- Production only. See the note above.
    'public.workout_sets_pr_flags_trigger()',
    'public.workout_totals()'
  ];
begin
  foreach sig in array targets loop
    fn := to_regprocedure(sig);
    if fn is null then
      raise notice '0032: % is not in this database, skipping', sig;
      continue;
    end if;
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end
$$;
