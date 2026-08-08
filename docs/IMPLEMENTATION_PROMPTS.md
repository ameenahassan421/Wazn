# Implementation prompts — the run-book

Copy-paste prompts for Claude Code sessions, one per work session, that
implement `docs/HEVY_PARITY_UPGRADE_PLAN.md` (U-series) and
`docs/BEATING_HEVY_PLAN.md` (B-series).

## How to use this file

- **Pasting a prompt IS the approval.** Both plans are proposals until
  you start a phase; sending its prompt is you activating that phase.
  Phase gates stay hard stops: each session ends with a gate report and
  STOPS — the next prompt is yours to send, or not.
- **Run them in the listed order** unless a prompt's "Depends on" line
  says otherwise. The order interleaves defense (U) and offense (B) the
  way the plans agreed: free wins → proactive coach → workout overview
  → offline → interactive AI → programming → social depth → stores.
- One prompt ≈ one session. The bigger phases (U2, U3, B3) are split
  into a design/prep prompt and a build prompt.
- Every session already inherits the standing rules via `CLAUDE.md`
  (read the plan + DECISIONS + STATUS first, skills first, CI wall
  before push, log deviations). The prompts repeat only the
  phase-specific parts.

## Before anything below: the beta blockers (yours, not Claude's)

The launch queue is empty and these two items gate invites — no prompt
below should run before the beta is actually underway:

1. Check Resend's logs for the Yahoo delivery failure before more
   invites go out.
2. Run `LAUNCH.md` with a second account on a real phone.

One prompt Claude _can_ take now, from the open decision in STATUS:

```
Delete all my workouts with zero sets, server-side. Verify the count
before and after, and confirm History renders clean.
```

---

## Auth upgrade — Google sign-in (owner decision 2026-08-07)

Depends on: **Part 1 of `docs/auth-social-setup.md` done by Ameen**
(Google OAuth client created, provider enabled in Supabase). Can run
before or during beta — it is owner-directed auth work, and the OTP
path stays live throughout. Apple waits for Stage 4B, where it becomes
mandatory (see the setup doc).

```
The Google provider is now enabled in Supabase per
docs/auth-social-setup.md Part 1. Implement the full auth screen from
that doc's "final shape": (1) "Continue with Google" as the hero via
signInWithOAuth — neutral dark button variant, the design system's
colour rule holds; make sure the OAuth callback coexists with the
/join/{code} invite capture in src/main.tsx. (2) Email + password
sign-up and sign-in per the doc's password section: signUp with email
confirmation on, signInWithPassword, and CODE-BASED password recovery
(resetPasswordForEmail + verifyOtp type 'recovery' + updateUser — no
recovery links; the recovery template must carry {{ .Token }}). Set
the password minimum to 8 and enable leaked-password protection if
the tier offers it. (3) Keep the existing 6-digit code flow as "Email
me a code instead", unchanged. (4) Username-as-sign-in-alias on both
non-social paths: the identifier field accepts email or username; a
username resolves to the account email server-side (security-definer
RPC or Edge Function — never expose the email to the client unmasked);
identical responses whether the username exists or not; wrong
username on the password form fails as "invalid credentials". Move
username choice into Welcome-screen onboarding.

Verify explicitly: a Google sign-in, a password sign-in, and a code
sign-in with the same verified email all land in the SAME account —
the profile-merge incident must not repeat. While you are in the auth
path, add Gmail dot-normalisation at typed-email sign-in (STATUS names
it as unbuilt and it caused the duplicate-account incident). Update
LAUNCH.md so the second-account pass covers all four paths. Do not
remove the code path. CI wall, push, report, stop.
```

---

## U1c — The visual pass, plus what the launch pass hit (§2.3 L6–L9)

Depends on: nothing. Two findings from the 2026-08-07 screenshot run
that U1a and U1b did not cover — both small, both on every screen a
Hevy user would compare. (The other two findings from that pass, the
never-drawn muscle-balance chart and the duplicated empty-state
sentence, are already fixed in U1a/U1b.)

