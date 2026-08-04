# WAZN — Master Build Plan

> **Claude Code: this file is the source of truth for this project.**
> Read it in full at the start of every session, along with `DECISIONS.md`
> and the **STATUS** section at the bottom. Do not begin work until you
> know which phase is active and what its gate is.

---

## 1. What Wazn is

Wazn (Arabic: وزن, "weight") is a mobile-first strength-training PWA
being built toward functional parity with Hevy, then monetized globally
with regional pricing. Egypt is the first test market, not the only
market: US/global users pay a USD tier, Egyptian users an EGP tier. Owner: Ameen Hassan (ameen.hassan421@gmail.com is the
working test account). Claude Code builds it; Ameen reviews at phase
gates and tests in a real gym.

Core job, unchanged since day one: **log a set in under 30 seconds,
one hand, mid-workout.** Every decision is subordinate to this.

## 2. Non-negotiables

These override anything else in this file or in any prompt:

1. **The logging flow is sacred.** Nothing interrupts it: no ads, no
   modals, no sync spinners, no celebration screens mid-set.
2. **Logging is never paywalled.** Free tier = unlimited logging, forever.
3. **Ads never appear during a workout.** Only placements allowed:
   one interstitial max on the post-workout summary screen; rewarded
   video only when user-initiated. (Ads arrive in Stage 6, not before.)
4. **Design system:** dark only, near-black background, off-white text,
   single amber accent, numbers min 24px `tabular-nums`, touch targets
   min 48px, one typeface, no gradients/shadows/emoji-in-UI.
5. **CSS logical properties only** (`margin-inline-start`, `text-align:
start`, etc.), `dir="ltr"` on root. Arabic RTL lands in Stage 5 and
   must be a flip, not a rewrite.
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

## 3. The economics this is built against

Regional pricing (the Spotify/Netflix playbook): USD ~$3–4/mo globally
(at or under Hevy Pro), EGP 50–100/mo (≈ $1–2) in Egypt. Hevy cannot
add an EGP tier without arbitrage against its global base; Wazn ships
with tiers from day one. Fitness free-to-paid conversion: 2–5%. The
table below assumes worst-case all-EGP ARPU; every USD payer (Minnesota
friends, diaspora) shrinks the required user count:

| Monthly income target | Paying users (~$1.50 ARPU) | Actives needed (3% conv.) |
| --------------------- | -------------------------- | ------------------------- |
| $300                  | ~200                       | ~6,700                    |
| $1,000                | ~670                       | ~22,000                   |
| $3,000                | ~2,000                     | ~67,000                   |

Ads are a complement, not an alternative: Egypt eCPMs mean a dedicated
free user yields ~$0.02–0.05/mo. Ads monetize the never-payers and
drive Pro conversion via "remove ads." Revenue model at Stage 6:
**hybrid** — ad-supported free tier + Wazn Pro subscription (Paymob,
EGP pricing) + rewarded-video temporary unlocks.

Costs: free tiers now; ~$45/mo (Supabase Pro + Vercel) at real scale;
$25 one-time Google Play. First revenue realistically 4–5 months out.

This budget is what rules the Stage 8 options in or out. Serverless
open-weight inference is per-token and small enough to disappear into the
$45 — a set-parsing call is a few hundred tokens. A self-hosted GPU is a
few hundred dollars a month, which is not "a line item" at ~$1.50 ARPU,
it is more than the entire rest of the stack. Any assist feature that
cannot live inside a per-user monthly ceiling does not ship.

## 4. Build stages and gates

Each stage = one or more Claude Code work sessions. The **gate** must
pass before the next stage begins. Gates are evidence, not vibes.

### Stage 0 — Foundation fix (ACTIVE)

The app exists (repo `ameenahassan421/workout`, deployed on Vercel,
Supabase healthy) but is empty and misnamed. Punch list:

- **0A.** Patch `workouts_corrected.csv`: `weight_lbs × 2` where
  `exercise_title = 'Deadlift (Barbell)'` (sessions 2026-03-26 and
  2026-05-13; logged 125/135 = actual 250/270 — same half-logging
  pattern as the bench/incline/row corrections already in the file).
