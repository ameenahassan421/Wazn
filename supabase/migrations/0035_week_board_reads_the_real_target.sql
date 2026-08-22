-- 0035: the weekly target already existed, three migrations before 0030 added
-- a second one.
--
-- 0030 added `profiles.weekly_target smallint` and justified it at length:
-- "one scalar per person with no history requirement yet". The reasoning was
-- fine and the premise was not checked. `0027_body_and_coach.sql:206` had
-- already created:
--
--   alter table public.user_preferences
--     add column if not exists weekly_target integer not null default 3
--     check (weekly_target between 1 and 14);
--
-- and `upsert_user_preference` has had a `weekly_target` branch since the same
-- migration, wired to `coach-context.tsx` on the web. So there were two columns
-- of the same name and meaning in two tables, one of them written by a shipped
-- UI and the other written by nothing.
--
-- Measured on 2026-08-22, before this ran:
--
--   user_preferences.weekly_target set   5 rows, all 3
--   profiles.weekly_target set           0 rows
--
-- 0034's `week_board()` read the empty one. Every row on the board would have
-- reported "no target committed" for five people who have committed to three
-- sessions a week, and the ranking would have silently fallen back to the
-- four-week baseline for all of them. Caught before any screen was built on it.
--
-- WHICH ONE SURVIVES
--
-- `user_preferences`, because it is the one with rows in it and the one with a
-- writer. Choosing the empty column would mean writing a backfill, a second
-- writer and a migration of the existing UI to reach the same place.
--
-- The argument for `profiles` was visibility: crew members have to see each
-- other's adherence, and `user_preferences` is scoped to its owner. That is
-- answered without a second column, because `week_board()` is `security
-- definer` and returns only the target integer, never the preference row. A
-- target is the one preference the board is explicitly about.
--
-- NOT NULL DEFAULT 3 CHANGES THE SEMANTICS, AND IT IS WORTH SAYING SO
--
-- 0030's column was nullable, and 0034's comment leaned on that: null meant
-- "has not committed to a number", rendered differently from zero. The real
-- column cannot express that. Everyone has 3 the moment they have a
-- preferences row, whether they chose it or not.
--
-- So the board ranks a DEFAULT as though it were a commitment. That is a
-- product question worth answering deliberately (FRIENDS_PLAN F2 ranks on a
-- "committed" target, and a default nobody typed is not a commitment), but it
-- is answered by adding a "chosen" flag or a null state to 0027's column, not
-- by keeping a duplicate. Logged in DECISIONS.md rather than smuggled in here.
create or replace function public.week_board()
returns table (
  user_id uuid,
  username text,
  display_name text,
  is_me boolean,
  weekly_target smallint,
  sessions_this_week integer,
  avg_sessions_4w numeric,
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
      -- divided by a week that is one day old.
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
    /*
     * From `user_preferences`, the column that has rows in it. `left join`
     * rather than `join`: a profile with no preferences row yet must still
     * appear on the board, and it falls back to its own baseline exactly as an
     * unset target would have.
     */
    up.weekly_target::smallint,
    t.this_week,
    t.avg_4w,
    /*
     * Adherence against the target, or against the person's own four-week
     * baseline when there is no preferences row. Null when there is neither,
     * which is a brand new account: it sorts last and the board says so in
     * words rather than printing a 0.00 that reads as failure.
     *
     * Capped at 2 so one person doing eight against a target of two cannot lap
     * a crew who all hit their own numbers. This ranks reliability, and beating
     * a target fourfold is not four times as reliable as meeting it.
     */
    case
      when coalesce(up.weekly_target::numeric, nullif(t.avg_4w, 0)) is null then null
      else least(
        2.0,
        round(
          t.this_week::numeric
            / coalesce(up.weekly_target::numeric, nullif(t.avg_4w, 0)),
          2
        )
      )
    end as adherence
  from tally t
  join public.profiles p on p.id = t.id
  left join public.user_preferences up on up.user_id = t.id
  order by
    8 desc nulls last,
    6 desc,
    p.username;
$$;

comment on function public.week_board() is
  'The Week Board. Ranks the caller and their crew on adherence to each '
  'person''s OWN weekly target, never on volume: see docs/FRIENDS_PLAN.md F2 '
  'and the STEP UP trial. Target comes from user_preferences.weekly_target '
  '(0027), not from the duplicate 0030 added to profiles and 0035 dropped. '
  'Returns one row at n=1 so the board is useful before anybody is invited.';

revoke execute on function public.week_board() from public, anon;
grant execute on function public.week_board() to authenticated, service_role;

-- The duplicate goes. It was added by 0030, read only by 0034, written by
-- nothing, and it held zero rows at the moment this ran. Leaving it would mean
-- two columns named `weekly_target` in two tables, which is how the next
-- session ships the same defect in the other direction.
--
-- The check constraint is unnamed in 0030 (`check (...)` inside `add column`),
-- so Postgres generated a name and dropping the column drops it too.
alter table public.profiles drop column if exists weekly_target;
