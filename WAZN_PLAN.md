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
4. **Design system: v2 "Loaded Ink, refined" (handoff bundle, being
   implemented as of 2026-08-04).** Dark only — ink `#0C0B0A`, chalk
   `#ECEBE8`, single amber `#F0B429` with a 9-step ramp; warm neutrals,
   never blue-grey. IBM Plex family (Sans for UI, Mono for kickers,
   Sans Arabic for RTL) — one family, three voices. Numbers min 24px
   `tabular-nums` (one recorded exception: 20px multi-set summary).
   Touch targets min 48px, hot-path controls 58–66px. Hero button
   tier: ONE solid amber button per screen, max. Knurl cross-hatch
   texture in thin bands and the PR badge only, never as a fill.
   Elevation = 1px hairline ring + 1px inset top light — no drop
   shadows. Exactly ONE gradient exists in the app: the header band.
   Errors are amber and outlined, never red. Motion: two easings only
   (ease-out, linear); press = 80ms dim+settle; PR = amber flash to
   persistent 7% tint; reduced-motion collapses durations. No emoji
   in UI. Full tokens and screens: design handoff
   `Wazn_design_system_v2` / DECISIONS.md. **Addendum v2.1 (2026-08-04):** four
   missing screens designed against the same system — Coach tab (AI:
   notes + routine builder, no chat), Progress dashboard (this-week,
   muscle-balance chart with knurl target band, volume trend, strength
   list), Friends (leaderboard + feed + likes), Finish summary + 4:5
   share card. Tab bar grows to FIVE items: Log · History · Progress ·
   Coach · Friends. Handoff bundle: `docs/design/v2.1-missing-screens.md`
   (+ `.html`), committed to the repo so it cannot go missing again.
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

