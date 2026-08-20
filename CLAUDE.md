# Wazn — working notes for Claude

> **`WAZN_PLAN.md` is the source of truth for this project.** Read it in full
> at the start of every session, along with `DECISIONS.md` and **§7.0**, the
> authoritative current-state block. (§7.1 below it is a chronological log that
> contradicts itself in places. §7.0 wins, and the database beats both.) Do not begin work until you know which
> phase is active and what its gate is. This file is the working notes; where
> the two disagree, the plan wins.

Mobile-first strength-training PWA. The job it does: log a set in under 30
seconds, one hand, mid-workout. Every decision serves that.

## Read the banner, not the file (2026-08-19)

**§7.0 has lied before and it will lie again.** On 2026-08-19 it was nine
commits stale: PRs #103, #104, #105 and #106 merged code to `main` and not one
of them touched `WAZN_PLAN.md`, so the authoritative state block still said
"rest canvas takeover DECIDED 2026-08-17, not built" after #103 had shipped it,
and still named that takeover as the "next action" after it was done. Local
`main` was meanwhile eight commits behind `origin/main` with no sign of it.
Nothing was broken. The _record_ was broken, which is worse, because every
session after that one starts by reading it.

Two hooks now close that loop. Both are in `.claude/settings.json` and both are
checked in, so every session and every machine gets them.

- **`.claude/hooks/session-start.sh`** fetches, then prints computed state
  before you read anything: where HEAD sits against `origin/main`, how many
  commits have landed since `WAZN_PLAN.md` was last edited, which remote
  branches hold unmerged work, and any open PR (another session may be
  mid-flight; do not rebuild its work). **When the banner says section 7.0 is
  stale by N commits, reconcile it against the code and the database before you
  build anything.** The banner is derived, so it cannot go stale; the file can.
- **`.claude/hooks/status-guard.sh`** runs on Stop. If the session has
  committed changes under `src/`, `mobile/`, `supabase/migrations/` or
  `supabase/functions/` and never touched `WAZN_PLAN.md`, it exits 2 and blocks
  the stop. Uncommitted scratch work gets a one-line reminder instead of a
  wall. **This is not a formality to route around.** §6 already required the
  update and four consecutive sessions skipped it anyway; the hook exists
  because the written rule did not hold.

Corollary that supersedes the blockquote above: read `WAZN_PLAN.md` §7.0, but
treat it as a _claim_ to verify, not a fact to recite. The database beats the
file, and `git log` beats both.

**`cmd || echo "no"` turns a crashed check into a confident wrong answer.**
On 2026-08-20 two sessions disagreed about whether a commit existed only on one
laptop. The one that said "not on the remote" had run
`git merge-base --is-ancestor <sha> <sha>` inside a checkout that had never
fetched, so the second object was simply absent; git failed on the missing
object, the `||` branch printed the negative, and a missing-object error read
as a definitive "this work exists nowhere else". The near-miss was a
recommendation to protect a directory that was already fully merged.

Two rules, and the second is the one that matters. **Fetch before trusting any
ref, including refs you are reading out of somebody else's checkout.** And when
a shell check decides something destructive, **make the failure branch say
"could not determine" rather than the negative answer**. `|| echo "NO"` and
`|| echo "unknown"` cost the same to write and only one of them can get
somebody's work deleted.

**Subagents do not reliably honour "read-only".** On 2026-08-19 an audit
subagent that had been told, in its prompt, not to edit anything ran
`git checkout -- CLAUDE.md` and destroyed the parent session's uncommitted
work. Commit before you fan out, or accept that you will lose the diff.

## Code review (2026-08-19)

Three review paths, in ascending cost. Project-scoped in
`.claude/settings.json`, so they arrive with the repo.

- `/code-review`, the built-in. Reviews the working diff, a PR number, or a
  branch, at a chosen effort level. This is the default before opening a PR.
- `/review-pr` and the six `pr-review-toolkit` agents (`code-reviewer`,
  `silent-failure-hunter`, `code-simplifier`, `comment-analyzer`,
  `pr-test-analyzer`, `type-design-analyzer`). Reach for a single agent when
  the concern is specific; `silent-failure-hunter` is the one this repo has
  historically needed, since 0027's `revoke` and the invented-lift guard both
  succeeded loudly and did nothing.
- `/code-review ultra`, a multi-agent cloud review of the branch. Ameen has to
  trigger it; Claude cannot.

**A green wall is not a review, and this repo has the receipts.** Lint,
typecheck, 818 tests, a production build and Playwright were all green while
Arabic rendered its numbers backwards, while `revoke all ... from public` did
nothing, and while every one of the eleven v5 P0 findings sat unnoticed. Run a
review on anything a user will see.