```
Fix the two open findings from the visual pass, per
docs/HEVY_PARITY_UPGRADE_PLAN.md §2.3 L6 and L7. Load
wellness-app-design and impeccable first.

L6 — no number in the app is grouped. There is no toLocaleString or
Intl.NumberFormat anywhere in src/, so volume renders as 52393 and
90830.5, with inconsistent precision in the same column. Add ONE
formatter in src/lib/format.ts (unit-tested first, progress.ts
pattern): thousands-grouped, locale-aware so Stage 5 Arabic inherits
it, and a fixed precision rule for volume — decide whether a half-kg
on a five-figure total is information or noise, and say why in
DECISIONS.md. Apply it everywhere a large number renders: History
rows, the Progress week card and captions, chart captions, feed
cards, leaderboard, finish summary, and the share card. Weight
entry fields and set rows keep their existing precision — this is a
display-formatting change, never a stored-value change.

L7 — one leaf crash blanks a whole tab. There is no error boundary in
src/, and ExerciseThumb.toneFor() reads group.length on a value cast
through `as Exercise`. Guard toneFor, and add an error boundary around
each lazy screen so a crash renders a plain amber-outlined "This
screen failed to draw" with the tab bar still usable, instead of a
black rectangle. The Log screen matters most: a crash mid-workout must
never look like lost data — say so in the fallback copy.

L8 — discard exists and cannot be found. U1b shipped it behind the
armed Finish button, which is the right place for a destructive action
but the wrong place to discover one: the label says "Finish", and the
armed row times out while you are still reading it. Add "Discard
workout" to the header overflow (⋯) as a second route, two-tap armed
there as well. Do NOT promote it to a top-level control — a one-tap
delete of a live session beside the thumb is how somebody loses a
workout. Also add delete-workout to the History expansion (moved out
of U4, same reasoning): one delete behind the existing "Edit sets"
gate, two-tap armed, then refreshRecords() because removing a session
can demote a PR downstream — the path History already proves when a
corrected set does the same.

L9 — nothing knows which routine day is next. Finishing returns you to
an idle Log screen listing routines by stored position; the app has no
idea a four-day split just consumed Upper A. Build the deterministic
half only: work out the due day from the user's own history (last
completed routine day, then the routine's order), sort the routine
list by it, and make the due one the primary start action with the
others still one tap away. Pure SQL and client logic — no model, no
Edge Function; B1's briefing will later add the sentence explaining
WHY it is due, and must not require redesigning this.

Order and pre-select; never auto-start, and never hide the other
days. Read §2 of docs/BEATING_HEVY_PLAN.md first — an anticipation has
to be as cheap to override as to accept, and a lifter who wants
Thursday's session on a Tuesday is not a mis-tap.

Screenshot the built app before reporting (see the parity plan §4
visual-verification rule: viewport shots not fullPage, and stub every
column the real RPC returns). CI wall, push, report, stop.
```

---

## U7 — Feel: latency budgets and a motion system (release R1, with U1c)

Depends on: nothing. Pairs with U1c to make one release.

```
Build phase U7 of docs/HEVY_PARITY_UPGRADE_PLAN.md. Load
wellness-app-design and impeccable first.

(1) Latency budgets, measured not asserted. Establish the numbers on a
mid-range Android profile over a 3G-class connection: tap-to-first-
interactive under 2s, core-loop tap under 100ms perceived, tab switch
under 150ms. Add a scripted Playwright trace of "open -> start workout
-> log a set" plus a Lighthouse run, and put the measured numbers in
the PR body the way test counts already are. Fix what misses: check
the app-shell precache actually covers the Log path, that no font or
image blocks first paint, and that the lazy screens are not being
pulled into the initial chunk. A PWA beating a native app's cold start
is the claim — prove or disprove it with numbers, and say which.

(2) A motion system. Four tokens on the two approved easings —
instant / press / transition / celebration — defined in index.css
beside the existing tokens, and spent only where motion answers a
question the user is asking: set committed, timer running, PR beaten,
screen came from somewhere. prefers-reduced-motion collapses all four.
Nothing decorative, nothing over 200ms on the hot path, and the 80ms
press behaviour that exists today stays as the press token.

Screenshot the built app per the §4 visual-verification rule. CI wall,
push, report against GATE U7, stop.
```

---

## H-series — Infrastructure (docs/INFRASTRUCTURE_AUDIT.md)

