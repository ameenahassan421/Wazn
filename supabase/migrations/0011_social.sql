-- Stage 3: profiles, follows, a feed, likes and a leaderboard.
--
-- Plan §Stage 3: "Visibility enforced in RLS (private default / followers),
-- never client-side." Everything in this file exists to make that sentence
-- true in a way a client cannot route around — including a client that is not
-- the Wazn app, holding a valid access token and talking to PostgREST
-- directly. That is the threat model, and it is the one the tests exercise.

-- ── Profiles: identity and the opt-in ──────────────────────────────────────
-- Default 'private'. Sharing is something you turn on, never something that
-- happens because a feature shipped.
alter table public.profiles
  add column if not exists username text;

alter table public.profiles
  add column if not exists visibility text not null default 'private';

alter table public.profiles
  drop constraint if exists profiles_visibility_check;
alter table public.profiles
  add constraint profiles_visibility_check
  check (visibility in ('private', 'followers', 'public'));

-- Usernames are typed by people, into a follow box, from memory. Lowercase,
-- 3-20 characters, letters/digits/underscore — a set with no lookalike
-- punctuation and nothing that needs escaping in a URL.
alter table public.profiles
  drop constraint if exists profiles_username_check;
alter table public.profiles
  add constraint profiles_username_check
  check (username is null or username ~ '^[a-z0-9_]{3,20}$');

-- Case-insensitive uniqueness without the citext extension: the check above
-- already forbids uppercase, so a plain unique index is the whole story and
-- the client is required to lowercase before it writes.
create unique index if not exists profiles_username_key
  on public.profiles (username)
  where username is not null;

-- ── Follows ────────────────────────────────────────────────────────────────
create table if not exists public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  -- Following yourself would put you in your own feed and your own
  -- leaderboard, which is a bug that reads as a feature until you see it.
  constraint follows_not_self check (follower_id <> following_id)
);

-- The primary key covers "who does X follow". The feed asks the other
-- direction — "who follows X" — on every visibility check, so it gets its own
-- index rather than a sequential scan per row.
create index if not exists follows_following_idx
  on public.follows (following_id);

alter table public.follows enable row level security;

-- ── Likes ──────────────────────────────────────────────────────────────────
create table if not exists public.workout_likes (
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, workout_id)
);

create index if not exists workout_likes_workout_idx
  on public.workout_likes (workout_id);

alter table public.workout_likes enable row level security;

-- ── Invites ────────────────────────────────────────────────────────────────
-- A code, not a guessable id. Block 3's onboarding flow resolves it to the
-- inviter so a new signup lands already following the person who invited them.
create table if not exists public.invites (
  code text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint invites_code_check check (code ~ '^[a-z0-9]{8,16}$')
);

create index if not exists invites_user_idx on public.invites (user_id);

alter table public.invites enable row level security;

-- ── The visibility predicate ───────────────────────────────────────────────
-- Every rule in this file reduces to this one function, so there is exactly
-- one definition of "can A see B" to get right, review, or change later.
--
-- SECURITY DEFINER on purpose, and the reason is not convenience. A policy on
-- `workouts` that reads `follows` and `profiles` makes those tables' own
-- policies part of the check, which is both a recursion hazard and a
-- performance cliff. A definer function reads them once, plainly.
--
-- It takes the *viewer* from auth.uid() internally rather than as an argument,
-- which is what makes it safe to expose to `authenticated`: the only question
-- it will answer is "can I see X", and a caller can already determine that by
-- selecting from the table.
--
-- Exposing it is not optional. A policy expression is evaluated as the
-- *querying* role, so a function the caller cannot EXECUTE makes the policy
-- itself fail with "permission denied" — which is how `supabase/tests/
-- rls_social.sql` found this before it shipped. What keeps these functions off
-- the API is the schema: `private` is not in PostgREST's exposed list, so
-- there is no `/rest/v1/rpc/can_view` to call. `anon` gets nothing.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.can_view(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      -- Your own rows, always, whatever your visibility says.
      when target = (select auth.uid()) then true
      when (select auth.uid()) is null then false
      else exists (
        select 1
        from public.profiles p
        where p.id = target
          and (
            p.visibility = 'public'
            or (
              p.visibility = 'followers'
              and exists (
                select 1 from public.follows f
                where f.following_id = target
                  and f.follower_id = (select auth.uid())
              )
            )
          )
      )
    end;
$$;

revoke execute on function private.can_view(uuid) from public, anon;
grant execute on function private.can_view(uuid) to authenticated;

-- Discoverability is a weaker question than visibility: can this person be
-- found by username, or resolved from an invite link? Anyone who is not
-- private can. A private profile is not findable at all, which is what
-- "private" has to mean or the setting is decoration.
create or replace function private.is_discoverable(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = target and p.visibility in ('followers', 'public')
  );
$$;

revoke execute on function private.is_discoverable(uuid) from public, anon;
grant execute on function private.is_discoverable(uuid) to authenticated;

-- ── Policies ───────────────────────────────────────────────────────────────

-- Profiles: your own, plus anyone discoverable. Discoverable is deliberately
-- broader than can_view — you have to be able to find someone before you can
-- follow them, and their name is all "finding" exposes. Their training is
-- still behind can_view.
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_select_visible on public.profiles;
create policy profiles_select_visible on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or visibility in ('followers', 'public')
  );