**Current launch strategy (decided 2026-08-04): the Launch Bundle.**
Solo phase-gating is replaced by group beta testing. The app ships to
the first cohort (Ameen + friends) only when the full single- and
multi-player experience is built: 2A (any address can sign in),
migrations applied, 2B, 2C (AI layer — REQUIRED for launch), all of
Stage 3, and Stage 4's wake-lock. Offline sync is a fast-follow after
beta starts, not a launch item. Gates 1–3 acceptance collapse into one
beta-cohort test; every tester's friction reports form the combined
backlog. Testers are framed explicitly as co-testers ("you're beta
testers, things will break, tell me everything").

Multi-user is by construction, not a feature to add: each tester signs
in with their own email via OTP at trywazn.app, gets their own
profile, and their workouts/routines/notes persist in Postgres under
row-level security scoped to their account. Verified by RLS tests
(second-user reads return nothing; cross-user writes are refused).
App-store publishing happens AFTER beta testing — see Stage 4B.

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
(auto-start on set log, per-exercise default, adjustable ±15s,
countdown visible in-flow, survives navigation; done state = amber
ring + "Rest done" — SILENT, no sound/modal per design v2, optional
haptic only). Set types in UI
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
  Domain + email. Domain is purchased: **trywazn.app** (Porkbun,
  2026-08-04, WHOIS privacy + auto-renew on). Add it to Vercel as the
  production alias and to Resend for domain verification (give Ameen
  the exact DNS records to add at Porkbun). OTP sender becomes
  `code@trywazn.app`, sender name "Wazn". Update Supabase `site_url` and `uri_allow_list` to the new
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
  original import ignored. **See §5 — that column turned out to be
  effectively empty, and the backfill is a no-op.**

- **2C — AI layer (Kimi via OpenRouter).** Two features, one rule:
  deterministic SQL computes all numbers; the model only writes words
  and generates structures. (a) Coach's Notes on Progress: a Supabase
  Edge Function aggregates the user's stats (weekly sets per muscle
  group vs the 10–20 band, trend deltas, PRs, plateaus) into a compact
  summary and asks the model for 3–5 prioritized insights; cache the
  result and regenerate only when new workouts land. (b) Routine
  generator: goal + days/week + equipment in, structured JSON routine
  out, validated against the exercises table, saved as a normal
  editable routine, never auto-activated. Implementation: model
  `moonshotai/kimi-k2.5` on OpenRouter (≈$0.375/M in, $2.025/M out —
  roughly $0.002 per analysis), key stored as a Supabase secret, called
  only from the Edge Function, never the client; model id lives in an
  env var so swapping models is config, not code. Multi-user by construction: the Edge Function derives
  identity from the caller's JWT (never a user_id parameter) and all
  stat queries run under RLS. Prompts carry numbers and exercise names
  only — no email, name, or user id ever reaches the model API.
  Free-tier quotas from day one (analysis regenerates at most weekly
  per user; ~3 routine generations/month), unmetered on Pro,
  rewarded-video unlock as the third path at Stage 6. Output language
  follows the app locale (Arabic at Stage 5). Built to scale from day one: static system prompt + small
  per-user stat block (maximizes provider prompt-cache discounts);
  lazy generation only (regenerate on Progress open after new
  workouts — never scheduled batch for all users); per-feature model
  env vars (cheapest capable model for routine gen, better model for
  Coach's Notes); free `:free` variant during testing with automatic
  429 fallback to paid; hard monthly spend cap + alert on the
  OpenRouter account ($20 during testing, raised deliberately).
  Deferred with triggers: request queueing only if sustained provider
  rate-limit hits (~10k+ actives); self-hosting the open weights is
  the exit option, not the plan — revisit only when the API bill
  rivals an inference cluster. Show "AI-generated —
  not medical advice" on both surfaces. Note for
  Stage 6: AI Coach is the flagship Pro feature (real marginal cost,
  real willingness to pay).

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

Wake-lock during active workout, install prompt, splash, icon ship in
the Launch Bundle. Offline logging (full workout with zero signal,
sync on reconnect, conflict rule: device wins for own data) is the
fast-follow built WHILE the beta cohort is live — it is the
highest-risk feature (sync bugs eat data) and tests best against real
gym dead zones reported by testers.

**GATE 4:** an airplane-mode workout syncs clean on reconnect.

### Stage 4B — App Store + Google Play publishing (after beta testing)

The PWA at trywazn.app stays canonical; stores add discoverability
and native capabilities. Wrap the same React codebase with Capacitor
(NOT TWA — AdMob at Stage 6 needs native slots) for BOTH platforms:

- **Google Play:** $25 one-time developer account. Internal testing
  track first (beta cohort installs from it), then production.
- **Apple App Store:** $99/year developer account; build/sign in
  Xcode on Ameen's Mac; TestFlight for the cohort, then App Review.
  Expect review friction; the PWA is the fallback that keeps users
  unblocked regardless.
- **Store prerequisites both platforms:** a public privacy policy URL
  (hosted at trywazn.app/privacy — must cover Supabase storage,
  Resend email, and AI processing via OpenRouter), store listing
  assets (icon, screenshots, descriptions — Arabic + English at
  Stage 5), data-safety / privacy-nutrition forms.
- Native-only additions ride these builds later: AdMob (Stage 6),
  push notifications, health integrations if ever un-parked.

**GATE 4B:** beta cohort retention looks healthy AND LAUNCH.md checks
pass on a store-installed build on both a real Android device and an
iPhone.

### Stage 5 — Egypt-ready

Full Arabic UI + RTL (the logical-properties investment pays off
here). Head start: design v2 ships a complete RTL screen build with
draft Arabic copy and IBM Plex Sans Arabic rules (Latin digits for
weights, Arabic-Indic allowed in prose) — the draft copy REQUIRES
native-speaker review, which is already part of GATE 5. Arabic exercise names alongside English. kg default for
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

Comments, coaching marketplace, Apple Watch / HealthKit (revisit
after stores are live), any feature not listed above. (iOS App Store
is no longer parked — it is Stage 4B.)

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
- **The CSV's `exercise_notes` column is effectively empty.** 4 rows of
  3,197 carry a value, and two of the four are junk: "Barbeel" (a typo)
  and "Warmup" (a set type the schema already models). Stage 2B's
  "backfill notes from the CSV" is a no-op — verified 2026-08-04. The
  note _fields_ are still worth building, for notes written from here
  on. Do not build an importer for this column.

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

- **Strategy:** Launch Bundle (§4 header). Group beta replaces solo gating; 2C
  is launch-required; store publishing (4B) follows beta.
- **The Launch Bundle is BUILT.** Every block is complete. What stands between
  here and invites is one secret and one testing pass — see the two items in
  bold below.
- **Stages 0, 1, 2A, 2B:** complete. 2A verified 2026-08-04 against the live
  auth config; a code was delivered to a non-Resend-owner address, so any
  address can sign in. Do not touch SMTP, DNS or URL config again unless
  something breaks.
- **2C — AI layer:** built and deployed. `coach-notes` and `generate-routine`
  are ACTIVE with `verify_jwt`; both boot and reject a non-user token.
- **Stage 3 — social:** complete. Opt-in profiles, follow by username and
  invite link, feed with likes, weekly leaderboard. Visibility enforced in
  RLS through one predicate, `private.can_view`; proved by
  `supabase/tests/rls_social.sql` (8 assertions, all passing).
- **Stage 4 launch items:** wake-lock, install prompt, zero-data empty states,
  invite onboarding — all done. **Offline sync is NOT built** and stays a
  fast-follow.
- **Migrations live in production: 0001–0011.** All applied and verified by
  execution, not by parse.
- **2C is LIVE.** `OPENROUTER_API_KEY` set 2026-08-04; Coach's Notes verified
  against Ameen's real nine-month history, every figure traceable to
  `coach_stats()`. The plan's `moonshotai/kimi-k2.5:free` **does not exist** —
  no moonshot model has a `:free` variant — so the free slug is
  `nvidia/nemotron-3-super-120b-a12b:free`, chosen by testing four candidates
  against the real schema. See DECISIONS.md.
- **BLOCKED ON AMEEN — 1: buy ~$5 of OpenRouter credit.** The account has
  never purchased any, so the paid model returns 402 and the free model is
  carrying everything. It works, but a free-tier rate limit is currently a
  user-visible failure rather than a slower answer — the fallback the design
  depends on has nothing to fall back to.
  <https://openrouter.ai/settings/credits>
- **Rotate the OpenRouter key** once beta is settled: it was shared in a chat
  session, so treat it as compromised by construction.
- **BLOCKED ON AMEEN — 2: run `LAUNCH.md`** with a second account on a real
  phone before any invite goes out.
- **Quality bar: PASSED 2026-08-04**, before any other user could see theirs.
- **Egress from this environment:** `api.supabase.com`, `api.resend.com`,
  GitHub, npm. NOT the Vercel app, `trywazn.app`, or `openrouter.ai`.
- **Data, live:** exercises 134, workouts 154, workout_sets 3,201 (335
  supersetted, **491 records**), profiles 2, routines 0.
- **Tests:** 152 passing, plus the SQL RLS suite.
- **Open decision for Ameen:** four zero-set workouts from desktop testing
  still render as blank History rows. Say "delete all my workouts with zero
  sets" and they go server-side.
- **Next action:** the two blocked items above. After beta starts: offline
  sync (Stage 4 fast-follow), then Stage 4B store publishing.
- **Design v2.1 — DONE (2026-08-05).** All four missing screens built against
  the v2 tokens: Coach tab, Progress dashboard, Friends, Finish + 4:5 share
  card. Tab bar is five items. Bundle committed at `docs/design/`. Six
  deviations logged in DECISIONS.md, including one that reverses an earlier
  call of mine (the like icon). Side effect worth knowing: drawing the volume
  trend to the v2 chart grammar removed the last recharts import, so the
  dependency is gone and **precache fell 914 KiB -> 537 KiB**.
- **LAUNCH.md is now out of date in one place** — it describes four tabs and
  the old Progress sub-tabs. Re-read it before the second-account pass.
- **Last updated:** 2026-08-05 by Claude Code (design v2.1 complete).
