# Wazn — working notes for Claude

> **`WAZN_PLAN.md` is the source of truth for this project.** Read it in full
> at the start of every session, along with `DECISIONS.md` and the **STATUS**
> section at the bottom of the plan. Do not begin work until you know which
> phase is active and what its gate is. This file is the working notes; where
> the two disagree, the plan wins.

Mobile-first strength-training PWA. The job it does: log a set in under 30
seconds, one hand, mid-workout. Every decision serves that.

## Non-negotiables carried from WAZN_PLAN.md §2

These are reproduced verbatim so they survive even if the plan is not read.

6. **Critical review is mandatory.** Do not implement specs blindly,
   including this file. Where a better approach exists (schema, library,
   UX, query design), implement it and log the deviation with reasoning
   in `DECISIONS.md`. Ask first only when a change is destructive to
   existing data or auth.
7. **Phase gates are hard stops.** Finish a phase, report against its
   acceptance list, STOP, wait for Ameen's approval. Never start the
   next phase unprompted.
8. **Do not rotate or modify API keys.** Key rotation is handled by
   Ameen separately, before any non-owner user touches the app.

## Commands

```bash
npm run dev          # vite dev server
npm test             # vitest, 49 tests, no network needed
npm run lint         # eslint (includes the RTL guard below)
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + production build
npm run format       # prettier
```

Before pushing: `npm run lint && npm run format:check && npm run typecheck && npm test && npm run build`.
CI runs exactly that on every PR.

## Hard rules

- **Logical properties only.** No `ml-`, `pl-`, `left-`, `text-left`. Use `ms-`,
  `ps-`, `start-`, `text-start`. ESLint fails the build otherwise. The app will
  grow an Arabic RTL locale.
- **Weight is stored in kg, always.** The header lbs/kg toggle is display only,
  rounded to 0.5 lb / 0.25 kg. Never round the stored value.
- **Dark theme, one accent (amber `#f0b429`).** Nothing else is coloured. No
  gradients, shadows, emoji, or decorative illustration. Numbers render large
  and tabular (`.tnum`). Touch targets ≥ 48px.
- **Auth is a 6-digit code**, `signInWithOtp` + `verifyOtp`. Never a magic
  link. The email templates in `supabase/email_templates/` must contain
  `{{ .Token }}` or sign-in is impossible.
- **The service-role / secret key is script-only.** Never in a `VITE_*` var,
  never in the client, never in Vercel.

## Scope — do not build without being asked

Routines/templates, leaderboards, invites, social, offline sync, rest timers,
custom exercise creation, Arabic strings, payments, a settings screen, per-set
correction tooling, body-composition analysis.

## Architecture

- `src/screens/` — Log (default), History, Progress. Three, no router.
- `src/lib/` — `supabase.ts` (client + `describeError`), `units.ts`,
  `epley.ts`, `unit-context.tsx`, `use-auth.ts`.
- `supabase/migrations/0001_init.sql` — schema, RLS, and three security-invoker
  functions the app calls as RPCs: `exercise_usage`, `previous_session`,
  `exercise_1rm_history`.
- `scripts/import_hevy.ts` — one-time seed from `workouts_corrected.csv`.
  Transforms are exported and unit-tested; `main()` only runs when invoked
  directly.
- `scripts/supabase_admin.ts` — Management API config (SMTP, templates, site
  URL) so auth setup is a command, not a dashboard click-through.

Progress is lazy-loaded: recharts is half the bundle and the Log screen is the
hot path mid-workout. Keep it that way.

## State handling

`eslint-plugin-react-hooks` v7 forbids synchronous `setState` inside effects.
Where state must follow a prop, adjust it during render (see `SetEntry`), or
carry the owning id alongside the data so stale values are inert rather than
cleared by an effect (see `ProgressScreen`'s `series`, `LogScreen`'s
`previousFor`). Do not reintroduce a "loading" flag set inside an effect — child
effects run before the parent's, which silently broke the set auto-fill once.

## Environment facts

- Supabase project ref: `ttasiwxeqerhsztxjxip`
- Production: https://workout-theta-plum.vercel.app (Vercel, auto-deploys `main`)
- Sandboxed sessions have **no network egress to Supabase** unless the
  environment allowlist is widened. See `docs/agent-setup.md`.
