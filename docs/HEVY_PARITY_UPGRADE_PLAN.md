# Wazn → Hevy-class: the upgrade plan

**Status: PROPOSAL — awaiting Ameen's review.** Nothing in this document
overrides `WAZN_PLAN.md`. Per §2.7 (phase gates are hard stops) and the
STATUS rule that nothing ships before the beta runs, every phase below is
sequenced _around_ the beta, and no phase starts without explicit
approval. This document is the map; the plan file stays the law.

**Sources:** the `Wazn_vs_Hevy_Comparison.docx` (2026-08-01), a full
code inventory of the app as built on 2026-08-07 (every screen,
component, and lib module read; claims cite `file:line`), `WAZN_PLAN.md`

- `DECISIONS.md`, and the `wellness-app-design` skill created alongside
  this plan (`.claude/skills/wellness-app-design/`) — which encodes the
  Hevy-class design grammar this analysis is run against.

---

## 1. Where Wazn already stands

The Aug 1 comparison doc is out of date in Wazn's favor. Since it was
written, Stages 0–3 and the Launch Bundle shipped: routines, rest timer,
set types + RPE, supersets, PR detection, finish summary + share card,
custom exercises, exercise instructions, the AI Coach, and the full
social layer (feed, likes, weekly leaderboard, invite links) are all
live. Of the doc's "S1/S2/S3" column, essentially everything is ✓.

**Already at or beyond Hevy on the core loop:**

- 1-tap repeat sets: drafts seed from this workout's last set, falling
  back to last session (`SetEntry.tsx:102-109`), and values persist
  after logging.
- Deadline-based rest timer that is _correct after screen lock_
  (`use-rest-timer.ts:44-54`), auto-starts on committed working sets
  only, adjustable ±15s, never a modal.
- Superset semantics better than Hevy's default: auto-alternation to the
  member with fewest sets, one rest per _round_, not per set
  (`supersets.ts:52-86`).
- Mid-set unit flip converts the typed draft instead of relabelling it
  (`SetEntry.tsx:110-120`).
- Plate calculator + warm-up ramp inline under the reps field, answer
  visible while collapsed (`LoadHelper.tsx:44`).
- PR flags computed in the database on INSERT, self-healing after
  history edits (`HistoryScreen.tsx:114-140`).
- Recency-weighted exercise picker ordering (`ExercisePicker.tsx:11-30`)
  — better than Hevy's alphabetical default.
- The muscle-balance chart with the 10–20 productive band, the
  SQL-anchored Coach notes, the hand-drawn share card, and a 537 KiB
  precache with zero chart-library weight.

These are differentiators. **Protect list: no phase below may regress
any of them.** Parity never means adopting Hevy's visual skin — Wazn's
design system v2 is a strength, not a gap.

---

## 2. Gap analysis

Gaps are split into **operation** (flows/features) and **look**
(visual/interaction feel), and classified **P** (parity-required — a
Hevy user reaches for it and finds nothing), **D** (differentiator
opportunity), or **N** (deliberate non-goal — documented, do not build).

### 2.1 The structural gap: the active-workout model

Everything else is additive; this one is architectural.

Hevy's active workout is a **whole-workout table**: every exercise
visible, planned set rows pre-filled from last time, a checkmark per
row, done rows visibly distinct from pending ones. Wazn is
**sequential**: one exercise per screen, a "Log set N" button that
_creates_ a row, and only a dashed "Next" hint card standing in for the
rest of the plan (`LogScreen.tsx:530-535`, `795-822`).

The cause is a principled data rule — sets are never pre-inserted; _a
set row means it happened_ (`LogScreen.tsx:270-275`). That rule is
correct and stays. But it has been allowed to dictate the UI. The costs
a lifter feels:

- No at-a-glance view of the whole session (what's done, what's left).
- No per-row "previous" ghost — last session arrives as one summary
  blob (`SetEntry.tsx:214-237`), not aligned set-by-set against today.
- Can't tick off a set that happened while the phone was pocketed.
- No reordering mid-workout; exercise order is first-log order
  (`LogScreen.tsx:537-548`).
- Routine adherence is invisible (skipped exercises never surface).

The fix (Phase U2) is a **workout overview mode** that renders _planned_
rows client-side (from the routine + previous session) and converts a
row into a real DB insert on commit — Hevy's ergonomics on top of Wazn's
data honesty. The focused one-exercise view survives as the zoomed-in
state; the overview becomes the spine.

