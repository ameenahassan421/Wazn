-- Somewhere for a crash to land.
--
-- `docs/INFRASTRUCTURE_AUDIT.md` §5-I5: there was no error boundary and no
-- error reporting of any kind in `src/` — no `componentDidCatch`, no
-- `window.onerror`, no service. `@vercel/analytics` counts page views. So a
-- crash in production was invisible unless a user happened to mention it, and
-- three defects reached production in a single day.
--
-- Deliberately our own table rather than a third-party service. A pre-beta
-- product with one developer does not need Sentry's dashboard or its monthly
-- cost; it needs to know that something threw. This also keeps the privacy
-- policy's processor list as short as it is.

create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  -- Defaulted, not sent. The client inserts `{message, boundary, ...}` and the
  -- column supplies the owner — the same shape the insert policy checks. This
  -- is 0016's lesson applied before the fact: `follows` and `workout_likes`
  -- were NOT NULL with no default and the client omitted them, so every follow
  -- and every like the app ever attempted was refused before RLS had an
  -- opinion.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- "TypeError: Cannot read properties of undefined". Truncated client-side.
  message text not null,
  -- Which boundary caught it: 'root', or the tab name.
  boundary text not null,
  -- React's component stack. Minified in production and still the difference
  -- between a triageable report and a shrug, because component names survive.
  component_stack text,
  stack text,
  -- Pathname only. The client strips query and hash before sending, because
  -- invite links carry a token in the query and Supabase's OAuth and recovery
  -- redirects land with an access token in the hash — `location.href` would
  -- have turned a crash report into a credential leak.
  path text
);

create index if not exists client_errors_recent_idx
  on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;

-- Insert-own and select-own. A user can report their own crashes and read
-- their own rows; nobody reads anyone else's. Triage is a service-role query,
-- which is what `scripts/` already uses for everything administrative.
--
-- auth.uid() wrapped in a select so the planner evaluates it once per
-- statement rather than once per row, matching every other policy in this
-- schema. Note the difference from the column default above, which must be a
-- bare call: a DEFAULT expression cannot contain a subquery. `0016` records
-- that distinction and `check_migrations.py` cannot enforce it.
drop policy if exists client_errors_insert_own on public.client_errors;
create policy client_errors_insert_own on public.client_errors
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists client_errors_select_own on public.client_errors;
create policy client_errors_select_own on public.client_errors
  for select to authenticated using ((select auth.uid()) = user_id);

-- No update or delete policy. A crash report is a fact about a moment; there
-- is nothing to correct, and a client that could delete its own reports is a
-- client that can hide a reproducible bug.

comment on table public.client_errors is
  'Crash reports from the React error boundaries. Message, stacks and pathname only — never a URL with a query or hash, which would carry invite and auth tokens.';
