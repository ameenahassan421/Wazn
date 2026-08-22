-- 0036: a private profile should not appear on somebody else's Week Board.
--
-- Found reviewing 0034/0035 before the screen shipped.
--
-- `week_board()` gated WORKOUTS with `private.can_view(w.user_id)` and did not
-- gate the circle itself. The function is `security definer`, so its join to
-- `public.profiles` bypasses the `profiles_select_visible` policy that would
-- otherwise hide a private row.
--
-- The result was worse than a leak, because it was also wrong. Someone I follow
-- who has set `visibility = 'private'`:
--
--   * their workouts were correctly excluded, so `sessions_this_week` was 0
--   * their NAME and their `weekly_target` were returned anyway
--   * so my board showed "Layla — 0 of 3" for a person who may have trained
--     five times that week and who has explicitly asked not to be seen
--
-- A privacy setting that produces a defamatory zero instead of an absence is
-- the worst of both outcomes.
--
-- `private.can_view` already encodes the rule (own rows always; otherwise
-- `public`, or `followers` when a follow exists), so this is the same predicate
-- applied one level further out, at the point where membership is decided
-- rather than only where sessions are counted.
--
-- F1 in docs/FRIENDS_PLAN.md: "visibility is a database decision, never a
-- client one". Filtering these rows in the screen would have been the client
-- deciding.
--
-- With the circle gated, the per-row `can_view` on `sessions` is redundant. It
-- stays: it costs nothing on a handful of rows, and a predicate that is correct
-- in two places survives one of them being edited by somebody who did not read
-- this comment.
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
    select f.following_id
    from public.follows f
    where f.follower_id = (select auth.uid())
      -- The fix. Membership, not just session counting, is gated on
      -- visibility. `can_view` returns true for your own id unconditionally,
      -- so this never hides the caller from their own board.
      and private.can_view(f.following_id)
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
    up.weekly_target::smallint,
    t.this_week,
    t.avg_4w,
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
  '(0027). Membership is gated on private.can_view, so a profile that has '
  'opted out is absent rather than shown with a zero. Returns one row at n=1 '
  'so the board is useful before anybody is invited.';

revoke execute on function public.week_board() from public, anon;
grant execute on function public.week_board() to authenticated, service_role;