> **All four shipped on 2026-08-08.** The prompts are kept because they are
> the record of what each tranche was for, and because a follow-up ("extend
> the eval fixtures", "add a stat tool") is easier to write against them than
> from scratch. §10 of the audit says what changed against the plan.
>
> **H2 shipped, so the B-series is unblocked** — but B3 additionally needs
> Ameen's explicit reversal of the no-chat rule, which is unchanged.

None of these is a user surface, so none needs a product gate. **H2 is the
one hard dependency: do not send a B-series prompt before it has shipped.**

### H0 — Hygiene (half a day, send any time)

```
Ship tranche H0 of docs/INFRASTRUCTURE_AUDIT.md §8.

(1) I2: add a migration-parse step to .github/workflows/ci.yml — set up
python, `pip install pglast`, run `python3 scripts/check_migrations.py`.
CLAUDE.md tells a human to run this; 0007 shipped a reserved word.
(2) I3: write scripts/run_sql.sh — the psql runner that
supabase/tests/rls_social.sql line 12 already tells people to use and
that does not exist. ON_ERROR_STOP=1, DATABASE_URL from env, refuse to
run with no argument. Both RLS suites must actually execute with it.
(3) A4: a PROMPT_VERSION const in each Edge Function, carried into a
new prompt_version column on coach_notes and ai_generations.

Migration parse-check, CI wall, push, report, stop.
```

### H1 — Verification floor (~1 day, rides with R1/U1c)

```
Ship tranche H1 of docs/INFRASTRUCTURE_AUDIT.md §8.

(1) I1: add denoland/setup-deno to CI and `deno check` every file under
supabase/functions. Five files there — context.ts, openrouter.ts and
all three index.ts — are in no typecheck and no test today, confirmed
with `tsc --listFiles`, and they hold auth, quota and the model key
while auto-deploying on merge. Then extract the quota window arithmetic
from context.ts into a pure module and unit-test it, the same way
validate-plan reached the vitest suite.
(2) I5: the error boundary (also U1c's L7) plus a client_errors table,
insert-own RLS, message/component/url/at only — no PII, no third party.
(3) I6: vitest --coverage, and a checked-in list of src modules that
must have a test file. A list, not a percentage. src/lib/social.ts had
none and that is where the production bug lived.

Migration parse-check, CI wall, push, report, stop.
```

### H2 — The AI safety floor ⭐ (~2 days) — **gates every B-series prompt**

```
Ship tranche H2 of docs/INFRASTRUCTURE_AUDIT.md §8. Read §3 and §4
first.

(1) A2, the grounding gate: a shared module that extracts every numeric
token from a model response and requires each to appear in the stat
block it was given, allowing the model's own rounding plus an
allow-list for the constants stated in the system prompt. Wire it into
coach-notes: on violation retry once naming the violation, then drop
the offending note rather than the whole set. This module is also the
eval harness's core assertion — one definition of "grounded", used in
production and in CI.
(2) A3: extend ai_generations with ok, error_code, latency_ms,
finish_reason, tokens_in, tokens_out, tool_calls; move recordGeneration
into a finally so EVERY attempt is recorded. Quota still counts only
successes. §12 promises ledger-derived cost, latency and hallucination
rates and the current five columns can produce none of them.
(3) A5: a circuit breaker — on repeated provider failure the surface
renders its deterministic skeleton with one honest line instead of a
90-second spinner.
(4) Eval tiers 1 and 2 from §4, in CI, no network: golden stat blocks
asserting the SQL's numbers, and recorded model outputs asserting the
contract via the A2 module.

Migration parse-check, CI wall, push, report, stop.
```

### H3 — Tools and eyes (~2 days, before R6/B3)

```
Ship tranche H3 of docs/INFRASTRUCTURE_AUDIT.md §8.

(1) A1: grow chat() a tools parameter with a bounded loop (max 4 calls,
then it must answer) and a per-turn trace of tool/args/row-count.
Build it once in _shared, generically — it is the retrieval mechanism
for every AI surface after it. Add the security-invoker, RLS-scoped
stat functions B3a needs.
(2) Eval tier 3: `npm run eval:live` sends the fixtures through the
real chat() and runs the tier-2 assertions on real answers. Manual and
never in CI — a build that goes red on someone else's rate limit trains
people to ignore red builds.
(3) I4: a Playwright smoke run against vite preview with Supabase
stubbed at the network layer. Assert each tab renders without a thrown
error; assert height > 0 on the elements inset-block-0 silently
zeroed; and assert the REQUEST BODIES the client sends match what the
RLS suites assert about them — that last one is what would have caught
the follow bug, and it generalises assertion 7b in rls_social.sql.

Migration parse-check, CI wall, push, report, stop.
```

---

## R4 — The rest canvas (offense plan §8-E1, ships with B1/B2)

Depends on: B1 shipped (the briefing/debrief surfaces supply the
content). ⚠️ This one deliberately touches the sacred flow — read
§8-E1's rules before designing, and treat a single "this is noise"
report from a tester as a kill signal.

```
Build the rest canvas from docs/BEATING_HEVY_PLAN.md §8-E1. Load
wellness-app-design and impeccable first, and reread the "one law"
section of the skill before you design anything.

Between sets there are 60-180 seconds of attention every tracker
wastes. The rest surface shows ONE of: the next set's target and why
it moved, one insight about the session in progress, or the crew's
activity today — deterministic layer picks the fact, the model phrases
it, and both are already computed for the briefing and debrief so the
marginal cost is near zero.

The rules are the feature: passive (no input, ever), silent, readable
at three feet, dismissible permanently in one tap, and it VANISHES the
moment the user reaches for the next set — the log control must not
move, shrink, or arrive later than it does today. Prove that last
point with a tap-count and timing comparison before and after, and put
both in the PR.

If the deterministic layer has nothing worth saying, the canvas shows
the plain timer exactly as today. Silence is a valid state and the
better default. CI wall, screenshots, push, report, stop.
```

---

## R5 — Import as onboarding (offense plan §9-F1)

Depends on: nothing. The importer already exists as a script.

```
Productize the Hevy import per docs/BEATING_HEVY_PLAN.md §9-F1. Load
wellness-app-design first.

scripts/import_hevy.ts already parses a Hevy CSV export, maps
exercises, and applies weight corrections — it built Ameen's nine
months of history. Turn it into a first-run path: "Bring your history
from Hevy" on the auth screen and in the Welcome screen, file picker,
parse and preview client-side (how many workouts, how many sets, what
date range, which exercises did not match), then one confirm that
writes under the user's own RLS — never the service role, never a
server-side upload of somebody's file.

The payoff is the retention engine firing on day one: a switcher's
first session opens with their own previous-session ghosts on every
row. Design the failure cases honestly — a wrong file, a truncated
export, an unmatched exercise (offer to create it as custom), a
partial import (resumable, never a silent half-write). Show what will
happen before it happens; this is the one flow where a surprise is
unforgivable, because it is somebody's training history.

CI wall, screenshots, push, report, stop.
```

---

## Phase U1 — Free wins (parity plan §3, U1)

Depends on: beta live. Zero core-loop risk.

### U1a — Render the charts that already exist

```
Start phase U1 of docs/HEVY_PARITY_UPGRADE_PLAN.md — items 1 and 2 only.
Load the wellness-app-design, impeccable, and dataviz skills first.

Render the written-and-tested-but-unused functions in src/lib/progress.ts:
trainingCalendar/heatStep as a calendar heatmap in History,
liftBalance and sessionsPerWeek as new Progress blocks, using the
existing hand-rolled SVG chart grammar and design v2 tokens (no chart
library). Then add time-range chips (3M/6M/1Y/All) to the volume and
strength blocks by parameterizing the existing RPC calls — one shared
chip-row component.

Empty states must teach, like the muscle-balance chart does. Logical
properties only. Run the full CI wall, push, report against GATE U1's
chart items, and stop.
```

### U1b — Flow fixes and small parity items

```
Continue phase U1 of docs/HEVY_PARITY_UPGRADE_PLAN.md — items 3 through 7.
Load the wellness-app-design and impeccable skills first.

Build: (1) picker filter chips for muscle group and equipment;
(2) discard-workout — auto-discard zero-set workouts on leave plus an
explicit "Discard workout" action near the armed finish flow; (3)
un-superset; (4) fix the sticky warmup set-type after logging
(SetEntry.tsx:171 — a working set after warmups must not silently log
as warmup); (5) workout rename + a nullable workouts.note column
(migration, parse-checked with scripts/check_migrations.py, load
supabase-postgres-best-practices first) editable from FinishSummary
and the History expansion; (6) a rest-duration control writing
exercises.default_rest_seconds; (7) one-tap "log this step" on the
warmup ramp rows.

Nothing may add taps to the normal set-logging path. CI wall, push,
report against GATE U1 in full, and stop.
```

---

## Phase B1 — The proactive coach arrives (offense plan §3)

Depends on: beta live; **set the hard monthly cap on the OpenRouter
key first** (still unset — §2C asks for it).

```
Start phase B1 of docs/BEATING_HEVY_PLAN.md. Load the
wellness-app-design skill first and reread §3 (Pillar A) and §7.

Build the pre-workout briefing (idle Log screen, above Start: routine
day due, last top set, one target, rest-gap note — deterministic facts,
model phrases ≤2 sentences) and the post-workout debrief (one
model-phrased line on FinishSummary from stats it already fetched plus
coach_stats()). Reuse the existing Edge Function pattern: chat() helper,
free-first model with paid fallback, finish_reason handling, per-feature
model env vars, ai_generations ledger. Lazy generation and caching only;
regenerate only when new workouts land. The card is dismissible, never
blocks Start, and the coach never renders during an active workout.
Every figure must come from SQL — the model writes words only. Add a
coach_views event table (migration, parse-checked) so GATE B1 is
measurable.

If AI is dark (quota, 429, no key), both surfaces must render their
deterministic skeleton or nothing — never an error in the flow. CI
wall, push (Edge Functions deploy on merge), report against GATE B1's
build items, and stop.
```

## Phase B2 — The weekly review contract

Depends on: B1 shipped.

```
Start phase B2 of docs/BEATING_HEVY_PLAN.md: upgrade Coach's Notes to
the structured weekly review in §3-A3. Load wellness-app-design first.

Same sections every week: adherence (planned vs done), band status per
muscle group, plateau flags (e1RM slope over 6+ sessions on anchor
lifts), progression wins, and exactly ONE "next week, change this"
recommendation. Deterministic layer computes every figure (extend
coach_stats() or add SQL functions — RLS-scoped, unit-tested); the
model phrases within the fixed contract; data chips as today; existing
cache and weekly quota unchanged.

Also build the eval-harness foundation from §7 while you are in the
functions: golden stat fixtures asserting the deterministic numbers and
the output contract (valid shape, every cited figure present in the
input block, length caps, no exercise names outside the catalog). CI
wall, push, report, stop.
```

---

## Phase U2 — The workout overview (parity plan §3, U2)

The structural one. Two sessions minimum.

### U2a — Design addendum first

```
Phase U2 of docs/HEVY_PARITY_UPGRADE_PLAN.md, design pass only — no app
code. Load wellness-app-design and impeccable, and read the v2/v2.1
design docs in docs/design/ plus WAZN_PLAN.md §2.4.

Design the workout overview screen against the v2 system, as a v2.2
addendum committed to docs/design/: all exercise blocks visible;
planned ghost rows (routine targets ∪ previous session) with pre-filled
values; commit-on-check turning a ghost into a real insert (the "a set
row means it happened" rule holds at the data layer — LogScreen.tsx:270
explains it); per-row previous ghost; tap-through to today's focused
one-exercise view as the zoom state; drag-to-reorder; skipped-exercise
visibility; exercise notes on the block; superset rails preserved.
Specify every state (empty, mid-workout, offline, reduced-motion),
ghost-row commit targets ≥56px, thumb-zone placement, and how the
rest timer bar coexists. Commit the addendum, report, stop.
```

### U2b — Build it

> Rewritten 2026-08-08, **after** U2a shipped. The first version of this
> prompt was written when the addendum did not exist and could only gesture
> at it; this one carries what the addendum actually settled, so a fresh
> session does not re-derive decisions that are already made and reviewed.
> Sent to a session on 2026-08-08.

```
Build phase U2b — the workout overview — from the v2.2 addendum.

Read first: docs/design/v2.2-workout-overview.md and its .html (open the
HTML and look at it), plus docs/HEVY_PARITY_UPGRADE_PLAN.md §3-U2 and §1's
protect list. Load the wellness-app-design and impeccable skills before
writing any UI.

THE DESIGN IS DECIDED. Do not re-derive it. The load-bearing parts:

1. Two levels, different jobs. The overview is the ledger; the focused view
   stays the keyboard and survives unchanged as the zoom state. On a row:
   tap the CHECK to commit exactly as shown (1 tap — this must not get more
   expensive than today, GATE U2 measures it); tap the VALUES to open the
   focused view at that row.
2. Ghost rows are client state and NEVER touch the database. "A set row
   means it happened" still governs the schema. Commit = INSERT.
   Precedence: routine gives row count + rep target, previous session gives
   weight; freestyle uses previous session for both; neither = one blank
   ghost with no invented weight.
3. Four row states separated by value contrast, border style and fill —
   never hue. No new colour, texture or motion token. The commit transition
   is the existing 90ms set-commit rise.
4. Block header: the name owns the whole header row (progress and the note
   go on a meta line beneath). This is not cosmetic — with progress on the
   header line, "Bench Press (Barbell)" and "Lat Pulldown (Cable)" both
   truncate.
5. Superset rail is solid 2px amber, not knurl. Knurl stays reserved.
6. Reorder: grip-only long-press, hand-rolled pointer events first;
   @dnd-kit/core only if it fights scroll and only with a DECISIONS.md entry
   naming the size (precache ceiling 600 KiB, currently 571). The order must
   survive a reload. If that needs a column, DO NOT NAME IT `position` — it
   is a reserved word and 0007 already shipped that mistake.
7. Skipped exercises exist only at Finish, never mid-workout.
8. Read the addendum's "What this design does NOT do" list and honour it.

HARD CONSTRAINTS: no pre-inserted sets, ever. The protect list must survive
unchanged — superset round-rest, deadline rest timer, mid-set unit-flip
conversion, PR-on-insert, 1-tap repeat — proven by the existing tests plus
new ones, not by inspection.

VERIFY: full CI wall (lint, format:check, typecheck, check:vercel, test,
build). Then `npm run shots` and LOOK at the images — the harness stubs the
Edge Functions now, so all five tabs render. Then `npm run check:deploy`.
If you touch the core loop, `npm run perf` and quote the numbers. If you add
a migration, `python3 scripts/check_migrations.py` (needs `pip install
pglast`) and say plainly that it is parse-checked and not applied.

Push, open a draft PR, report against GATE U2, and STOP. The real-gym pass
is Ameen's and is the final item.
```

Two facts that session will need and cannot infer:

- **Production is at migration 0018 and `client_errors` exists**, so a crash
  in the new overview lands in a table instead of waiting to be noticed.
  Worth querying after the first real session.
- **Migrations are not applied by merging.** Merging `main` deploys the Edge
  Functions and nothing else; SQL is applied by hand, and
  `supabase_migrations.schema_migrations` only knows about 0016–0018.

---

## Phase U3 — Offline and trust (parity plan §3, U3 = Stage 4's fast-follow)

Depends on: U2 recommended first (the checkpoint format should capture
overview state), but can precede it if beta reports data loss.

### U3a — Checkpoint and optimistic writes

```
Start phase U3 of docs/HEVY_PARITY_UPGRADE_PLAN.md, trust-ladder rungs
1 and 2. Load wellness-app-design (reread the trust ladder in
references/workout-ux-heuristics.md §4) before designing.

Build: in-progress workout checkpoint persisted locally on every commit
and restored on reopen (crash/refresh/lock safe), then optimistic set
commit — the UI confirms instantly, the insert syncs behind, silent
retry, error surfaced only after repeated failure. PR flags come from
the insert response today (types.ts:76-84) — design explicitly for
PR-pending on optimistic rows and reconcile on ack. Unit-test the queue
logic as pure functions. CI wall, push, report, stop.
```

### U3b — The offline queue and GATE 4

```
Finish phase U3: trust-ladder rungs 3-4 and GATE 4 itself.

IndexedDB write queue (idb or raw — justify in DECISIONS.md) draining
on online/visibilitychange — do not depend on the Background Sync API
(unreliable on iOS). Conflict rule: device wins for own data, stated in
code comments where enforced. Add Workbox runtimeCaching (NetworkFirst)
for previous-session and history reads so the gym dead zone shows last
known data, clearly stamped. Add a Playwright airplane-mode e2e
(context.setOffline) to CI covering: full offline workout → reconnect →
clean sync, and kill-tab-mid-workout → reopen → nothing lost.

CI wall, push, report against GATE 4 verbatim, stop.
```

**BUILT 2026-08-08.** Notes for whoever reads this next:

- **Half of the Workbox ask is not implementable.** Supabase RPCs are POSTs and
  the Cache API stores GETs only, so `previous_session` cannot ride a service
  worker route at any price. The NetworkFirst rule covers `/rest/v1/` GETs
  (History and Progress); the Log screen's reads are cached structurally in
  IndexedDB, which also knows when each snapshot was true so the screen can
  stamp it.
- **The prompt understates the scope by two writes.** A _full_ airplane-mode
  workout has to be started and finished offline too, and both used to await a
  round trip. The queue is an op log now, not a queue of sets.
- **The e2e found two defects, and one of them was a shipped feature that had
  never worked** — U3a's checkpoint cleared itself on mount, before the load
  path could read it. Details in DECISIONS.md. The lesson for the next phase is
  the one this repo keeps relearning: a protect-list item is not verified until
  something drives it.

---

## Phase B3 — Interactive deep analysis (offense plan §4)

⚠️ **Depends on: your explicit approval to reverse the no-chat rule**
(`CoachScreen.tsx:17-22`, design v2.1). Sending these prompts is that
approval — the session will record the reversal in DECISIONS.md.
Also depends on: B2's eval harness, and U3 shipped (a coach whose log
loses sets is a clown).

