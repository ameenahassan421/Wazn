-- 0022 — the rest canvas gets the same instrument the briefing has.
--
-- E1 (offense plan §8-E1) is the one surface in the app that deliberately sits
-- inside the flow §2.1 calls sacred, and its own spec names the kill signal:
-- "if beta testers describe it as noise even once, it dies". That is an
-- exit-interview question, but the app can carry half of it honestly — a
-- dismissal is a tester saying "not this" with a thumb, and the canvas can be
-- turned off permanently in one tap, so a dismiss row is a strong signal and a
-- cheap one.
--
-- `coach_views` already models exactly this pair (exposure and dismissal) for
-- B1's two surfaces. Reusing it beats a second table that would answer the same
-- question in a different shape: one query then covers every place the coach
-- speaks.
--
-- ── UNTIL THIS IS APPLIED ──────────────────────────────────────────────────
-- The check constraint refuses the insert, `recordCoachView` swallows it (it is
-- fire-and-forget by construction — telemetry must never be visible), and the
-- canvas itself is completely unaffected. Nothing degrades except the count.

alter table public.coach_views
  drop constraint if exists coach_views_surface_check;

alter table public.coach_views
  add constraint coach_views_surface_check
  check (surface in ('briefing', 'debrief', 'weekly_review', 'rest_canvas'));