The `expo` plugin is installed for `mobile/` work: `api.expo.dev` is 403 from
this org's egress proxy, so its offline skills are the way to answer SDK and
build questions without the network.

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
npm test             # vitest, 1204 tests in 85 files, no network needed
npm run lint         # eslint (includes the RTL guard below)
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + production build
npm run format       # prettier
```

Before pushing: `npm run lint && npm run format:check && npm run typecheck && npm run check:vercel && npm run check:type && npm run check:coverage && npm test && npm run build && npm run test:smoke`.

**That list is not the whole wall, and this line used to claim it was.** CI's
`check` job also runs `check:migrations`, `check:sql` and `deno check` on the
Edge Functions. E1 was pushed green on the old list and failed on
`check:coverage` — every module in `src/lib` needs a test file or a written
exemption, and a new one with neither fails. Read
`.github/workflows/ci.yml` rather than this paragraph when it matters.

**`npm run test:smoke` is now IN the list, and it was not on 2026-08-16.**
`npm test` is vitest; Playwright is a separate job and a separate command.
v5 PR 4 renamed the commit bar from "Log set N" to "Bank set N"; the vitest
queries were updated, `grep -rn "Log set" src` came back with only comments,
and `e2e/` is not `src/`. Three GATE 4 airplane-mode tests timed out waiting
for a button that no longer had that name, on main, after the PR was merged
before its own CI finished. **A copy change is an API change to every selector
in `e2e/` and `scripts/` — grep the repo, not the source tree.**

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
network, no project, no credentials. CI runs it too. It runs **three** of the
four files there — `coach_surfaces`, `rls_own_rows`, `body_and_coach`. A new
suite is not run until it is added to the loop in `scripts/check_sql.sh`.

`npm run check:migrations` (needs `pip install pglast`) still parses everything
with the grammar Postgres itself uses, and it is still the cheap floor — 0007
once shipped a column named `position`, a reserved word, which failed to parse
in its entirety. But a parser is not a server: 0021 shipped a
`default (select auth.uid())` that parses perfectly and that every real
Postgres rejects, and an `order by` on a column its own subquery had aliased
away. Both died on the first execution.

**Executed locally is still not applied.** "Applies cleanly from empty" and
"applies cleanly to production" are different claims; the PR should say which
one it has. Production is at **0028** as of 2026-08-15.

**And applied is still not verified.** `apply_migration` answers
`{"success": true}` for DDL that did nothing useful. 0027's
`revoke all … from public` executed, succeeded, and had no effect — Supabase
grants EXECUTE to `anon` DIRECTLY via `alter default privileges`, so revoking
from PUBLIC leaves it callable by a signed-out request. Read
`information_schema` / `has_function_privilege` afterwards, and run
`get_advisors` — Supabase's own linter found that one in under a minute and the
repo's SQL suite, which tested only that the functions worked, did not.
**A test that asserts behaviour will never catch a grant that reads correctly
and does nothing. Assert the privilege.**

## Hard rules

- **Logical properties only.** No `ml-`, `pl-`, `left-`, `text-left`. Use `ms-`,
  `ps-`, `start-`, `text-start`. ESLint fails the build otherwise. The app will
  grow an Arabic RTL locale.
- **Weight is stored in kg, always.** The header lbs/kg toggle is display only,
  rounded to 0.5 lb / 0.25 kg. Never round the stored value.
- **Dark-first, one accent (ember `#e8491d`, adopted 2026-08-12).** Nothing else is coloured. No
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
  contain `{{ .Token }}` or code flows are impossible. **`magic_link.html` is not a
  magic link and the filename alarms people.** `magic_link` is Supabase's
  fixed template slot for `signInWithOtp`; the file contains only
  `{{ .Token }}` and its subject is "{{ .Token }} is your Wazn sign-in code"
  (`scripts/supabase_admin.ts:83`). It sends the 6-digit code. Verified
  2026-08-19. Do not "fix" it.
- **The service-role / secret key is script-only.** Never in a `VITE_*` var,
  never in the client, never in Vercel.

## Scope

**Scope is `WAZN_PLAN.md` section 4. Anything not in a stage needs a `DECISIONS.md`
entry naming who asked.**

This heading used to carry a "do not build without being asked" list. By 2026-08-19
eleven of its twelve items had been built, every one of them authorised by a later
stage and logged, so the list was dead text that a session could read as governance.
A list that is 92% wrong is worse than no list.

**The active stage is 4A, One App.** One Expo codebase for iOS, Android and web; the
Vite PWA retired at the end; v5 implemented in full inside the migration because the
port and the restyle are the same edit. The filter that decides what is worth building
on any given day:

> **`src/lib` survives the migration. `src/components` and `src/screens` do not.**

Work in `src/lib` is banked. Work in the screens and components is rented, and every
v5 P1 item built on the web is built twice.

**Anything AI/LLM.** Stage 8 in the plan describes what would get built and
how, but it is conditional on the Gate 1 backlog actually asking for it — an
idea is not evidence. If you do build it: open weights with a genuinely
permissive licence, the key lives in an Edge Function and never a `VITE_*`
var, the model never sits on the critical path, and no model output is written
to the database without the user pressing something. Statistics answer anything
statistics can answer.

## There are TWO apps now (2026-08-16)