### 2.2 Operation gaps (P = parity-required)

| #   | Gap                                                                                                                                                            | Evidence                                                                                                 | Class                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| O1  | No offline logging; a set logged in a dead zone is lost with an error banner                                                                                   | `vite.config.ts:44-50` (`runtimeCaching: []`), bare awaited inserts (`LogScreen.tsx:495-498`)            | **P — highest severity.** Already GATE 4; Egyptian mobile data is the stated baseline |
| O2  | No discard/delete for an in-progress workout — finish is the only exit; mis-taps leave permanent zero-set rows (four exist today)                              | no `.delete()` on `workouts` anywhere in `src/`                                                          | P                                                                                     |
| O3  | Past-workout editing is weight+reps only; no add-set, add-exercise, rename, date fix, delete, or duplicate                                                     | `EditSetDialog.tsx:8-15`                                                                                 | P                                                                                     |
| O4  | No calendar/heatmap view of history                                                                                                                            | `trainingCalendar()`/`heatStep()` written **and tested** but imported by nothing (`progress.ts:147-183`) | P — cheapest big win in the repo                                                      |
| O5  | No per-exercise progress chart (no 1RM line, no volume line) — the screen Hevy users open most after logging                                                   | `ExerciseDetail.tsx` shows tiles + text list only                                                        | P                                                                                     |
| O6  | No time-range controls on any chart; every window hardcoded (12wk volume, 7-day balance, top-12 strength)                                                      | `ProgressScreen.tsx:99`, `:68`, `:425`                                                                   | P                                                                                     |
| O7  | Picker has search only — no muscle/equipment filter chips, no favourites                                                                                       | `ExercisePicker.tsx:53-63`                                                                               | P                                                                                     |
| O8  | No records surface: no all-time PR list, no rep-max ladder (1/3/5/10RM), no PR history                                                                         | records exist only as 3 tiles per exercise                                                               | P                                                                                     |
| O9  | No workout-level notes or rename; exercise notes exist but are buried in Progress → Strength → detail, unreachable from the log                                | `ExerciseDetail.tsx:51-58`; `routine_exercises.notes` in schema but never read/written by RoutineEditor  | P                                                                                     |
| O10 | No rest-duration UI: `exercises.default_rest_seconds` is read but nothing writes it — everyone gets 120s forever                                               | `LogScreen.tsx:509`; column from 0004                                                                    | P                                                                                     |
| O11 | No un-superset; grouping is permanent                                                                                                                          | no `superset_group: null` update in `src/`                                                               | P (small)                                                                             |
| O12 | Custom exercises can't be edited or deleted after creation                                                                                                     | `NewExercise.tsx` create-only                                                                            | P (small)                                                                             |
| O13 | Warm-up ramp is display-only — read the numbers, type them yourself                                                                                            | `LoadHelper.tsx:83-107`                                                                                  | P (small); D if one-tap-logs the ramp                                                 |
| O14 | No duration/distance input ever: `duration_seconds`/`distance_meters` are rendered in History but no UI can produce them — cardio is import-only               | `HistoryScreen.tsx:469-470`                                                                              | P (deferred-able)                                                                     |
| O15 | No routine folders/reordering UI; `routines.position` sorted on but never written                                                                              | `routines.ts:20`, 0004:42                                                                                | P (small)                                                                             |
| O16 | Social has no people: no profile pages, no avatars beyond InitialTile, no follower list, no tap-through from feed/leaderboard, follow requires exact @username | `FriendsScreen.tsx`, `social.ts:157-178`                                                                 | P (post-retention-gate)                                                               |
| O17 | Feed cards are aggregate-only; can't open a friend's workout                                                                                                   | `FriendsScreen.tsx:247-314`                                                                              | P (post-retention-gate)                                                               |
| O18 | Rest-timer completion can't reach a locked phone (vibration only, no notification) — the #1 PWA-vs-native gap                                                  | `use-rest-timer.ts:29-43`; plan defers to Stage 4B                                                       | P (native-gated)                                                                      |
| O19 | Exercise library depth: 134 exercises, static desaturated JPGs, text instructions vs Hevy's 400+ with video                                                    | catalog + free-exercise-db import                                                                        | P (partial: grow catalog; video stays N)                                              |
| O20 | Warmup set-type is sticky after logging — do 3 warmups, forget to switch back, working set logged as warmup (excluded from PRs)                                | `SetEntry.tsx:171`                                                                                       | P (bug-class)                                                                         |