- **0B.** Run `scripts/import_hevy.ts` with the service-role key.
  `IMPORT_USER_ID` = profile for ameen.hassan421@gmail.com.
  Verify: exercises ~131+3, workouts ~149, workout_sets ~3198, and the
  `previous_session` + `exercise_1rm_history` RPCs return real data
  for Bench Press (Barbell).
- **0C.** Rename everything user-visible to **Wazn**: PWA manifest
  name/short_name, header wordmark, page title, README, package.json,
  SMTP sender name. Latin script only for now.
- **0D.** Exercise images: add `exercises.image_url` (nullable). Map
  Hevy names to free-exercise-db images
  (github.com/yuhonas/free-exercise-db); copy matched images to
  `/public/exercises/`, no hotlinking. Unmatched → null → muscle-group
  colored initial tile. Never a broken image; never block a flow on
  image loading.
- **0E.** Enforce the design system (§2.4) across all three screens.
- **0F.** Audit the existing build (schema, RLS, RPCs, import script,
  bundle, auth) against the roadmap below; fix what won't hold; record
  findings in `DECISIONS.md`.

**GATE 0:** Ameen signs in with an OTP at the production URL, sees a
thumbnail picker ordered by his most-used lifts, logs a bench set with
his real previous session inline, sees ~149 workouts in History and a
9-month bench chart with no July cliff, and the app says Wazn
everywhere. Then he logs one real gym session in it.

### Stage 1 — The active workout (core Hevy parity)

Routines (create/edit/duplicate; start workout from routine; sets
pre-filled from last performance; freestyle still works). Rest timer
(auto-start on set log, per-exercise default, adjustable, vibration +
sound, countdown visible inside the logging flow). Set types in UI
(normal/warmup/failure/drop, one tap to cycle; warmups stay excluded
from PRs/charts). Optional one-tap RPE. Supersets (grouped exercises,
alternating logging, shared rest timer). Edit past workouts. Finish
summary (duration, volume, sets, PRs hit) with a shareable summary
card: client-side canvas render (volume, duration, PRs, Wazn wordmark)
into the native share sheet — the only organic growth surface until
Stage 3. Plus three zero-cost utilities (pure client-side math, no
schema): plate calculator (target weight → per-side plate breakdown),
warm-up ramp suggestions (40/60/80% of working weight), and workout
duration + weekly streak counter (duration already stored; streak is
one query).

**GATE 1:** Ameen builds his 4-day upper/lower split as routines and
replaces Hevy completely for **two full weeks**, zero fallbacks. Every
moment he misses Hevy gets written down and becomes backlog.

### Stage 2 — Insight

- **2A (prerequisite — nobody else can sign in until this is done).**
  Domain + email: Ameen buys the wazn domain; add it to Vercel as the
  production alias and to Resend for domain verification (give him the
  exact DNS records). OTP sender becomes `code@<domain>`, sender name
  "Wazn". Update Supabase `site_url` and `uri_allow_list` to the new
  domain. OTP length 6, expiry 3600 unchanged. Verify by receiving a
  code at an address that is NOT the Resend account owner. Note:
  during Stages 0–1 only ameen.hassan421@gmail.com can sign in
  (onboarding@resend.dev delivers solely to the Resend owner) — this
  is fine and expected for solo testing.

- **2B (near-zero cost — data already in hand).** Exercise
  instructions: import the step-by-step instruction text from
  free-exercise-db (same dataset as the thumbnails) for every matched
  exercise; render on the exercise detail page. Notes: add nullable
  note fields for workouts and per-exercise ("seat position 4"), and
  backfill from the Hevy CSV's `exercise_notes` column that the
  original import ignored.

Then the insight features: Exercise detail page (history, records: best weight / best est-1RM /
best session volume, image, notes). PR detection computed on log,
celebrated inline (amber flash, no confetti), stored consistently.
Charts beyond 1RM: session volume over time; weekly sets per muscle
group vs a 10–20 productive band; rep-range distribution. Custom
exercises (name, muscle group, equipment; private per existing RLS).

