-- 0025: theme preference.
--
-- R4 made the paper look the default and dark the toggle (Ameen, 2026-08-12;
-- docs/archive/REBUILD_PLAN.md, archived 2026-08-19). SUPERSEDED: v5
-- "Momentum" removed the paper theme and the toggle outright on 2026-08-16,
-- so this column is written by nothing and read by nothing. It is left in
-- place because dropping a column is a destructive migration bought for
-- nothing. The rest of this comment is the 2026-08-12 rationale, kept as
-- history. The client is localStorage-first, the
-- same shape as locale: this column is the cross-device memory, and until
-- this migration is applied in production the RPC quietly no-ops the
-- unknown column and localStorage stays authoritative. Nothing breaks
-- either way; that is why the app can ship before the DDL.
--
-- 'paper' and 'dark' are the only values. A check constraint rather than an
-- enum, matching weight_unit and locale in 0023.

alter table public.user_preferences
  add column if not exists theme text not null default 'paper'
  check (theme in ('paper', 'dark'));

-- Extend the single-preference upsert allowlist. Same body as 0023's, plus
-- the theme branch; the function comment is the changelog.
create or replace function public.upsert_user_preference(
  p_column text,
  p_value text
)
returns public.user_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.user_preferences;
begin
  -- Bootstrap the row if it does not exist yet (first call after login).
  insert into public.user_preferences (user_id)
  values (v_uid)
  on conflict (user_id) do nothing;

  if p_column = 'weight_unit' then
    update public.user_preferences
    set weight_unit = p_value,
        updated_at = now()
    where user_id = v_uid
    returning * into v_row;
  elsif p_column = 'rpe_mode' then
    update public.user_preferences
    set rpe_mode = p_value,
        updated_at = now()
    where user_id = v_uid
    returning * into v_row;
  elsif p_column = 'locale' then
    update public.user_preferences
    set locale = p_value,
        updated_at = now()
    where user_id = v_uid
    returning * into v_row;
  elsif p_column = 'theme' then
    update public.user_preferences
    set theme = p_value,
        updated_at = now()
    where user_id = v_uid
    returning * into v_row;
  else
    -- Unknown column: return current row without change.
    select * into v_row from public.user_preferences where user_id = v_uid;
  end if;

  return v_row;
end;
$$;

comment on function public.upsert_user_preference(text, text) is
  'Upsert a single user preference by column name. Accepts weight_unit, rpe_mode, locale, or theme.';
