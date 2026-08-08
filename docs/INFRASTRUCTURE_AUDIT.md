# Infrastructure audit — RAG, harnesses, evals, tools

**Date:** 2026-08-08 · **Scope:** the machinery under Wazn, not its screens ·
**Companion to:** `HEVY_PARITY_UPGRADE_PLAN.md` (what to build),
`BEATING_HEVY_PLAN.md` (why we win), this file (what makes either survive
contact with production).

## 0. Method, and what "verified" means here

Everything below was read or run, not inferred:

- Ran the suite: **227 tests, 20 files, 5.9s, all green.** No network needed.
  That is a genuinely good number and the audit does not dispute it.
- Ran `tsc --noEmit --listFiles` and grepped the program for
  `supabase/functions` — **3 files of 8**.
- Ran `eslint supabase/functions/` directly, and with `--debug`, to confirm
  whether those files are linted at all.
- Read every file in `supabase/functions/`, `0010_ai_layer.sql`, both CI
  workflows, `vitest.config.ts`, `tsconfig.json`, `eslint.config.js`.
- Grepped the whole repo for `pgvector|embedding|retriev|eval|golden|fixture|
playwright|Sentry|ErrorBoundary`.

Where a finding is a judgement rather than a measurement, it says so.

## 1. The three headlines

1. **You do not need RAG.** Not "not yet" — not at all, for the product as
   designed. §2 argues it properly, because the wrong answer here costs a
   month and a dependency. What the coach actually lacks is **structured
   retrieval**: the ability to ask the database a second question. That is a
   tool layer, and it does not exist yet.
2. **The eval harness is described in two plans and implemented nowhere — and
   the thing that has to exist _before_ it is the ledger.** `ai_generations`
   cannot answer a single question §12 of the beating plan asks of it. Evals
   on fixtures tell you about fixtures; only the ledger tells you about
   reality. Build the ledger first.
3. **The three files holding auth, quota and the model key are the least
   verified code in the repo.** Not lightly tested — _unverified by every
   gate the project has_, while a merge to `main` deploys them to production.
   This is the largest hole and it is also the cheapest to close.

## 2. RAG — the honest answer is no

**Verdict: deliberate non-goal.** Record it as one so it stops being
re-litigated.

Retrieval-augmented generation solves one problem: _finding the relevant
passage in a corpus too large and too unstructured to put in a prompt._ Wazn
has no such corpus. It has a Postgres database with a schema, where every
question a lifter asks maps to an aggregation, not a passage:

| The question                   | RAG's answer                | The right answer                      |
| ------------------------------ | --------------------------- | ------------------------------------- |
| "Why has my bench stalled?"    | retrieve similar text       | `e1rm_trend('Bench Press', 12 weeks)` |
| "Am I doing enough back?"      | retrieve similar text       | `weekly_band('back')`                 |
| "What should I do today?"      | retrieve similar text       | `adherence()` + the routine rows      |
| "Which exercise should I add?" | embed a 135-row catalogue — | …put the catalogue in the prompt      |

That last row is the tell. `generate-routine` already sends the entire
filtered exercise catalogue in the prompt and it fits comfortably. A corpus
you can send in full is a corpus with nothing to retrieve from.

Embeddings would also **break the privacy boundary that is currently
readable in one place.** `coach_stats()`'s column list _is_ the boundary —
§2C's guarantee that prompts carry numbers and exercise names only is
enforceable because you can read one SQL function and see it. A vector store
is a second copy of user data with its own access rules, and the guarantee
stops being checkable by reading one file.

**The one conditional exception**, flagged and not built: if Wazn ever ships
a body of training _knowledge_ — an exercise-technique library, a programming
methodology corpus, translated coaching content — that is a genuine unstructured
corpus and `pgvector` on Supabase is the obvious tool. `exercises.instructions`
(migration 0008, populated by `scripts/import_instructions.ts`) is the seed of
such a thing and currently reaches no prompt at all. Even then it is retrieval
over _our_ content, never over user data. **Do not build this before a Gate 1
tester asks a question that a number cannot answer.**

## 3. What the AI layer is actually missing

