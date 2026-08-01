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

### Parked indefinitely

Comments, coaching marketplace, Apple Watch /
HealthKit, iOS App Store (revisit only if Egypt iOS demand proves
itself), any feature not listed above.

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

- **Active stage:** 1 — The active workout. Gate 0 approved by Ameen
  (2026-08-01, "carry on to next stage").
- **Gate 0 outcome:** build items all passed. Ameen signed in at production
  and logged 4 real sets (110 lb x 8 x3, 65 lb x 12) across 2 workouts,
  so sign-in, picker, and logging are proven end-to-end on a real device.
  The remaining gate line — a full gym session — is his to do whenever;
  it does not block Stage 1.
- **Timezone flag RESOLVED — the app was never wrong.** CSV
  `Jul 19, 2026, 7:01 PM` stores as `2026-07-20 00:01Z` and renders back as
  `2026-07-19 07:01 PM` in America/Chicago. Exact. The `07-14` in the Gate 0
  report was an artifact of the _reporting script_ truncating a UTC string,
  not a query or display bug. See `DECISIONS.md`.
- **Row counts (verified live):** exercises 134, workouts **152**,
  workout_sets **3,201**, profiles 2.
  - 152 = 149 imported + 3 from Ameen's testing (one empty 7-second one from
    the first sign-in, two real). 3,201 = 3,197 imported + 4 logged.
- **Open decision for Ameen:** the stray empty 7-second workout
  (`e2587335`) still shows as a blank row in History. Say the word and it goes.
- **Migrations applied live:** `0002_exercise_images.sql`,
  `0003_set_type_drop.sql`.
- **Next action:** Stage 1 build.
- **Blocked on Ameen:** nothing for Stage 1. Upcoming: domain purchase before
  Stage 2 (item 2A).
- **Last updated:** 2026-08-01 by Claude Code (Stage 1 start).
