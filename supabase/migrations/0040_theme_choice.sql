-- 0040: the theme column, with the vocabulary the app now speaks.
--
-- ── THE COLUMN IS NOT THERE, AND NO MIGRATION DROPPED IT ───────────────────
-- 0025 declared it:
--
--   alter table public.user_preferences
--     add column if not exists theme text not null default 'paper'
--     check (theme in ('paper', 'dark'));
--
-- Measured against production 2026-08-22, `information_schema.columns` for
-- `public.user_preferences` returns twelve columns and `theme` is not among
-- them. Nothing in `supabase/migrations/` drops it, so 0025 was written and
-- never applied. Two live consequences, both silent:
--
--   1. `upsert_user_preference('theme', …)` throws. plpgsql resolves column
--      references on first EXECUTION, not at `create or replace`, so 0027 and
--      0037 both shipped an `elsif p_column = 'theme'` branch that compiles
--      fine and raises "column theme of relation user_preferences does not
--      exist" the moment anybody takes it.
--   2. The web app's theme toggle has therefore never synced. It is
--      localStorage-first and swallows the error, which is why nobody noticed.
--
-- 0025 predicted exactly this ("until this migration is applied in production
-- the RPC quietly no-ops the unknown column") and got the mechanism wrong: an
-- unknown column raises, it does not no-op. The observable result was the same
-- because the client discards the error either way.
--
-- ── THREE VALUES NOW, NOT TWO, AND `system` IS THE ONE THAT MATTERS ────────
-- The native app stores the CHOICE, not the resolved scheme: `system` follows
-- the OS and is the default, `light` and `dark` are the overrides. Persisting
-- the resolved scheme instead would turn "follow my phone" into whatever the
-- phone happened to be at the moment of the write, and the setting would
-- silently stop following anything. So the column has to be able to say
-- `system`, and 0025's two-value constraint cannot.
--
-- ── ONE FILE, CORRECT FROM EMPTY AND CORRECT AGAINST PRODUCTION ────────────
-- `npm run check:sql` replays every migration from an empty database, so 0025
-- HAS run there and the column exists with the old default and the old check.
-- In production neither exists. Same problem as 0032's: the statements below
-- are written so both starting points land in the same place, rather than
-- assuming the one this file was tested against.
alter table public.user_preferences
  add column if not exists theme text;

-- 0025's inline column check, named by Postgres. Absent in production, present
-- from an empty replay, and `if exists` covers both.
alter table public.user_preferences
  drop constraint if exists user_preferences_theme_check;

-- `paper` was 0025's DEFAULT, so a row holding it is indistinguishable from a
-- row nobody touched, and pinning those accounts to light forever would mean
-- they never see the dark theme their phone is already asking for. `dark`
-- under 0025 could only be a deliberate act, since it was never the default,
-- so it survives as the one legacy value worth keeping. Zero rows are affected
-- today in either database; this is here so it is right if it ever is not.
update public.user_preferences
set theme = 'system'
where theme is null or theme not in ('system', 'light', 'dark');

alter table public.user_preferences
  alter column theme set default 'system';

alter table public.user_preferences
  alter column theme set not null;

-- Deliberately NOT the 0037 treatment. `weekly_target` needed a
-- `weekly_target_set_at` stamp because the board RANKS people against it and a
-- default nobody picked is a goal nobody accepted. Nothing ranks a theme: it
-- is read back and drawn, and `system` applied is identical to never-chosen
-- applied. A default that is honest needs no companion column.
alter table public.user_preferences
  add constraint user_preferences_theme_check
  check (theme in ('system', 'light', 'dark'));

comment on column public.user_preferences.theme is
  'The lifter''s theme CHOICE, not the resolved scheme: system (the default, '
  'follows the OS), light, or dark. Storing the resolved scheme would freeze '
  '"follow my phone" into whatever the phone was at the moment of the write. '
  'The web app writes light/dark here and translates its own paper/dark '
  'vocabulary at the boundary in src/lib/theme-context.tsx.';

-- `upsert_user_preference` already has the branch, from 0025 by way of 0027
-- and 0037, so nothing about the function changes. It just stops raising.