**GATE 2:** 5–10 Minnesota friends onboarded and logging.

### Stage 3 — Friends (the growth loop)

Public-opt-in profiles; follow by username or invite link. Feed of
followed users' finished workouts (name, duration, volume, PRs) with
likes; no comments yet. Weekly leaderboard (volume + sessions) among
follows. Visibility enforced in RLS (private default / followers),
never client-side.

**GATE 3 — the retention gate, sacred:** at week 6, ≥1/3 of testers
still logging unprompted AND at least one friend-of-friend active.
**If this fails badly: stop building. Wazn stays a personal tool, and
the income effort moves to the grant-tooling idea where the moat is
real.** This is pre-decided now to prevent sunk-cost drift.

### Stage 4 — Reliability (gym reality)

Offline logging (full workout with zero signal, sync on reconnect,
conflict rule: device wins for own data). PWA polish: install prompt,
splash, icon, wake-lock during active workout.

**GATE 4:** an airplane-mode workout syncs clean on reconnect.

### Stage 5 — Egypt-ready

Full Arabic UI + RTL (the logical-properties investment pays off
here). Arabic exercise names alongside English. kg default for
Egypt-region users. Ramadan-aware streaks (a missed daytime pattern
during Ramadan doesn't break streaks; suhoor/iftar-friendly session
times treated as normal).

**GATE 5:** a native Arabic speaker completes onboarding → routine →
logged workout → progress review without hitting English.

### Stage 6 — Monetize

Wazn Pro with regional pricing: USD ~$3–4/mo globally (Stripe or
Play billing), EGP 50–100/mo in Egypt via Paymob (cards + mobile
wallets). Free =
unlimited logging + basic 1RM chart + 4 routines. Pro = unlimited
routines, advanced analytics, body measurements, no ads. Ads on free
tier per §2.3 only. Rewarded video unlocks premium analytics for 24h.
**Capacitor Android build** (not TWA — AdMob requires native slots)
wrapping the same React code; Play Store listing. Web PWA stays
ad-free by architecture.

**GATE 6:** first 10 organic (non-friend) payers, AND free-tier
retention does not drop vs the Stage 3 baseline after ads switch on.
If ads crater logging frequency, they cost more than they earn — pull
them and reassess.

### Stage 7 — Distribute (the real work)

Anchor: the named on-the-ground contact in Egypt (Ameen to specify —
gym owner/coach → gym-wedge playbook, clients onboard through them;
social crew → bottom-up playbook, feed-first). Plus: 1–2 Cairo/Alex
gym partnerships or a mid-size Egyptian fitness creator; Arabic ASO on
the Play listing.

**GATE 7:** weekly signups compounding without Ameen pushing.

### Stage 8 — Assist (CONDITIONAL — do not build unprompted)

Open-weight AI, and only where it does something arithmetic cannot.
This stage is **gated on evidence, not on interest**: nothing here gets
built unless the Gate 1 backlog — the list of moments Ameen missed Hevy
— actually asks for it. If two weeks off Hevy produce no complaint that
an assist would answer, this stage does not happen.

**Why open weights.** Licence must be genuinely permissive, not
"open-ish": Qwen (Apache-2.0) and Kimi K2 (Modified MIT — its only
condition triggers above 100M MAU or $20M/month, i.e. never for us)
qualify. Llama and Gemma ship custom licences and do not.

**Where the model runs.** A Supabase Edge Function, calling a
serverless inference provider. Never the client — the API key follows
the same rule as the service-role key in `CLAUDE.md`: server-side only,
never a `VITE_*` var. Self-hosting a GPU is out; it costs more per month
than the entire rest of the stack (§3). On-device WebGPU is out; the
market is budget Android in Egypt, and models small enough to run there
are not good enough to trust.

**Right-sizing is the whole game.** 8A is a parsing task a 3B model
does perfectly. Using a trillion-parameter model for it buys nothing and
costs latency you do not have mid-set.

#### 8A — Voice and natural-language set logging

The only assist that makes the core job _faster_ rather than adding a
thing to look at. Serves §2.1 directly: chalked hands, one thumb, 30
seconds.