-- Workouts: your own always; other people's only when FINISHED and only when
-- can_view says so. An in-progress workout is never visible to anyone else,
-- at any visibility setting — mid-session is not a broadcast.
drop policy if exists workouts_select_own on public.workouts;
drop policy if exists workouts_select_visible on public.workouts;
create policy workouts_select_visible on public.workouts
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (ended_at is not null and private.can_view(user_id))
  );

-- Sets follow their workout. Same rule, one function, so the feed and the
-- workout it summarises can never disagree about who may read them.
drop policy if exists workout_sets_select_own on public.workout_sets;
drop policy if exists workout_sets_select_visible on public.workout_sets;
create policy workout_sets_select_visible on public.workout_sets
  for select to authenticated
  using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_sets.workout_id
        and (
          w.user_id = (select auth.uid())
          or (w.ended_at is not null and private.can_view(w.user_id))
        )
    )
  );

-- Follows: you manage your own following list and nobody else's. You may also
-- read who follows you, so a follower count is possible without a definer
-- function.
drop policy if exists follows_select_visible on public.follows;
create policy follows_select_visible on public.follows
  for select to authenticated
  using (
    follower_id = (select auth.uid())
    or following_id = (select auth.uid())
  );

drop policy if exists follows_insert_own on public.follows;
create policy follows_insert_own on public.follows
  for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    -- You cannot follow someone who is not discoverable. Without this, a
    -- private profile could be followed by anyone who learned its id, and
    -- 'followers' visibility would then hand over their training.
    and private.is_discoverable(following_id)
  );

drop policy if exists follows_delete_own on public.follows;
create policy follows_delete_own on public.follows
  for delete to authenticated
  using (follower_id = (select auth.uid()));

-- Likes: you can like anything you can see, and unlike your own likes. Reading
-- likes is scoped to workouts you can see, so a like count never leaks the
-- existence of a workout you cannot read.
drop policy if exists workout_likes_select_visible on public.workout_likes;
create policy workout_likes_select_visible on public.workout_likes
  for select to authenticated
  using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_likes.workout_id
        and (w.user_id = (select auth.uid())
             or (w.ended_at is not null and private.can_view(w.user_id)))
    )
  );

drop policy if exists workout_likes_insert_own on public.workout_likes;
create policy workout_likes_insert_own on public.workout_likes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.workouts w
      where w.id = workout_likes.workout_id
        and w.ended_at is not null
        and private.can_view(w.user_id)
    )
  );

drop policy if exists workout_likes_delete_own on public.workout_likes;
create policy workout_likes_delete_own on public.workout_likes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Invites: yours to create and revoke. Resolving somebody else's code is done
-- through a function, not by reading this table — otherwise a signed-in user
-- could enumerate every invite in the system.
drop policy if exists invites_select_own on public.invites;
create policy invites_select_own on public.invites
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists invites_insert_own on public.invites;
create policy invites_insert_own on public.invites
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.is_discoverable(user_id)
  );

drop policy if exists invites_delete_own on public.invites;
create policy invites_delete_own on public.invites
  for delete to authenticated using (user_id = (select auth.uid()));