### 2.3 Look gaps

The visual system itself is not a gap — v2 is more coherent than Hevy's
skin. The look gaps are _information-display_ gaps.

> **Amended 2026-08-07 after an actual visual pass.** Everything in §2
> above was derived from reading source. That was not enough: a
> screenshot run (real build, stubbed Supabase, Playwright, five tabs ×
> two widths × populated/empty) found things the code read as correct.
> The correction that matters most is in §1's protect-list — the
> muscle-balance chart with the knurl band was listed there as a
> working differentiator, and it had **never rendered**
> (`inset-block-0` was not a real utility; fixed in U1a). L6 and L7
> below come from the same pass. **Do not treat a code-only review as
> visual verification again** — see §4.

- **L1. Previous-vs-today alignment.** Hevy ghosts last session per row;
  Wazn shows one summary card. Fixed by U2's overview grid.
- **L6. No number in the app is grouped.** Volume renders `52393`,
  `90830.5`, `15873.5` — verified structural, not incidental: there is
  **no `toLocaleString` or `Intl.NumberFormat` anywhere in `src/`**.
  Precision is inconsistent in the same column (`48722` beside
  `90830.5`). §2.4 mandates large tabular numbers; grouping is the
  missing half, and at arm's length `90,831` reads where `90830.5`
  does not. One formatter used everywhere (History rows, Progress
  figures, feed cards, leaderboard, finish summary, share card) —
  cheap, and it touches every screen a Hevy user compares.
- **L7. One leaf crash blanks a whole tab.** There is no error boundary
  anywhere in `src/`, and `ExerciseThumb.toneFor()` reads
  `group.length` on a value that arrives through an `as Exercise`
  cast. Found by accident: a single missing field made the entire
  Progress tab render black — no message, no recovery. A boundary per
  lazy screen (fall back to a plain "This screen failed to draw" plus
  the tab bar) turns a dead tab into a recoverable one, and guarding
  `toneFor` costs one line.

- **L1. Previous-vs-today alignment.** Hevy ghosts last session per row;
  Wazn shows one summary card. Fixed by U2's overview grid.
- **L2. Whole-session visibility** (same root as L1/§2.1).
- **L3. Duration granularity**: elapsed shows "42 min" on a 30s tick
  (`format.ts:46-55`), never a live ticking clock. Decide deliberately:
  a ticking mm:ss in the status row (Hevy grammar) vs the calm
  minute-level read (Wazn voice). Recommend: minutes stays, but tick
  every 10s near the row so it never reads stale.
- **L4. Feed/leaderboard identity** is a letter tile only — fine for
  now, but profile pages (O16) will need at least a chosen-color/emblem
  system; photos optional and later (storage + moderation cost).
- **L5. Empty-chart and skeleton states** are already excellent
  (target band draws even when empty, `ProgressScreen.tsx:259-266`) —
  extend the same standard to the new U1 charts.

### 2.4 Deliberate non-goals (N) — reaffirmed, do not build

Rest-timer sound (silent by design, `use-rest-timer.ts:39-43`); feed
comments; achievements/badges/XP; AI chat surface
(`CoachScreen.tsx:17-22`); a settings screen; exercise video hosting;
Apple Watch/HealthKit (parked until after stores); guilt notifications
of any kind. These are scope guards from `WAZN_PLAN.md` and
`CLAUDE.md`, and the wellness-app-design skill's anti-patterns list
backs every one of them.

---

## 3. The upgrade phases

Sequencing logic (from the skill): **reliability before scale, core
loop before insight, insight before social amplification, native last.**
Phases slot into the existing stage structure — they do not replace it.
The beta comes first; U1 is built _from beta feedback week 1_, U3 is the
already-planned Stage 4 fast-follow, U5 only activates if GATE 3
retention data says the social loop deserves investment.

Every phase ends with the standard CI wall (`lint`, `format:check`,
`typecheck`, `check:vercel`, `test`, `build`) plus its own gate. All UI
work uses the `impeccable` + `wellness-app-design` skills and design v2
tokens; anything touching `supabase/migrations/` loads
`supabase-postgres-best-practices` and runs `check_migrations.py`, and
the PR must state migrations are parse-checked but unexecuted until
applied.

### U1 — Free wins (1–2 sessions, zero core-loop risk)