Say "three sets of eight at two-twenty-five" → the browser's built-in
`SpeechRecognition` transcribes it free and on-device → the text goes to
a **small Apache-2.0 model** → structured `{weightKg, reps, sets}` lands
in the existing draft fields.

- The draft is **pre-filled, never written**. Confirmation stays one tap
  on the existing Log set button. No AI output reaches the database
  without a human press.
- Weight parses to the display unit then converts, so the kg-storage
  rule is untouched.
- If the parse fails, the model is down, or the phone is offline, the
  steppers are exactly where they were. Logging never depends on this.

**GATE 8A:** logging a set by voice beats the steppers on wall-clock for
at least half of attempts, measured over a real week. If it does not, it
is a demo, and it gets deleted.

#### 8B — Plain-language read of the numbers

Two sentences over the Progress tab: which group has sat under the band,
which lift has stalled and for how long, what to do about it.

Input is the **output of the existing RPCs** (`muscle_group_weekly_sets`,
`exercise_best_e1rm`, `session_volume_history`) — never raw sets. That
keeps the prompt tiny, the cost near zero, and the model unable to
invent a number it was not handed.

Generated **once a week and cached**, not per screen view.

**GATE 8B:** Ameen reads it and it tells him something the charts did
not already make obvious. If it just narrates the bars, cut it.

#### 8C — Coaching agent (Pro only, not before Stage 6)

Reads the whole training history and reasons about programming — notices
the bench stalled when squat volume jumped, proposes a deload, explains
why. Long-context reasoning over months of data is the one job here that
genuinely needs a large model, and where a **Kimi K2/K3-class open-weight
reasoning model** earns its cost.

Paid tier only (§Stage 6). Per-call cost is real and this is the feature
people would pay for.

**GATE 8C:** a lifter who is not Ameen follows its advice for a month
and their numbers move.

#### Hard rules for anything in this stage

1. **Never on the critical path.** Every screen works with the model
   unreachable. Assist is additive or it does not ship.
2. **No write without confirmation.** AI proposes, the user presses.
3. **The model is config, not a dependency.** Provider and model id live
   in one env var. Swapping them is a config change, never a refactor.
4. **A cost ceiling per user per month**, enforced server-side, before
   any of this reaches a second user.
5. **Deterministic first.** If statistics can answer it, statistics
   answer it. §Stage 2's analytics are not to be replaced by a model.

**GATE 8:** at least one of 8A/8B/8C passed its own gate and is still
being used a month later.

### Parked indefinitely

Comments, coaching marketplace, Apple Watch /
HealthKit, iOS App Store (revisit only if Egypt iOS demand proves
itself), AI form-checking from video, AI-generated training programmes
sold as a product, chat-with-your-data as a general interface, any
feature not listed above.

## 5. Data facts that must never be re-derived wrong

- `workouts_corrected.csv` is the canonical training history
  (2025-10-21 → 2026-07-19, ~149 workouts, 3,197 set rows).
- It already contains ×2 corrections for pre-2026-07-13 sessions of:
  Bench Press (Barbell), Incline Bench Press (Dumbbell), Bent Over
  Row (Barbell). Stage 0A adds Deadlift (Barbell).
- No other exercise gets weight-corrected. Squat, curls, lat pulldown,
  leg press etc. were logged at full weight throughout. Do not
  generalize the correction.
- Timestamps in the CSV are America/Chicago.
- History is ~75% complete (some real sessions were never logged);
  charts represent trends, not totals.
- Warmup sets and sets missing weight or reps are excluded from 1RM
  charts and PRs.

## 6. Session continuity protocol (Claude Code)

**Starting any new session:**

1. Read `WAZN_PLAN.md` (this file), `DECISIONS.md`, and `CLAUDE.md`.
2. Read the STATUS section below. The active stage and its next
   unchecked item is where work resumes.
3. Verify reality matches STATUS before building (e.g. query row
   counts, check deploy state). If they disagree, trust reality,
   fix STATUS, note it in `DECISIONS.md`.

**Ending any work session:**

