-- 0028 — the revoke 0027 meant to do and did not.
--
-- 0027 ends each of its three functions with:
--
--     revoke all on function … from public;
--     grant execute on function … to authenticated;
--
-- and the first line is a no-op. Supabase does not grant EXECUTE through
-- PUBLIC — `scripts/pg_shim.sql` mirrors the real thing, and the grant comes
-- from `alter default privileges … grant all on functions to anon,
-- authenticated, service_role`. A privilege granted directly to `anon` is not
-- removed by revoking from `public`, so all three functions shipped callable
-- by a signed-out request at `/rest/v1/rpc/…`.
--
-- Supabase's own security advisor is what caught it, minutes after 0027 was
-- applied. The repo's SQL suite did not, and that is the more useful half of
-- the lesson: `supabase/tests/body_and_coach.sql` asserted that the FUNCTIONS
-- WORK and never asserted who may call them. It does now.
--
-- ── WHAT WAS ACTUALLY EXPOSED ──────────────────────────────────────────────
-- Nothing, as it happens, and the reason is worth writing down rather than
-- being relieved about:
--
--   `upsert_user_preference` is SECURITY DEFINER, so it is the one that
--   mattered. Called by anon, `auth.uid()` is NULL and its first statement
--   inserts NULL into a NOT NULL primary key — the call raises before it can
--   touch a row. No write, no read, no leak.
--
--   `body_overview` and `strength_forecast` are SECURITY INVOKER. Under anon
--   the RLS policies added by 0027 and 0026 match no rows, so both return
--   empty. Harmless, and still no reason to answer a signed-out caller.
--
-- So this is a hardening, not an incident. It is a separate migration rather
-- than an edit to 0027 because 0027 is applied in production and an applied
-- migration is history: anyone who has already run it gets the fix from here.
--
-- `resolve_invite` is deliberately left alone. Migration 0011 grants it to
-- `anon` on purpose so an invite link can name the person who sent it before
-- the recipient has an account, and the advisor will keep flagging it. That
-- one is intentional; these three were not.

revoke all on function public.upsert_user_preference(text, text) from anon;
revoke all on function public.body_overview(integer) from anon;
revoke all on function public.strength_forecast() from anon;

-- Restated rather than assumed. `revoke … from anon` above touches only anon,
-- but these three lines are what the functions are FOR, and a future
-- `create or replace` that forgets them is the failure this file exists to
-- prevent being silent about.
grant execute on function public.upsert_user_preference(text, text) to authenticated;
grant execute on function public.body_overview(integer) to authenticated;
grant execute on function public.strength_forecast() to authenticated;
