-- 0038: the invite carries a reason.
--
-- `docs/FRIENDS_PLAN.md` F6, the second half of S0:
--
--   And the invite carries a reason. An invite link opens on the inviter's
--   actual week, so accepting is joining something visible rather than
--   downloading an app on faith.
--
-- `resolve_invite(code)` returns a name and nothing else, so the landing screen
-- could say "Ameen wants you on the board" and could not say what the board
-- was. That sentence asks for trust; this one shows the thing.
--
-- ANON, DELIBERATELY, AND THE ARGUMENT IS 0011'S
--
-- The landing page exists to be read BEFORE the visitor has an account, which
-- is the whole mechanism of an invite link. 0011 made the same call for
-- `resolve_invite` and wrote out the cost: someone holding a valid code learns
-- a display name and a username, which is exactly what the inviter chose to
-- share by sending the link. A code is 12 characters over a 36-symbol alphabet,
-- about 62 bits, so it cannot be enumerated.
--
-- This widens that disclosure by three integers: how many sessions the inviter
-- has done this week, what they committed to, and their four-week average. That
-- is the content of the invite rather than a leak from it, and it is the same
-- data their crew already sees.
--
-- The visibility gate is `resolve_invite`'s, restated: a private profile
-- resolves to no rows, so a link from someone who has opted out shows nothing
-- rather than showing their week.
--
-- NO ADHERENCE COLUMN
--
-- The board's `adherence` is a capped sort key and there is nothing to sort
-- here: one row, no ranking. Returning it would invite the landing screen to
-- render "2.00" at a stranger, which means less than nothing to somebody who
-- has not seen the app yet.
create or replace function public.invite_preview(p_code text)
returns table (
  user_id uuid,
  username text,
  display_name text,
  weekly_target smallint,
  sessions_this_week integer,
  avg_sessions_4w numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with inviter as (
    select p.id, p.username, p.display_name
    from public.invites i
    join public.profiles p on p.id = i.user_id
    where i.code = lower(p_code)
      -- Same gate as resolve_invite. A private profile shows nothing.
      and p.visibility in ('followers', 'public')
  ),
  sessions as (
    select w.id, w.started_at
    from public.workouts w
    join inviter n on n.id = w.user_id
    where w.ended_at is not null
      and w.started_at >= date_trunc('week', now()) - interval '4 weeks'
      -- 0030's rule, so the number on the landing page and the number on the
      -- inviter's own board are the same number.
      and exists (select 1 from public.workout_sets s where s.workout_id = w.id)
  )
  select
    n.id,
    n.username,
    n.display_name,
    -- Null unless they actually chose it: 0037's rule, so a stranger is not
    -- shown "3 of 3" against a default nobody picked.
    case when up.weekly_target_set_at is null then null
         else up.weekly_target::smallint end,
    (select count(*) filter (where s.started_at >= date_trunc('week', now()))
       from sessions s)::integer,
    (select round(
       count(*) filter (where s.started_at < date_trunc('week', now()))::numeric / 4,
       1)
       from sessions s)
  from inviter n
  left join public.user_preferences up on up.user_id = n.id;
$$;

comment on function public.invite_preview(text) is
  'What an invite link shows before the visitor has an account: the inviter''s '
  'name and their actual week. FRIENDS_PLAN F6, "the invite carries a reason". '
  'Anon-executable on purpose, same argument as resolve_invite in 0011, and '
  'gated on the same profile visibility.';

-- PUBLIC off, then anon back on deliberately. Writing both halves because 0030
-- shipped a function anon could still reach by revoking only one of them.
revoke execute on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated, service_role;
