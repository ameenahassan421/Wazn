-- 0023 — user measurement preferences, server-side.
--
-- The weight unit (kg/lbs) was localStorage-only. On a new device or after a
-- private-browsing session it resets to the default, and the toggle has no
-- effect on the server (weights are always kg). RPE mode is new: some lifters
-- use 0-10, some use reps-in-reserve, some do not track RPE at all. Locale
-- tracks the display language: 'en' or 'ar', and NULL until the user picks
-- one, so browser/region detection still applies to anyone who never has.
--
-- One row per user, created by the same trigger that boots profiles. The app
-- reads it once at auth and caches it in UnitContext / LocaleContext; writes
-- go through a single RPC so the insert-or-update logic lives in one place.
--
-- ── UNTIL THIS IS APPLIED ──────────────────────────────────────────────────
-- The RPC `upsert_user_preference` does not exist, so the client's INSERT
-- will fail. The unit toggle stays in localStorage, the RPE mode has no UI
-- yet, and locale falls back to the browser language. Nothing degrades for
-- existing users. Existing users are NOT backfilled: their row is created by
-- the RPC on first write, so whatever unit their localStorage already holds
-- stays authoritative instead of being overwritten by this table's default.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists public.user_preferences (
  user_id uuid primary key
    references auth.users (id) on delete cascade,
  weight_unit text not null default 'kg'
    check (weight_unit in ('kg', 'lbs')),
  rpe_mode text not null default 'none'
    check (rpe_mode in ('0-10', 'rir', 'none')),
  -- NULLABLE ON PURPOSE, and no default.
  --
  -- NULL means "has never chosen", which is a different fact from "chose
  -- English". With `not null default 'en'` the signup trigger below stamps
  -- every new row 'en', the client adopts the server value on sign-in, and
  -- `navigator.language` never gets a say again — an Arabic phone in Cairo
  -- would land in English and stay there. The client only adopts this value
  -- when it is non-null, so the resolution order the plan specifies survives:
  -- explicit choice, then region/browser, then English.
  locale text
    check (locale in ('en', 'ar')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.user_preferences enable row level security;

-- Owner can read their own preferences.
drop policy if exists user_preferences_select_own on public.user_preferences;
create policy user_preferences_select_own on public.user_preferences
  for select to authenticated using ((select auth.uid()) = user_id);

-- Owner can insert their own row (first boot / bootstrap).
drop policy if exists user_preferences_insert_own on public.user_preferences;
create policy user_preferences_insert_own on public.user_preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- Owner can update their own row.
drop policy if exists user_preferences_update_own on public.user_preferences;
create policy user_preferences_update_own on public.user_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Bootstrap: every new user gets a default row, like profiles.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: upsert a single preference value.
--
-- The client calls this with (column, value). Only the three preference
-- columns are accepted; anything else is a no-op (returns the current row
-- unchanged). This avoids exposing a generic UPDATE and keeps the column
-- allowlist in SQL.
-- ---------------------------------------------------------------------------

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
  else
    -- Unknown column: return current row without change.
    select * into v_row from public.user_preferences where user_id = v_uid;
  end if;

  return v_row;
end;
$$;

comment on function public.upsert_user_preference(text, text) is
  'Upsert a single user preference by column name. Accepts weight_unit, rpe_mode, or locale.';

revoke execute on function public.upsert_user_preference(text, text) from public;
grant execute on function public.upsert_user_preference(text, text) to authenticated;
grant execute on function public.upsert_user_preference(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- RPC: read all preferences for the calling user.
--
-- A convenience wrapper so the client does not need to know the schema.
-- ---------------------------------------------------------------------------

create or replace function public.get_user_preferences()
returns public.user_preferences
language sql
stable
security invoker
set search_path = ''
as $$
  select * from public.user_preferences where user_id = (select auth.uid());
$$;

comment on function public.get_user_preferences() is
  'Read all measurement preferences for the calling user.';

revoke execute on function public.get_user_preferences() from public;
grant execute on function public.get_user_preferences() to authenticated;
grant execute on function public.get_user_preferences() to service_role;