`mobile/` is an Expo Router + NativeWind native app, and it is a **separate npm
package with its own lockfile** — not tidiness, a hard constraint: NativeWind v4
needs Tailwind 3.4 and the web app is Tailwind v4. Do not add a `workspaces` key
to the root `package.json`; that changes how Vercel installs.

```bash
cd mobile && npm ci
npm run typecheck        # tsc
npm run bundle:ios       # THE gate — real Metro + Babel + NativeWind
npm run bundle:android
```

- **`src/lib/portable.ts` is the only door between the two apps.** Mobile
  resolves `@wazn/domain` to it via `mobile/metro.config.js`. Adding an export
  there is a decision; `portable.test.ts` walks the TRANSITIVE import graph and
  fails on any browser global. Domain shared, I/O adapted — `supabase.ts` and
  every `use-*` hook stay per-platform on purpose.
- **`src/lib/tokens.ts` is the palette's source of truth for BOTH stacks.**
  `npm run check:tokens` compares it against `index.css` and regenerates
  `mobile/tailwind.tokens.js`; CI fails on drift. Never type a colour into
  `mobile/tailwind.config.js`. It found three shipped defects on its first run.
- **Type is a component on native (`<Txt step="hero">`), not a class.** RN picks
  a font cut by family NAME, not weight — a `text-hero` carrying `fontWeight`
  renders Saira Medium and looks almost right.
- **`npm run typecheck` in mobile is not a build.** A broken babel preset, a bad
  metro alias, a missing font subpath and a NativeWind/RN version fight are all
  clean to tsc and fatal to `expo export`. Bundle before claiming it works.
- **`api.expo.dev` and `reactnative.directory` are 403 from this org's egress
  proxy**, so `npx expo install` cannot resolve versions and EAS cannot run from
  a session. Read `node_modules/expo/bundledNativeModules.json` instead — it is
  the same version map, offline.

## Architecture

- `src/screens/` — Log (home), History, Progress, **Body**, Coach, Friends,
  Settings. No router: one `View` union in `App.tsx` and one `useState`.
- **There IS a tab bar again — six tabs, and this line said the opposite until
  2026-08-14.** The audit retired the five-tab bar on 2026-08-13 (S2, "five
  equal tabs for five unequal jobs"); design v3.0 brings back
  `Log · History · Progress · Body · Coach · Friends`, and Ameen confirmed the
  handoff wins. **The doors were kept.** Progress is still behind the Last PR
  card, Coach behind the coach brief, Settings behind the header avatar,
  Friends also from inside Settings, History also as the circle beside Start.
  A new screen still needs a door — `npm run shots` prints
  `no door to <screen>` when a route cannot be walked, and both harnesses
  press the CARDS rather than the bar on purpose: the bar either renders or it
  does not, and a run that navigated by it would pass on a build where every
  card door had silently stopped working. Body is the one screen reached by
  the bar, because it has no card.
- **The tab bar's height lives in ONE place: `--tab-space` in `index.css`.**
  Three sticky clusters clear it (the home's Start row, the focused view's
  commit cluster, the board's rest bar). Last time this arithmetic lived in
  three components, one of them kept its `+ 64px` after the bar was retired
  and floated a tab-bar's height above the screen. Do not inline the number.
- `src/lib/` — `supabase.ts` (client + `describeError`), `units.ts`,
  `epley.ts`, `unit-context.tsx`, `use-auth.ts`; and v3's layer:
  `coach-mode.ts` (mode + volume, and the two questions volume answers),
  `readiness.ts`, `ghost-reason.ts` (the adaptive ghost — the hero),
  `forecast.ts`, `body.ts`, `tell-coach.ts`, `streak.ts`.
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
- Production: **https://www.trywazn.app** (Vercel, auto-deploys `main`).
  `workout-theta-plum.vercel.app` is an alias, NOT canonical. All 222 SEO pages
  currently canonicalise to the alias because `WAZN_SITE_URL` is unset in Vercel;
  that is a live defect, see WAZN_PLAN.md section 7.0.
- **Whether a session can reach Supabase is PER-SESSION. Check, do not
  assume.** When `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` are in the
  environment, `https://api.supabase.com/v1/projects/$REF/database/query`
  answers — that is a Management API personal access token, and it can run
  arbitrary SQL, including DDL. Migrations 0020 and 0021 were applied that way.
  **The 2026-08-14 session had neither variable, and the Supabase MCP server
  needs an interactive OAuth flow a headless session cannot run** — so 0027 was
  written, proven against a local Postgres, and left unapplied. `env | grep -i
supabase` before promising anything about production. Direct Postgres (5432 /
  the 6543 pooler) is still NOT reachable in any session, so
  `scripts/run_sql.sh` and its `DATABASE_URL` remain a laptop-only path.
- **That token is production DDL access. Treat it as such.** Plan §2.6 makes a
  destructive change an ask, and applying a migration is a change to the
  database every user depends on: confirm before applying, verify against
  `information_schema` afterwards rather than trusting a success flag, and
  write what actually landed into STATUS. A `[]` response means "no rows
  returned", not "it worked".