The layer that exists is better than its reputation: static system prompts for
prompt-cache discipline, free-then-paid fallback, `finish_reason` carried to
the caller, JSON recovery from fenced blocks and preambles, a validation pass
against the real exercise table, quota as a ledger rather than a counter, and
lazy generation keyed to the newest workout so cost scales with training
instead of app opens. The gaps are not in the design. They are in what you can
_see_ and what you can _prove_.

### A1 — There is no tool layer, and one view of the data is the ceiling

`chat()` takes `system`, `user`, an optional JSON schema, and returns once.
No `tools` parameter, no loop, no trace of what was asked.

The consequence is not theoretical. `coach_stats()` returns a 90-day window
and the top 12 lifts. A user asking "why did my bench stall in March?" cannot
be answered — March is outside the window, per-session detail is not in the
block, and the model has no way to ask for it. Today that shows up as a
coach that is only ever as deep as one query.

**Build:** `chat()` grows `tools` + a bounded loop (max 4 calls, then it must
answer) + a per-turn trace of `(tool, args, row count)`. Alongside it, 5–6
security-invoker, RLS-scoped SQL functions in the shape of `coach_stats()` —
`exercise_history`, `e1rm_trend`, `weekly_band`, `rep_distribution`,
`adherence`, `records_ladder`.

This is already `BEATING_HEVY_PLAN` §5's tooling for B3. It is listed here to
make one point the plan does not: **build it once, generically, in
`_shared/`, and it is the retrieval mechanism for every AI surface after
it.** Built per-feature, it is three half-versions.

### A2 — Nothing checks that the model's numbers are real ⭐

The `chip` field exists so a reader can catch a fabricated figure. §12 sets
the tolerance at zero: _"one confirmed fabricated number pauses the
feature."_ The check, today, is a human reading a chip.

**It is machine-checkable at generation time.** The stat block is JSON we
built; the response is text. Extract every numeric token from every `title`,
`body` and `chip`, and require each one to appear in the block (allowing the
model's own rounding, and a small allow-list for the constants in the system
prompt — the 10-to-20 set band, week counts). On failure: retry once with the
violation named, then drop the offending note rather than the whole set.

This is the **highest-value missing piece in the repo** and it is perhaps
forty lines:

- It converts a written policy into a running guard.
- It is the eval harness's core assertion, obtained for free — the same
  function grades a fixture offline and a live response in production.
- It is the only thing that makes "hallucinated-figure rate: zero" a
  measurement instead of an aspiration.
- Every AI surface after it inherits it, which means the grounding property
  does not have to be re-earned per feature.

Call it the **grounding gate**. Nothing new should ship on the AI layer
before it exists.

### A3 — The ledger cannot answer the questions the plan asks of it

`ai_generations` stores `(user_id, feature, model, used_free, created_at)`.
And `recordGeneration()` is called **only after success** — in
`coach-notes/index.ts` after `parseInsights`, in `generate-routine/index.ts`
after `validatePlan`.

So every one of these is currently unmeasurable:

| The plan promises                       | The ledger can tell you |
| --------------------------------------- | ----------------------- |
| "ledger-derived $/weekly-active"        | no — no token counts    |
| "alarm at $0.10"                        | no                      |
| "hallucinated-figure rate from audits"  | no — no output stored   |
| "median answer < 8s" (GATE B3)          | no — no latency         |
| free-tier carry rate under real load    | only for successes      |
| parse-failure and truncation rates      | no — failures unlogged  |
| "the notes got worse after I changed X" | model only, not prompt  |

Two production incidents are already recorded in the code comments —
truncation misdiagnosed as "the model returned junk" (twice), and two users
burning a weekly regenerate on an empty account. Both were found by a person
noticing. Neither would have needed noticing.

**Build:** add `ok boolean`, `error_code text`, `latency_ms int`,
`finish_reason text`, `tokens_in int`, `tokens_out int`, `prompt_version
text`, `tool_calls int`. Move `recordGeneration` into a `finally` so **every
attempt is recorded, successful or not**, with the quota still counting only
successes. The ledger is then the cost dashboard the plan already calls it,
and no new service is involved.

### A4 — Prompts are unversioned

`SYSTEM` is a module const in each function. Editing it silently changes every
user's output. `coach_notes.model` is stored precisely because _"the notes got
worse" is otherwise unanswerable_ — but the prompt changes more often than the
model does. One `PROMPT_VERSION` const per function, one column on both tables.

### A5 — No circuit breaker, and a ~90-second worst case