### B3a — The stat tools and the loop

```
Start phase B3 of docs/BEATING_HEVY_PLAN.md §4. I am explicitly
approving the change from "no chat" to grounded interrogation — record
the reversal and its reasoning in DECISIONS.md. Load
wellness-app-design and supabase-postgres-best-practices first.

Build the foundation: 5-6 whitelisted, parameterized, RLS-scoped SQL
stat functions (exercise_history, e1rm_trend, weekly_band,
rep_distribution, adherence, records_ladder — numbers + units out),
each unit-tested; extend chat() with a bounded tool loop (max 4 calls,
then it must answer); extend the ai_generations ledger with feature,
tool-call count, and cost columns. Extend the eval harness: goldens
proving every cited figure traces to a tool result. No UI yet. CI
wall (migrations parse-checked), push, report, stop.
```

### B3b — The Ask surface

```
Finish phase B3: the Coach-tab Ask surface per §4's interaction design.
Load wellness-app-design and impeccable first.

Question chips first, free text after; answers ≤120 words with the
existing data-chip grammar for every figure; inline mini-chart drawn by
our SVG code when a tool returns a series (the model never draws); one
model-suggested follow-up chip row; the fixed off-domain refusal in
product voice, written by us, not generated. Quotas: N questions/week
free (pick N, log it), unmetered flag ready for Pro. AI disclaimer once
per screen. AI-dark state renders chips disabled with the skeleton,
never an error.

CI wall, push, report against GATE B3 (the ten-question
zero-hallucination audit is run against real beta usage), stop.
```

