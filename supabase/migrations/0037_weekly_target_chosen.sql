-- 0037: a default is not a commitment.
--
-- `docs/FRIENDS_PLAN.md` F2 ranks the Week Board on adherence to each person's
-- own COMMITTED target, and the evidence it rests on is specific about that:
-- the STEP UP trial's durable arm scored participants against goals they had
-- accepted, derived from their own baseline. A number nobody typed is not a
-- goal anybody accepted.
--
-- `0027_body_and_coach.sql:206` created
-- `user_preferences.weekly_target integer not null default 3`, so the column
-- cannot express "has not chosen". Every account carries 3 from the moment a
-- preferences row exists. Measured 2026-08-22: five rows, every one of them 3,
-- and no evidence that any human picked the number.
--
-- So `week_board()` was ranking five people against a figure none of them set,
-- and somebody who trains twice a week deliberately read as failing.
--
-- WHY A TIMESTAMP AND NOT A BOOLEAN
--
-- `weekly_target_set_at` answers "did they choose it" the same way a boolean
-- would, and also answers "when", which the Pact needs at S2: the gate there is
-- whether pact-holders beat their own PRE-pact baseline, and that comparison
-- needs a date to split on. A boolean would have to be widened later, and
-- widening a column that the board reads is a worse migration than choosing
-- the wider type now, while nothing depends on it.
--
-- Null means never chosen. It stays null for the five existing rows rather than
-- being backfilled to `created_at`: nobody chose those, and inventing a
-- timestamp would be manufacturing the exact evidence this column exists to
-- record honestly.
alter table public.user_preferences
  add column if not exists weekly_target_set_at timestamptz;

comment on column public.user_preferences.weekly_target_set_at is
  'When the lifter last chose their weekly target. Null means the value in '
  'weekly_target is 0027''s default of 3 and not a commitment. week_board() '
  'ranks on it only when this is set, because FRIENDS_PLAN F2 ranks on a '
  'committed target and the STEP UP trial scored accepted goals.';

-- `upsert_user_preference` stamps it. This is the one writer, so putting the
-- stamp here means a target cannot be set without being marked as chosen: the
-- alternative is two statements from the client, and the second one being
-- forgotten is how the column would quietly become meaningless.
create or replace function public.upsert_user_preference(p_column text, p_value text)
returns public.user_preferences
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.user_preferences;
begin
  insert into public.user_preferences (user_id)
  values (v_uid)
  on conflict (user_id) do nothing;

  if p_column = 'weight_unit' then
    update public.user_preferences
    set weight_unit = p_value, updated_at = now()
    where user_id = v_uid
    returning * into v_row;
  elsif p_column = 'rpe_mode' then
    update public.user_preferences
    set rpe_mode = p_value, updated_at = now()
    where user_id = v_uid
    returning * into v_row;
  elsif p_column = 'locale' then
    update public.user_preferences
    set locale = p_value, updated_at = now()
    where user_id = v_uid
    returning * into v_row;
  elsif p_column = 'theme' then
    update public.user_preferences
    set theme = p_value, updated_at = now()
    where user_id = v_uid
    returning * into v_row;
  elsif p_column = 'coach_mode' then
    update public.user_preferences
    set coach_mode = p_value, updated_at = now()
    where user_id = v_uid
    returning * into v_row;
  elsif p_column = 'coach_volume' then
    update public.user_preferences
    set coach_volume = p_value, updated_at = now()
    where user_id = v_uid
    returning * into v_row;
  elsif p_column = 'meet_date' then
    update public.user_preferences
    set meet_date = nullif(p_value, '')::date, updated_at = now()
    where user_id = v_uid
    returning * into v_row;
  elsif p_column = 'weekly_target' then
    -- The stamp. Setting the target IS the act of committing to it.
    update public.user_preferences
    set weekly_target = p_value::integer,
        weekly_target_set_at = now(),
        updated_at = now()
    where user_id = v_uid
    returning * into v_row;
  elsif p_column = 'protein_target_g' then
    update public.user_preferences
    set protein_target_g = nullif(p_value, '')::integer, updated_at = now()
    where user_id = v_uid
    returning * into v_row;
  else
    select * into v_row from public.user_preferences where user_id = v_uid;
  end if;

  return v_row;
end;
$function$;

-- 0028 locked this one down and 0032 restated it. Restated again because
-- `create or replace` on a function does NOT reset its ACL, but a future
-- `drop`/`create` would, and 0031's sweep is the thing that would catch it.
revoke execute on function public.upsert_user_preference(text, text) from public, anon;
grant execute on function public.upsert_user_preference(text, text) to authenticated, service_role;

-- `week_board()` now ranks on the target only when it was chosen, and on the
-- lifter's own four-week baseline otherwise. The `weekly_target` column it
-- returns is likewise null when unchosen, so the screen renders "6" rather
-- than "6 of 3" for somebody who never picked 3.
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
      and private.can_view(f.following_id)
  ),
  sessions as (
    select w.id, w.user_id, w.started_at
    from public.workouts w
    where w.ended_at is not null
      and w.user_id in (select id from circle)
      and private.can_view(w.user_id)
      and w.started_at >= date_trunc('week', now()) - interval '4 weeks'
      and exists (select 1 from public.workout_sets s where s.workout_id = w.id)
  ),
  tally as (
    select
      c.id,
      count(*) filter (
        where sess.started_at >= date_trunc('week', now())
      )::integer as this_week,
      round(
        count(*) filter (
          where sess.started_at < date_trunc('week', now())
        )::numeric / 4,
        1
      ) as avg_4w
    from circle c
    left join sessions sess on sess.user_id = c.id
    group by c.id
  ),
  -- One place decides what counts as a commitment, so the returned column and
  -- the ranking cannot disagree about it.
  committed as (
    select
      t.id,
      case when up.weekly_target_set_at is null then null
           else up.weekly_target::smallint end as target,
      t.this_week,
      t.avg_4w
    from tally t
    left join public.user_preferences up on up.user_id = t.id
  )
  select
    c.id,
    p.username,
    p.display_name,
    c.id = (select auth.uid()),
    c.target,
    c.this_week,
    c.avg_4w,
    case
      when coalesce(c.target::numeric, nullif(c.avg_4w, 0)) is null then null
      else least(
        2.0,
        round(
          c.this_week::numeric / coalesce(c.target::numeric, nullif(c.avg_4w, 0)),
          2
        )
      )
    end as adherence
  from committed c
  join public.profiles p on p.id = c.id
  order by
    8 desc nulls last,
    6 desc,
    p.username;
$$;

comment on function public.week_board() is
  'The Week Board. Ranks on adherence to each person''s CHOSEN weekly target '
  '(user_preferences.weekly_target, only once weekly_target_set_at is stamped), '
  'falling back to their own four-week baseline, and never on volume: see '
  'docs/FRIENDS_PLAN.md F2 and the STEP UP trial. Membership is gated on '
  'private.can_view. Returns one row at n=1.';

revoke execute on function public.week_board() from public, anon;
grant execute on function public.week_board() to authenticated, service_role;