1. Update STATUS below: check off completed items, set "Next action",
   date-stamp it.
2. Append significant choices/deviations to `DECISIONS.md`.
3. Commit with a message referencing the stage (e.g. `stage0: import
   - rename`), push, confirm Vercel deploy is green.
4. If a gate was reached: post the acceptance checklist results and
   STOP. Do not begin the next stage.

**`CLAUDE.md` must contain a pointer to this file and rules §2.6–2.8
verbatim, so they survive even if this file isn't read.**

## 7. STATUS

> Claude Code: keep this section current. It is the project's memory.

- **Active stage:** 1 — The active workout. **All build items complete;
  GATE 1 awaiting Ameen.** Do not start Stage 2.
- **Stage 1 punch list:**
  - [x] Routines — create/edit/duplicate/delete, start workout, "Next" hint,
        reps prescribed and weight pre-filled from last performance
  - [x] Rest timer — deadline-based, adjustable, vibration + beep, in-flow
  - [x] Set types in UI (normal/warmup/failure/drop) + optional one-tap RPE
  - [x] Supersets — grouped, alternating by who is behind, one rest per round
  - [x] Edit past workouts — weight, reps, delete, from History
  - [x] Finish summary — duration, volume, sets, PRs, canvas share card
  - [x] Plate calculator, warm-up ramp, duration + weekly streak
- **Migrations live:** 0002, 0003, 0004, 0005, 0006.
- **Migration NOT yet applied:** `0007_progress_analytics.sql` — four
  security-invoker RPCs behind the redesigned Progress tab. A sandboxed session
  has no Supabase egress, so Ameen applies it. Until then the three Progress
  sub-tabs show "needs migration 0007" instead of charts; nothing else in the
  app touches these functions. **The first version of 0007 would not parse**
  (`position` is a reserved word); fixed, and the whole chain 0001-0007 has now
  been applied and the four functions called against a local Postgres 16. See
  `DECISIONS.md` and `scripts/check_migrations.py`.
- **Tests:** 117 passing (95 at Gate 1, 49 at Gate 0).
- **Data:** exercises 134, workouts 152, workout_sets 3,201, of which 335
  now carry a superset group (backfilled from the CSV the import had been
  dropping). RPE on 387.
- **Visual redesign (2026-08-02, out of stage sequence at Ameen's request):**
  the وزن wordmark, a refined token system, all three tabs restyled, and
  Progress expanded into Strength / Volume / Balance sub-tabs. Worked from a
  supplied handoff built on a stock template; structure taken, identity not —
  see `DECISIONS.md`. No data model, auth or RLS change.
- **Usability reevaluation (2026-08-04, after Ameen found the app unusable):**
  the app never touched browser history, so the Android back gesture closed
  the installed PWA from anywhere — including mid-workout. Fixed with a
  back-stack hook (`src/lib/use-back.ts`) plus visible back chevrons on every
  sub-view; thumbnails raised to 64px in the picker and desaturated to sit in
  the app's palette; sign out moved behind a menu; two-tap Finish and Delete;
  live workout duration; tab-bar icons; auth screen brought onto the design
  system. Deployment reevaluated and unchanged — the failures were app-level,
  not hosting. Full findings in `DECISIONS.md`. Tests 117.
- **Next action:** GATE 1 — Ameen builds his 4-day upper/lower split as
  routines and replaces Hevy for two full weeks with zero fallbacks. Every
  moment he misses Hevy gets written down and becomes backlog. **Apply
  migration 0007 first** if the Progress tab is wanted during the test.
- **Open decision for Ameen:** the stray empty 7-second workout (`e2587335`)
  still shows as a blank row in History — it can now be removed in-app by
  deleting it, or say the word and it goes server-side.
- **Blocked on Ameen:** GATE 1 sign-off. Upcoming: domain purchase before
  Stage 2 (item 2A) — nobody but ameen.hassan421@gmail.com can sign in until
  then, which is expected.
- **Last updated:** 2026-08-04 by Claude Code (usability reevaluation and
  navigation fix; Stage 1 build items unchanged and still awaiting GATE 1).
