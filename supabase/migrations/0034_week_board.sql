-- 0034: the Week Board, ranked on adherence rather than output.
--
-- S0 of docs/FRIENDS_PLAN.md. This replaces what `weekly_leaderboard()` does,
-- and the replacement is the central design decision in that document rather
-- than a refactor.
--
-- WHAT THE SHIPPED FUNCTION DOES, AND WHY IT IS WRONG
--
-- `weekly_leaderboard()` ends with `order by 4 desc, 5 desc`, where column 4 is
-- `volume_kg`. It ranks the crew by how much weight everybody moved. Part 4 F2
-- calls that out by name as "a deliberate break from v5":
--
--   Volume is won by whoever trains longest and heaviest, which means it is won
--   by the same person every week.
--
-- The STEP UP trial is the evidence behind the break. Its competition arm was
-- the only durable one, and it was scored on adherence to each participant's
-- OWN baseline-derived goal, not on absolute output. A leaderboard that ranks
-- on volume reproduces the arm that did not last.
--
-- So this ranks on sessions completed against each person's own committed
-- target. The heaviest lifter in a crew has no structural advantage; the person
-- who said four and did four beats the person who said four and did three.
--
-- IT ALSO HAS TO AGREE WITH PROGRESS
--
-- 0030 established that a workout with no sets is not a session, after three
-- stray Start taps inflated `sessions_this_week` from 4 to 7. `weekly_review()`
-- excludes them and `weekly_leaderboard()` does not, so the two screens would
-- report different session counts for the same week. Same `exists` clause here.
--
-- WORKS AT n=1, WHICH IS THE POINT OF S0
--
-- F6: "With no crew, Friends shows you against yourself. The same Week Board,
-- the same layout, one row: this week against your own four-week average."
--
-- Measured on 2026-08-22, production holds 9 profiles, ONE follow row, and ZERO
-- rows with a `weekly_target` set. So the solo case is not an edge case to
-- handle politely, it is the only case that exists today, and a board that
-- needs a crew or a target to say anything would be blank for every account.
--
-- Hence `avg_sessions_4w`, returned for everybody. It is the comparison the
-- solo row renders, and it is the fallback the ranking uses for anyone who has
-- not committed to a number. `weekly_target` stays nullable because "has not
-- set one" is a real state that the board renders differently from zero.
--
-- `security definer` because it reads other people's profiles and workouts,
-- gated by `private.can_view` exactly as `weekly_leaderboard` was. No new
-- visibility system: F1 says crews reuse the existing `follows` predicate.
create or replace function public.week_board()
returns table (
  user_id uuid,
  username text,
  display_name text,
  is_me boolean,
  -- Null means "has not committed to a number", which the board renders as an
  -- invitation rather than as a zero.
  weekly_target smallint,
  sessions_this_week integer,
  -- This person's own four-week baseline, to one decimal. The solo row's whole
  -- comparison, and the ranking's fallback when no target is set.
  avg_sessions_4w numeric,
  -- Sessions divided by the target (or the baseline). Capped at 2 so that one
  -- person doing eight against a target of two cannot lap a crew that all hit
  -- their own numbers: this ranks reliability, and beating your target by four
  -- times is not four times as reliable as hitting it.
  adherence numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with circle as (
    select (select auth.uid()) as id
    union
    select f.following_id from public.follows f where f.follower_id = (select auth.uid())
  ),
  -- Every finished, non-empty session in the last 28 days, once, so the week
  -- count and the baseline are computed from one definition of "session".
  sessions as (
    select w.id, w.user_id, w.started_at
    from public.workouts w
    where w.ended_at is not null
      and w.user_id in (select id from circle)
      and private.can_view(w.user_id)
      and w.started_at >= date_trunc('week', now()) - interval '4 weeks'
      -- 0030's rule. A workout nobody put a set into did not happen.
      and exists (select 1 from public.workout_sets s where s.workout_id = w.id)
  ),
  tally as (
    select
      c.id,
      count(*) filter (
        where sess.started_at >= date_trunc('week', now())
      )::integer as this_week,
      -- The four COMPLETE weeks before this one, so a Monday reading is not
      -- divided by a week that is one day old. Same reasoning as 0030's
      -- whole-week bound on `weeks_trained_of_8`.
      round(
        count(*) filter (
          where sess.started_at < date_trunc('week', now())
        )::numeric / 4,
        1
      ) as avg_4w
    from circle c
    left join sessions sess on sess.user_id = c.id
    group by c.id
  )
  select
    t.id,
    p.username,
    p.display_name,
    t.id = (select auth.uid()),
    p.weekly_target,
    t.this_week,
    t.avg_4w,
    /*
     * Adherence, against the target if there is one and the baseline if there
     * is not. Null when there is neither, which is a brand new account with no
     * history and no commitment: it sorts last and the board says so in words
     * rather than printing a 0.00 that looks like failure.
     */
    case
      when coalesce(p.weekly_target::numeric, nullif(t.avg_4w, 0)) is null then null
      else least(
        2.0,
        round(
          t.this_week::numeric
            / coalesce(p.weekly_target::numeric, nullif(t.avg_4w, 0)),
          2
        )
      )
    end as adherence
  from tally t
  join public.profiles p on p.id = t.id
  order by
    -- Nulls last: no target and no history is the bottom of the board, not the
    -- top, which is what `nulls last` buys that a bare `desc` does not.
    8 desc nulls last,
    6 desc,
    p.username;
$$;

comment on function public.week_board() is
  'The Week Board. Ranks the caller and their crew on adherence to each '
  'person''s OWN weekly target, never on volume: see docs/FRIENDS_PLAN.md F2 '
  'and the STEP UP trial. Returns one row at n=1 so the board is useful before '
  'anybody is invited.';

-- Both revokes, then grant back. 0031's sweep fails any `public` function that
-- still carries Postgres's default PUBLIC grant, and its allowlist is empty.
revoke execute on function public.week_board() from public, anon;
grant execute on function public.week_board() to authenticated, service_role;