---

## Phase B4 — Adaptive programming (offense plan §5)

Depends on: U2 (ghost rows are where targets live), U3.

```
Start phase B4 of docs/BEATING_HEVY_PLAN.md §5. Load
wellness-app-design first.

C1: the deterministic progression engine as pure, unit-tested TS —
double progression within rep ranges (top of range twice → +2.5kg),
plateau rule (3 fails → −10% and rebuild), loadable-weight rounding via
the existing plates lib. No model anywhere in the numbers. C2: engine
targets become the ghost-row source in the U2 overview ("target 62.5 ×
8"), 1-tap commit unchanged, with a per-routine "static targets" toggle
— the engine must be refusable. C3: the weekly review's "change this"
can emit a structured routine diff (validated by validate-plan,
rendered as a before/after card, applied ONLY on "Apply changes" — the
existing consent grammar).

CI wall, push, report against GATE B4 (the 4-week wear test is mine),
stop.
```

---

## Phase U4 — Insight depth (parity plan §3, U4)

Can run any time after U1; pairs well while B4's wear-test runs.

```
Start phase U4 of docs/HEVY_PARITY_UPGRADE_PLAN.md. Load
wellness-app-design, impeccable, and dataviz first.

Build: per-exercise e1RM and session-volume line charts in
ExerciseDetail (generalize the existing SVG volume-trend component);
the rep-max ladder (best 1/3/5/8/10RM) on exercise detail plus an
all-time PR list block in Progress; full past-workout editing — add
set, add exercise, set type and RPE in EditSetDialog, rename, delete
workout, duplicate-as-routine — reusing the U2 editor grammar (one
editor, two persistence modes) and the existing refreshRecords
self-healing; custom exercise edit + archive-not-delete; a rep-range
distribution chart (pure function + tests first, progress.ts pattern).

CI wall, push, report against GATE U4, stop.
```