_Ship while the beta cohort is live; nothing here touches set entry._

1. **Render the dead code**: calendar heatmap in History
   (`trainingCalendar`/`heatStep`), sessions-per-week and lift-balance
   blocks in Progress (`liftBalance`, `sessionsPerWeek`,
   `monthlyVolume`) — all written, tested, unrendered (O4).
2. Time-range chips (3M/6M/1Y/All) on volume + strength blocks (O6) —
   parameterize the existing RPC calls, one shared chip row
   component.
3. Picker filter chips: muscle group + equipment, from the two fields
   every exercise already has (O7).
4. Discard-workout (zero-set auto-discard on leave + explicit "Discard
   workout" in the armed-finish row) (O2), un-superset (O11), warmup
   stickiness fix (O20).
5. Workout rename + workout note: one nullable `workouts.note` column
   (migration 0014), editable from the finish summary and History
   expansion (O9, first half).
6. Rest-duration stepper on the exercise detail card + a "per-exercise
   rest" write path for `default_rest_seconds` (O10).
7. One-tap "log this ramp step" on the warm-up ramp rows (O13).

**Tools:** none new. **GATE U1:** Ameen sees his 9 months as a heatmap;
filters find "cable, rear delts" in two taps; a mis-started workout can
be abandoned; a real gym session sets per-exercise rest once and it
sticks. No logging-speed regression (LAUNCH.md timing check re-run).

### U2 — The workout overview (2–4 sessions, the structural one)

The §2.1 fix. Build the whole-workout view: every exercise block
visible, **planned rows** (from routine targets ∪ previous session)
rendered as ghost rows with pre-filled values, commit-on-check turning a
ghost into a real INSERT — preserving "a set row means it happened" at
the data layer while giving Hevy's table ergonomics at the glass.
Includes: per-row previous ghost (L1), tap-into-focused-view (today's
screen survives as the zoom state), drag-to-reorder exercise blocks
(pointer-events, hand-rolled first; `@dnd-kit/core` only if the
hand-rolled version fights scroll), skipped-exercise visibility,
exercise notes surfaced on the block (O9 second half), routine
"update template with today's changes?" prompt at finish.

This phase MUST be prototyped against the design system before build
(the v2 handoff has no overview screen — it needs a design addendum
like v2.1's). Touch targets: ghost-row commit ≥56px.

**Tools:** possibly `@dnd-kit/core` (~10 KiB); design addendum doc.
**GATE U2:** Ameen logs a full upper/lower session in overview mode in
a real gym; repeat-set commit is ≤ today's tap count (1 tap); a
pocketed-phone set can be back-filled in ≤3 taps; supersets and the
protect-list behaviors all survive. Beta testers' first-workout
completion rate doesn't drop.

### U3 — Offline & trust (2–3 sessions; this _is_ Stage 4's fast-follow)

The trust ladder from the skill, in order: (1) in-progress workout
checkpoint to localStorage/IndexedDB, restored on reopen — covers
crash/refresh today, offline tomorrow; (2) optimistic set commit — UI
confirms instantly, insert queued; (3) IndexedDB write queue draining
on `online`/`visibilitychange` (Background Sync API is unreliable on
iOS — don't depend on it); (4) read-cache last-known previous-session
/ history via Workbox `runtimeCaching` NetworkFirst; (5) conflict rule
stays "device wins for own data".

**Tools:** `idb` (or raw IndexedDB), Workbox config already available
via `vite-plugin-pwa`; Playwright for an airplane-mode e2e
(`context.setOffline(true)`) added to CI. **GATE U3 = GATE 4
verbatim:** a full airplane-mode workout syncs clean on reconnect.
Plus: kill the tab mid-workout, reopen, nothing lost.

### U4 — Insight depth (2–3 sessions)

1. Per-exercise charts in `ExerciseDetail`: e1RM line + session-volume
   line, hand-rolled SVG in the v2 chart grammar (the volume-trend
   component generalizes) (O5).
2. Records: rep-max ladder (best 1/3/5/8/10RM from existing set data)
   on exercise detail + an all-time PR list block in Progress (O8).
3. Full past-workout editing: add set, add exercise, change set
   type/RPE in `EditSetDialog`, rename, delete workout (server-side
   cascade + records refresh already proven), duplicate-as-routine
   (O3). Reuse the U2 editor grammar — one editor, two persistence
   modes (live vs historical).
4. Custom exercise edit/delete (O12) with merge-guard (sets keep
   their exercise on delete → archive flag instead of hard delete).
5. Rep-range distribution chart (data already in sets; new pure fn +
   tests first, same pattern as `progress.ts`).

**Tools:** none new. **GATE U4:** Ameen answers "is my bench actually
progressing?" from one screen in <5 seconds; a mis-logged March workout
is fully corrected in-app; records survive the correction (re-run the
`refreshRecords` path).

### U5 — Social depth (conditional on GATE 3 retention data)

Only if the retention gate passes and feed engagement justifies it:
profile pages (stats, heatmap, PR highlights — visibility-gated by the
existing `private.can_view` predicate), follower lists, tap-through
from feed/leaderboard, feed workout detail (per-exercise summary, not
per-set), leaderboard period/metric options (O16, O17). Avatars: start
with chosen accent-tile emblems, not photo upload (storage +
moderation cost deferred).

**Tools:** none new; RLS test suite extended per surface. **GATE U5:**
a tester finds and follows a friend-of-friend without an invite link;
RLS suite green with ≥4 new assertions; private stays private under
adversarial tests.

### U6 — Native capability (this _is_ Stage 4B, unchanged)

Capacitor wrap (both platforms), and with it the parity items a PWA
cannot deliver: **rest-timer local notification with the screen off**
(O18 — the single most-cited Hevy retention feature), install
surface, store listings. Later riders per plan: AdMob (Stage 6), push,
health sync (still parked). Duration/distance inputs (O14) and catalog
growth toward 250+ exercises via another free-exercise-db pass (O19)
can ride any phase after U2 as filler work.

**Tools:** `@capacitor/core`, `@capacitor/local-notifications`,
`@capacitor/haptics`; Xcode on Ameen's Mac; Play/App Store accounts
(already planned). **GATE U6 = GATE 4B verbatim**, plus: a rest timer
fires a notification on a locked real phone from the store build.

---

## 4. Cross-cutting requirements (every phase)

- **RTL discipline holds**: logical properties only — every new
  component is a Stage 5 flip, not a rewrite. New charts must mirror
  correctly (`dir`-aware axes).
- **A11y bar from the skill**: 48px targets (56px+ on hot path), AA
  contrast on inputs, `prefers-reduced-motion` respected, set types
  never color-only (letters stay), screen-reader labels on icon
  buttons.
- **Bundle discipline**: Progress/Coach/Friends stay lazy; no chart
  library returns; precache stays under ~600 KiB; any new dependency
  needs a DECISIONS.md entry with the size cost.
- **Data honesty**: no pre-inserted sets, kg-always storage, warmups
  excluded from records, stats computed in SQL — none of these bend
  for parity.
- **Testing floor**: pure functions extracted and unit-tested before
  UI (the `progress.ts` pattern); RLS-touching work extends the SQL
  suite; U3 adds the Playwright offline e2e to CI.
- **Visual verification is not optional, and CI cannot do it.** Two
  defects reached production that every check passed over: a class
  that did not exist (`inset-block-0`, so the signature chart drew
  nothing) and a duplicated empty-state sentence. Lint sees valid
  syntax, typecheck sees valid types, tests see functions — none of
  them can see a screen. **Any phase that changes UI ends by
  screenshotting the built app** (real build, stubbed Supabase,
  Playwright; five tabs × 390/430px × populated/empty) and looking at
  the images before the gate is reported. Two rules learned the hard
  way from the first run: use viewport shots, not `fullPage`, to judge
  overlap — `fullPage` renders fixed elements mid-page and invents
  bugs that are not there; and stub every column the real RPC returns
  (`strength_summary` yields `muscle_group` and `image_url`), or the
  harness crashes on its own fixture and looks like an app bug.
- **Metrics that referee the gates**: time-to-log-a-repeat-set
  (stopwatch, LAUNCH.md), first-workout completion rate for new
  testers, week-over-week logging retention (SQL over `workouts`),
  and after U3, sync-failure rate.

## 5. Priority read

If only three things get built, they are **U3 (offline)** — the
highest-severity gap against the market's environment and already the
plan's own next milestone; **U1 (free wins)** — the cheapest
credibility jump, mostly rendering code that already passes tests; and
**U2 (overview)** — the one structural difference between "credible"
and "feels like the real thing". Everything after that is compounding,
not catching up.
