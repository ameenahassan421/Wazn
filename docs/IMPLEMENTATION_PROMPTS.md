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

```
Build phase U2 from the v2.2 addendum in docs/design/ and
docs/HEVY_PARITY_UPGRADE_PLAN.md §3-U2. Load wellness-app-design and
impeccable first.

Hard constraints: no pre-inserted sets ever — ghosts are client state
until committed; the 1-tap repeat set must cost exactly the same or
fewer taps than today; the protect-list in the parity plan §1 (superset
round-rest, deadline timer, unit-flip conversion, PR-on-insert) must
survive unchanged, proven by the existing tests plus new ones. Try
hand-rolled pointer-event reordering before adding @dnd-kit/core; if
you add the dependency, log size and reasoning in DECISIONS.md. Include
the routine "update template with today's changes?" prompt at finish.

CI wall, push, report against GATE U2 (Ameen's real-gym pass is the
final item and is his), stop.
```

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