---

## Phases U5 + B5 — Social depth and the crew flywheel

⚠️ **Depends on: GATE 3 retention data.** Do not send these until the
week-6 gate has been read — social amplifies a habit, it doesn't create
one.

### U5 — Profiles and tap-through

```
GATE 3 has been reviewed and social investment is approved. Start phase
U5 of docs/HEVY_PARITY_UPGRADE_PLAN.md. Load wellness-app-design,
impeccable, and supabase-postgres-best-practices first.

Profile pages (stats, heatmap, PR highlights) gated by the existing
private.can_view predicate; follower lists; tap-through from feed and
leaderboard; feed workout detail (per-exercise summary, never per-set);
leaderboard period and metric options; accent-tile emblems, no photo
upload. Visibility stays RLS-only — extend supabase/tests/rls_social.sql
with at least 4 new assertions including adversarial reads. CI wall,
push, report against GATE U5, stop.
```

### B5 — Recap, challenges, PR moments

```
Start phase B5 of docs/BEATING_HEVY_PLAN.md §6. Load
wellness-app-design and supabase-postgres-best-practices first.

D1: the weekly crew recap card in Friends — SQL computes per-viewer
within what private.can_view already allows, model phrases one line,
shareable as a 4:5 card via the existing share-card renderer. D2:
challenges — challenges + challenge_members tables (RLS mirroring
follows, parse-checked migrations), time-boxed volume-or-sessions among
follows, SQL-computed standings, winner on the recap; no global boards.
D3: friend-PR feed prominence now; the push variant waits for native.
D4: the debrief line as an optional share-card caption. RLS tests for
every new surface. CI wall, push, report against GATE B5, stop.
```

