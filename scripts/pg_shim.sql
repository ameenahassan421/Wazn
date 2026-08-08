-- The smallest Supabase-shaped platform a migration needs to actually RUN.
--
-- `scripts/check_migrations.py` parses every migration with Postgres's own
-- grammar, which is the floor. It is not execution: 0021's `default (select
-- auth.uid())` parsed perfectly and would have been rejected by the server,
-- because a column default may not contain a subquery. A parse check cannot
-- see that, and neither can review.
--
-- So this file creates the parts of a Supabase project that the migrations
-- reference but do not own — the `auth` schema and its `users` table, the
-- `auth.uid()` / `auth.role()` helpers, the three platform roles, and the
-- extensions — so `scripts/check_migrations.sh` can execute the whole chain
-- against a throwaway local cluster.
--
-- It is deliberately NOT a Supabase emulator. RLS policies are created but
-- never exercised here; what this proves is that every statement in every
-- migration is one a real server will accept, in order, from an empty
-- database. That is the check that was missing.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin noinherit;
  end if;
end
$$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- Only the columns the migrations actually reference. `id` is what every
-- `references auth.users (id)` needs; `email` exists because 0001's
-- `handle_new_user` trigger reads it.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- The real ones read a GUC set per request from the JWT. Same contract: a uuid
-- or null. Settable in a test session with `set local request.jwt.claim.sub`.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

create or replace function auth.email()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.email', true), '');
$$;

grant execute on function auth.uid(), auth.role(), auth.email()
  to anon, authenticated, service_role;

-- The platform's default privileges, mirrored.
--
-- Without these, `set local role authenticated` cannot read a single table and
-- every `security invoker` function raises "permission denied" — which looks
-- exactly like an RLS failure and is not one. A Supabase project grants the
-- three API roles blanket table, function and sequence privileges on `public`
-- and then relies on RLS to do the actual scoping, so a runner that omits them
-- is not testing the same database.
--
-- Deliberately mirrored rather than tightened: the migrations do their own
-- `revoke execute … from public` / `grant execute … to authenticated` on every
-- function they define, and that hardening is only meaningful when it runs on
-- top of the platform's real defaults.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