`TIMEOUT_MS` is 45s, tried against the free model and then the paid one. A
provider having a bad afternoon means 90 seconds of spinner. There is no
state in which a surface deliberately gives up and renders its deterministic
skeleton.

Today this is survivable: the Coach tab is not the sacred path, and the Log
screen never calls a model. **B1's pre-workout briefing changes that** — it
puts a model call one tab from the hot path. That is the moment
_"the app must be fully usable with AI dark"_ stops being a sentence and
needs to be a code path: on breaker-open, render the numbers with no prose,
and say so in one line.

### A6 — The exercise catalogue is re-sent, uncacheable, on every routine call

`generate-routine` puts the filtered catalogue (~135 seeded exercises plus the
user's own) in the **user** message. The system prompt is static and gets
prefix-cached; the user message does not. So roughly 1.5–2k input tokens,
identical for every user with the same equipment filter, are paid for on every
call.

Not urgent at beta volume, and honestly _unmeasured_ — because A3 means we do
not store token counts. It is the dominant input cost of that feature. Fix
when convenient: stratify to top-N per muscle group, or move the unfiltered
catalogue into the system prompt and keep only custom exercises in the user
block.

## 4. The eval harness — three tiers, and only two run in CI

The plans describe this; nothing implements it. Here is the shape that fits
what already exists.

**Tier 1 — deterministic goldens (CI, free, fast).** Canned `coach_stats()`
outputs as fixtures; assert the numbers the SQL is supposed to produce. This
tier tests _our_ code and has no model in it, so it belongs beside the
existing `validate-plan.test.ts` and runs on every PR. It is also the tier
that would have caught a stat-block regression silently changing what the
coach sees.

**Tier 2 — contract assertions against recorded outputs (CI, free, fast).**
Check in a set of real model responses; assert the _contract_, not the prose:
valid JSON · 3–5 insights · length caps respected · **every numeric token
grounded in the input block (A2's function)** · no exercise name outside the
catalogue · no medical, injury, diet or supplement vocabulary. Recorded
outputs go stale, which is a feature: staleness is what a live tier is for.

**Tier 3 — live runs (manual, costs money, weekly during beta).**
`npm run eval:live` sends the fixtures to the real provider through the real
`chat()` and runs the same Tier-2 assertions on the answers. This is the only
tier that catches "the free model silently got worse" or "the new model
ignores `response_format`" — both of which have already happened once each,
per the comments in `openrouter.ts`. It must never gate CI, because a red
build caused by someone else's rate limit trains people to ignore red builds.

The key design point: **Tiers 2 and 3 share one assertion module with the
production grounding gate.** One definition of "grounded", used in the
function, in CI, and in the weekly spot-check.

## 5. The harness holes — the CI wall has five gaps

The wall is `lint && format:check && typecheck && check:vercel && test &&
build`. It is a good wall. Here is what walks through it.

### I1 — The Edge Functions are not typechecked and not tested ⭐

Measured, not guessed. `tsc --noEmit --listFiles` includes exactly three files
under `supabase/functions/`:

```
supabase/functions/_shared/has-training-data.ts
supabase/functions/_shared/parse-json-object.ts
supabase/functions/_shared/validate-plan.ts
```

…and only because `src/lib/*.test.ts` imports them across the boundary.
Outside the program entirely: `_shared/context.ts`, `_shared/openrouter.ts`,
`auth-alias/index.ts`, `coach-notes/index.ts`, `generate-routine/index.ts`.
ESLint _does_ reach them (confirmed with `--debug`) — but with no type
information and no import resolution, so it catches syntax and little else.

That list is: **the auth boundary, the quota arithmetic, the model key
handling, the free/paid fallback, and the username-alias sign-in.** Every
security- and money-critical line in the project, with no typecheck and no
test — and since `deploy-functions.yml` landed, a merge to `main` puts them
straight into production.

**Fix, in order of value per hour:**

1. `denoland/setup-deno` + `deno check supabase/functions/**/*.ts` as a CI
   step. Catches the whole class immediately.
2. Extract quota arithmetic (`quotaRemaining`'s window maths, the limits
   table) into a pure module and unit-test it — the same trick already used
   to bring `validate-plan` into the vitest suite. Quota is UX and money at
   once and currently has zero tests.
3. `deno test` for `openrouter.ts`'s fallback ladder against a stubbed
   `fetch`. The rule "any free failure falls through to paid" was rewritten
   once after a 404 broke a feature; it deserves a test that pins it.

### I2 — `check_migrations.py` is not in CI

`CLAUDE.md` instructs a human to run it. Nothing enforces it. Migration 0007
shipped a column named `position` — a reserved word — and failed to parse in
its entirety. That is exactly what this catches, and it is six lines of YAML
plus `pip install pglast`.

The same paragraph in `CLAUDE.md` makes the deeper point and it should be
repeated here: **a parse check is the floor.** 0015 and 0016 are both
parse-checked and neither has ever been executed.

### I3 — The RLS tests name a runner that does not exist

`supabase/tests/rls_social.sql` line 12 says:

```
./scripts/run_sql.sh supabase/tests/rls_social.sql
```

`scripts/run_sql.sh` **is not in the repo.** So both security suites —
`rls_social.sql` and `rls_custom_exercises.sql` — are, in practice, paste-into-
the-dashboard rituals, and `LAUNCH.md` gates sending invites on one of them.

**Fix:** write the four-line `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$1"`
that the comment already promises. Then the honest next step, once it is worth
the setup: a Supabase preview branch in CI so both suites run on every PR that
touches `supabase/`.

### I4 — Nothing looks at the app

Three defects reached production in a single day through this one gap:

- `inset-block-0` is not a Tailwind v4 utility, so four elements rendered at
  height 0 — including a chart the parity plan listed as a differentiator to
  protect. A class that does not exist emits no CSS and fails no check.
- Follows and likes had **never once worked** from the client, because the
  insert omitted the owner column. The RLS suite passed the whole time: it
  names both columns the way SQL does, and the client does not.
- Progress functions that had never rendered at all.

The parity plan's response was to make a visual pass a **rule**. A rule a
human remembers is the same class of thing as `check_migrations.py` — it works
until the day it matters.

**Fix — make the ad-hoc harness permanent.** Playwright (already installable
offline here; Chromium is at `/opt/pw-browsers`) against `vite preview`, with
Supabase stubbed at the network layer via `page.route` and a session injected
into `localStorage`. Assert three things:

1. Each tab renders and no error is thrown.
2. The elements that were silently zero have `getBoundingClientRect().height

> 0`. A layout assertion is the only kind of check that catches a class name
> that does not exist.

3. **The request bodies the client sends** match what the RLS suite asserts
   about them. This is the one that would have caught the follow bug, and it
   generalises: assertion 7b in `rls_social.sql` exists because nothing tested
   the client's actual payload, and 7b fixes one instance of a class.

### I5 — No error boundary, and no error reporting at all

The boundary is already L7 in the parity plan and U1c in the prompts file.
The reporting is not: grep finds no `ErrorBoundary`, no `componentDidCatch`,
no `window.onerror`, no error service. `@vercel/analytics` is page views. **A
crash in production today is completely invisible unless a user mentions it.**

Smallest useful version, and deliberately not more: the boundary catches, and
writes `(message, component, url, at)` to a `client_errors` table with an
insert-own RLS policy. No third-party service, no PII, no new monthly cost.

### I6 — No coverage signal

227 tests across 20 files is real. But nothing reports which of the ~50
modules in `src/` have none — and `src/lib/social.ts` had none, which is
exactly where the production bug lived. `vitest --coverage` with a floor
(not a percentage target — a **list of modules that must have a test file**)
turns "we test a lot" into "we test these".

## 6. Tools to install — the literal list

| Tool                        | Buys                                 | Cost      | Where                |
| --------------------------- | ------------------------------------ | --------- | -------------------- |
| `denoland/setup-deno` in CI | typecheck of 5 unverified files (I1) | 6 lines   | `ci.yml`             |
| `python` + `pglast` in CI   | migration parse on every PR (I2)     | 6 lines   | `ci.yml`             |
| `scripts/run_sql.sh`        | RLS suites become runnable (I3)      | 4 lines   | `scripts/`           |
| `@playwright/test` (dev)    | the app is looked at (I4)            | ~1 day    | `test:smoke`         |
| `vitest --coverage`         | the untested-module list (I6)        | 1 line    | `package.json`       |
| `scripts/ai_eval.ts`        | Tiers 2 + 3 (§4)                     | ~1 day    | `eval` / `eval:live` |
| Supabase preview branch     | RLS + migrations run for real        | ~half day | later, when worth it |
| **OpenRouter monthly cap**  | a bug cannot become a bill           | 2 minutes | **Ameen, unset**     |

That last row is not new — §2C asked for it and `BEATING_HEVY_PLAN` §10 asks
again. It is still unset, it is the only hard stop between a retry loop and a
credit card, and it is the cheapest item on this page.

## 7. What this audit is **not** proposing

Named so they stop being suggested:

- **A vector database or an embedding pipeline.** §2.
- **A third-party observability platform.** The ledger is a Postgres table we
  already own; adding Sentry/Datadog to a pre-beta one-person product buys a
  dashboard and a bill.
- **A model-graded eval ("LLM as judge").** The contract is checkable
  deterministically — grounded numbers, valid shape, catalogue membership,
  length. A judge model would add cost, variance, and a second thing to trust.
- **CI that calls a model provider.** Tier 3 is manual on purpose. A build
  that goes red because of someone else's rate limit teaches people to ignore
  red builds.
- **Fine-tuning, self-hosting, or a model gateway.** Per-feature env vars
  already make a model swap a config change.
- **A staging environment.** Preview branches when the RLS suites justify
  them; not a parallel deployment to maintain.
- **Chasing a coverage percentage.** I6 is a list of modules, not a number.

## 8. Sequence — four tranches, each shippable alone

Slots into the existing releases rather than competing with them. Nothing here
is a phase; none of it needs a product gate, because none of it is a user
surface. **Only H2 gates anything.**

**H0 — hygiene (half a day, ship whenever).** I2 migrations in CI · I3
`run_sql.sh` · A4 prompt versioning. No product surface touched, no risk.

**H1 — with R1 / U1c (~1 day).** I1 `deno check` + the quota unit tests · I5
error boundary and the `client_errors` table · I6 coverage floor. U1c already
opens the error-boundary file; the rest rides along.

**H2 — before R4 / B1, and this one is a gate ⭐ (~2 days).** A2 grounding
gate · A3 ledger columns and record-every-attempt · A5 circuit breaker · §4
Tiers 1 and 2 in CI.

> **Do not ship a new AI surface before H2 exists.** R4 is where the lead
> opens and it is also where the first surface runs that a user is asked to
> _act_ on. Shipping it with no grounding check and a ledger that cannot see
> failures means the first fabricated number is found by a lifter, not by us —
> and §12 already pre-commits to pausing the feature when that happens. H2 is
> two days that protect the release the whole offense plan rests on.

**H3 — before R6 / B3 (~2 days).** A1 tool layer + the stat functions · Tier 3
live eval · I4 Playwright smoke. B3's gate ("zero hallucinated numbers,
every figure traceable — audit the ledger") is **only auditable if H2 shipped**;
that dependency is now explicit rather than assumed.

A6 (catalogue tokens) rides with whichever tranche is convenient once A3 makes
its cost visible.

## 9. Where this lands in the existing plans

- `BEATING_HEVY_PLAN` §10 already names the eval harness, the ledger
  extension, the cost cap and the circuit breaker. This file is the audit that
  says **none of them exist**, and adds the two the plan does not name: the
  **grounding gate (A2)** and **prompt versioning (A4)**.
- `BEATING_HEVY_PLAN` §11's R6 row lists "eval harness" as a dependency. H2 +
  H3 are what that dependency actually costs: about four days.
- `HEVY_PARITY_UPGRADE_PLAN` §4's visual-verification rule gets its
  enforcement in I4 — the rule stops depending on memory.
- `IMPLEMENTATION_PROMPTS.md` should gain H0–H3 as prompts. U1c already
  carries the error boundary; H1 folds in beside it.

---

**Priority read.** Two items carry most of the value and both are cheap.
**A2, the grounding gate**, is forty lines that turn the zero-hallucination
policy into a running check and hand the eval harness its core assertion.
**I1, `deno check` in CI**, is six lines of YAML across the auth boundary, the
quota ledger and the model key — the least verified and most consequential code
in the repository, currently auto-deploying to production on merge. Neither
needs a plan, a gate, or a decision. Everything else on this page can wait for
the tranche it belongs to.