-- ── The feed ───────────────────────────────────────────────────────────────
-- security invoker, and that is the whole design. The function selects from
-- `workouts` with no visibility logic of its own; the policy above decides
-- what comes back. There is deliberately no second copy of the rule here to
-- drift out of step with the first.
create or replace function public.social_feed(p_limit int default 30, p_before timestamptz default null)
returns table (
  workout_id uuid,
  user_id uuid,
  username text,
  display_name text,
  name text,
  started_at timestamptz,
  ended_at timestamptz,
  volume_kg numeric,
  set_count bigint,
  record_count bigint,
  like_count bigint,
  liked_by_me boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    w.id,
    w.user_id,
    p.username,
    p.display_name,
    w.name,
    w.started_at,
    w.ended_at,
    coalesce(sum(s.weight_kg * s.reps) filter (
      where s.set_type <> 'warmup' and s.weight_kg is not null and s.reps is not null
    ), 0),
    count(s.id),
    count(s.id) filter (where s.pr_weight or s.pr_e1rm),
    (select count(*) from public.workout_likes l where l.workout_id = w.id),
    exists (
      select 1 from public.workout_likes l
      where l.workout_id = w.id and l.user_id = (select auth.uid())
    )
  from public.workouts w
  join public.profiles p on p.id = w.user_id
  left join public.workout_sets s on s.workout_id = w.id
  where w.ended_at is not null
    and w.user_id in (
      select f.following_id from public.follows f
      where f.follower_id = (select auth.uid())
    )
    and (p_before is null or w.started_at < p_before)
  group by w.id, w.user_id, p.username, p.display_name, w.name, w.started_at, w.ended_at
  order by w.started_at desc
  limit least(greatest(p_limit, 1), 50);
$$;

revoke execute on function public.social_feed(int, timestamptz) from public;
grant execute on function public.social_feed(int, timestamptz) to authenticated;

-- ── The weekly leaderboard ─────────────────────────────────────────────────
-- The caller plus everyone they follow, for the current week. Also security
-- invoker: someone whose visibility stops you seeing their workouts
-- contributes nothing, because the rows are not there to sum.
--
-- The week starts Monday (date_trunc('week')), in UTC. A leaderboard whose
-- boundary moves per viewer would show different standings to two people
-- looking at the same table.
create or replace function public.weekly_leaderboard()
returns table (
  user_id uuid,
  username text,
  display_name text,
  volume_kg numeric,
  session_count bigint,
  is_me boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with circle as (
    select (select auth.uid()) as id
    union
    select f.following_id from public.follows f where f.follower_id = (select auth.uid())
  ),
  sessions as (
    select w.id, w.user_id
    from public.workouts w
    where w.ended_at is not null
      and w.started_at >= date_trunc('week', now())
      and w.user_id in (select id from circle)
  )
  select
    c.id,
    p.username,
    p.display_name,
    coalesce(sum(s.weight_kg * s.reps) filter (
      where s.set_type <> 'warmup' and s.weight_kg is not null and s.reps is not null
    ), 0),
    count(distinct sess.id),
    c.id = (select auth.uid())
  from circle c
  join public.profiles p on p.id = c.id
  left join sessions sess on sess.user_id = c.id
  left join public.workout_sets s on s.workout_id = sess.id
  group by c.id, p.username, p.display_name
  order by 4 desc, 5 desc;
$$;

revoke execute on function public.weekly_leaderboard() from public;
grant execute on function public.weekly_leaderboard() to authenticated;

-- ── Resolving an invite ────────────────────────────────────────────────────
-- Definer, because the caller must not be able to read `invites` at large. It
-- returns only what a landing page needs to say "X invited you", and only for
-- a profile that is discoverable — a revoked-to-private profile stops
-- resolving even if the link is still in somebody's messages.
create or replace function public.resolve_invite(p_code text)
returns table (user_id uuid, username text, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name
  from public.invites i
  join public.profiles p on p.id = i.user_id
  where i.code = lower(p_code)
    and p.visibility in ('followers', 'public');
$$;

revoke execute on function public.resolve_invite(text) from public;
grant execute on function public.resolve_invite(text) to authenticated;

-- `anon` too, deliberately. The invite landing page needs to say "Ameen
-- invited you" *before* the visitor has an account — that sentence is most of
-- why an invite link works at all, and at that moment there is no session to
-- authorise with.
--
-- What it costs: someone holding a valid code learns a display name and a
-- username. That is precisely what the inviter chose to share by sending the
-- link. What it does not allow is enumeration — a code is 12 characters from
-- a 36-symbol alphabet, about 62 bits, and the function returns nothing for a
-- code that does not exist or for a profile that has gone private since.
grant execute on function public.resolve_invite(text) to anon;