---

## Phase U6 + B6 — Stores and native capability (= Stage 4B)

Depends on: healthy beta retention. Needs your Mac, the $25 Play and
$99/year Apple accounts, and store assets.

### U6a — The Capacitor wrap

```
Start phase U6 of docs/HEVY_PARITY_UPGRADE_PLAN.md — Stage 4B's
Capacitor build for BOTH platforms (not TWA; Stage 6 AdMob needs native
slots). Load wellness-app-design first and reread WAZN_PLAN.md Stage 4B.

Wrap the existing React codebase with @capacitor/core — one codebase,
no fork. Wire @capacitor/local-notifications and @capacitor/haptics:
rest-timer completion fires a local notification when the screen is
off (parity gap O18), falling back to the current vibration path on
web. Keep the PWA canonical and unbroken. Produce the Android project
ready for the Play internal-testing track and the iOS project ready
for Xcode on Ameen's Mac, with a step-by-step docs/stage4b-store-setup.md
covering signing, TestFlight, store listing assets, data-safety forms,
and in-app account deletion (App Store requirement — build it if it
does not exist). CI wall, push, report, stop.
```

### B6 — Push delivery

```
Start phase B6 of docs/BEATING_HEVY_PLAN.md: notification delivery per
§3-A4. Web Push first (push_subscriptions table, VAPID Edge Function,
service-worker handler; opt-in offered in context after the 3rd
completed workout, max 1/week "your review is ready"), then the native
variants through the Capacitor builds, including opt-in friend-PR
moments (D3). Never guilt, never daily, quiet hours respected. CI
wall, push, report, stop.
```

---

## Maintenance prompts

**Gate review** (after any phase's real-world test):

```
Phase <ID> gate review. Here is what I observed: <notes>. Compare
against the gate's acceptance list, update STATUS and DECISIONS.md,
list what passed and what needs another session, and stop — do not
start the next phase.
```

**Skill iteration** (any time, interactive session recommended):

```
Run the skill-creator eval loop on .claude/skills/wellness-app-design
using its evals/evals.json, show me the results, and improve the skill
from my feedback.
```

**Backlog triage** (during beta):

```
Here are this week's tester friction reports: <paste>. Classify each
against the U-series and B-series phases (or new), update the plans'
priority read if the evidence warrants it, and propose which prompt
from docs/IMPLEMENTATION_PROMPTS.md I should send next. Build nothing.
```
