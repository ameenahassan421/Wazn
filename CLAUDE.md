# Wazn — working notes for Claude

> **`WAZN_PLAN.md` is the source of truth for this project.** Read it in full
> at the start of every session, along with `DECISIONS.md` and the **STATUS**
> section at the bottom of the plan. Do not begin work until you know which
> phase is active and what its gate is. This file is the working notes; where
> the two disagree, the plan wins.

Mobile-first strength-training PWA. The job it does: log a set in under 30
seconds, one hand, mid-workout. Every decision serves that.

## Skills first (Ameen, 2026-08-04)

Before starting any task, search the session's available skills and load the
relevant one with the Skill tool — do the task unassisted only when no skill
covers it. Known fits: **`impeccable` for any UI/frontend work** (its design
hook also fires automatically on Edit/Write of UI files and on Stop — wired
in `.claude/settings.json`; manage with `/impeccable hooks`),
**`wellness-app-design` for anything about what to build or how a flow
should behave** — workout-tracker UX judgment, Hevy parity questions,
retention mechanics, roadmap sequencing (pairs with `impeccable`: that one
executes pixels, this one supplies the domain), `canvas-design`
for visual/brand/logo art, `supabase-postgres-best-practices` before touching
anything in `supabase/migrations/`, `dataviz` before writing any chart,
`frontend-slides` / `pptx` / `docx` / `pdf` for documents. The brand
direction for the mark lives in `docs/design-philosophy.md` ("Loaded Ink") —
read it before redrawing any logo asset.

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
npm test             # vitest, 113 tests, no network needed
npm run lint         # eslint (includes the RTL guard below)
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + production build
npm run format       # prettier
```

Before pushing: `npm run lint && npm run format:check && npm run typecheck && npm run check:vercel && npm test && npm run build`.
CI runs exactly that on every PR.

**Touching `vercel.json`?** `npm run check:vercel` is the only thing in the repo
that reads it. A `"//"` comment key in a rewrite once made Vercel reject every
deploy — main included — while CI stayed green and production quietly froze on
the previous build. JSON has no comments; put the reasoning in `DECISIONS.md`.

**Touching `supabase/functions/`?** Merging to `main` now deploys them
(`.github/workflows/deploy-functions.yml`). Before that existed, "merged" and
"live" were different things and a fix could sit on `main` for a day while
production served the bug.

**Touching `supabase/migrations/`?** Run **`npm run check:sql`**. It starts a
throwaway local Postgres, applies `scripts/pg_shim.sql` (the `auth` schema, the
platform roles, the default privileges) and then every migration in order from
an empty database, and finishes by running the suites in `supabase/tests/`. No
network, no project, no credentials. CI runs it too.

`npm run check:migrations` (needs `pip install pglast`) still parses everything
with the grammar Postgres itself uses, and it is still the cheap floor — 0007
once shipped a column named `position`, a reserved word, which failed to parse
in its entirety. But a parser is not a server: 0021 shipped a
`default (select auth.uid())` that parses perfectly and that every real
Postgres rejects, and an `order by` on a column its own subquery had aliased
away. Both died on the first execution.

**Executed locally is still not applied.** Production is at 0018 with a ledger
that only knows about three migrations, so "applies cleanly from empty" and
"applies cleanly to production" remain different claims. The PR should say
which one it has.

## Hard rules

- **Logical properties only.** No `ml-`, `pl-`, `left-`, `text-left`. Use `ms-`,
  `ps-`, `start-`, `text-start`. ESLint fails the build otherwise. The app will
  grow an Arabic RTL locale.
- **Weight is stored in kg, always.** The header lbs/kg toggle is display only,
  rounded to 0.5 lb / 0.25 kg. Never round the stored value.
- **Dark theme, one accent (amber `#f0b429`).** Nothing else is coloured. No
  gradients, shadows, emoji, or decorative illustration. Numbers render large
  and tabular (`.tnum`). Touch targets ≥ 48px.
- **Auth offers four ways in — never a magic link.** Ameen's decisions
  2026-08-07 (see DECISIONS.md, including the explicit reversal of the
  old no-passwords rule): (1) **Google sign-in**, the hero path once its
  OAuth client exists (`docs/auth-social-setup.md`); (2) **Apple
  sign-in** at Stage 4B with the developer account — MANDATORY in the
  iOS build the moment Google exists there (App Store rule);
  (3) **email + password** sign-up/sign-in, with code-based password
  recovery (no recovery links — same reasoning as no magic links) and
  every hardening Supabase offers on our tier; (4) the **6-digit email
  code** (`signInWithOtp` + `verifyOtp`) as the passwordless option —
  do not remove it. Sign-in fields accept a **username** as an alias
  for the email on any non-social path: resolved server-side, address
  rendered only masked, identical response whether the username exists
  or not. The email templates in `supabase/email_templates/` must
  contain `{{ .Token }}` or code flows are impossible.
- **The service-role / secret key is script-only.** Never in a `VITE_*` var,
  never in the client, never in Vercel.

## Scope — do not build without being asked

Routines/templates, leaderboards, invites, social, rest timers,
custom exercise creation, Arabic strings, payments, a settings screen, per-set
correction tooling, body-composition analysis. (Offline sync was on this list
until U3b built it on 2026-08-08 as Stage 4's planned fast-follow.)

**Anything AI/LLM.** Stage 8 in the plan describes what would get built and
how, but it is conditional on the Gate 1 backlog actually asking for it — an
idea is not evidence. If you do build it: open weights with a genuinely
permissive licence, the key lives in an Edge Function and never a `VITE_*`
var, the model never sits on the critical path, and no model output is written
to the database without the user pressing something. Statistics answer anything
statistics can answer.

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
- **Sandboxed sessions CAN reach Supabase now**, which reverses what this line
  said until 2026-08-08. `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` are
  in the environment, and `https://api.supabase.com/v1/projects/$REF/database/query`
  answers — that is a Management API personal access token, and it can run
  arbitrary SQL, including DDL. Migrations 0020 and 0021 were applied through
  it. Direct Postgres (5432 / the 6543 pooler) is still NOT reachable, so
  `scripts/run_sql.sh` and its `DATABASE_URL` remain a laptop-only path.
- **That token is production DDL access. Treat it as such.** Plan §2.6 makes a
  destructive change an ask, and applying a migration is a change to the
  database every user depends on: confirm before applying, verify against
  `information_schema` afterwards rather than trusting a success flag, and
  write what actually landed into STATUS. A `[]` response means "no rows
  returned", not "it worked".
