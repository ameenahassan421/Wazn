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
  invite onboarding — all done. **Offline sync is built (U3b, 2026-08-08)** —
  see the U3b entries near the bottom of this section.
- **Migrations live in production: 0001–0011.** All applied and verified by
  execution, not by parse.
- **2C is LIVE.** `OPENROUTER_API_KEY` set 2026-08-04; Coach's Notes verified
  against Ameen's real nine-month history, every figure traceable to
  `coach_stats()`. The plan's `moonshotai/kimi-k2.5:free` **does not exist** —
  no moonshot model has a `:free` variant — so the free slug is
  `nvidia/nemotron-3-super-120b-a12b:free`, chosen by testing four candidates
  against the real schema. See DECISIONS.md.
- **~~BLOCKED ON AMEEN — 1: buy ~$5 of OpenRouter credit.~~ DONE 2026-08-05**
  ($5.00, 9:21 AM). The paid fallback now has something to fall back to. Note
  that free is still tried first by design, so Kimi is only reached when the
  free model fails — and **`moonshotai/kimi-k2.5` has still never returned a
  successful response through this codebase.** No key limit is set on the
  OpenRouter key yet; §2C asks for a hard cap.
- **~~WRONG ACCOUNT IN PRODUCTION.~~ RESOLVED 2026-08-05 by merge.** All 156
  workouts and 3,201 sets now belong to `6da348ed`
  (`ameenahassan421@gmail.com`, **no dot**) — the address Ameen actually signs
  in with. Verified under his own JWT with RLS in the path: `total_sets_90d`
  went 0 → 560. The dotted account `3551b340` still exists and is now empty; it
  was not deleted because that is an auth change (§2.8). See DECISIONS.md.
  **Gmail dot-normalisation at sign-in is still unbuilt**, and it is the reason
  this happened — one Gmail inbox can still create two Wazn accounts.
- **~~TESTERS HAVE ARRIVED, and one could not get in.~~ ANSWERED 2026-08-08, and
  the answer was not deliverability.** `hafsaabdi2013@yahoo.com` requested a
  code at 02:28:45 UTC on 2026-08-05 and **never verified**; 88 seconds later
  `hafsaa.abdii12@gmail.com` requested one and signed in within 32 seconds.
  This file called that a Yahoo deliverability failure for three days. Resend's
  logs say otherwise: the API accepted the send at 02:28:47 (HTTP 200) and the
  email is marked **`delivered`** to Yahoo. Every message in Resend's history
  is `delivered` — no bounce, no complaint, no deferral, ever.
  **So nothing was undelivered and the theory is dead.** What `delivered` does
  not prove is placement: Yahoo's server accepted it, and whether it reached an
  inbox or a junk folder is not knowable from here. Still open, and unknowable
  without asking her: junk placement, or she saw it and did not finish, or the
  code aged past its hour. The Gmail tester has logged zero workouts since.
- **Rotate the OpenRouter key** once beta is settled: it was shared in a chat
  session, so treat it as compromised by construction.
- **BLOCKED ON AMEEN — 2: run `LAUNCH.md`** with a second account on a real
  phone before any invite goes out.
- **Quality bar: PASSED 2026-08-04**, before any other user could see theirs.
- **Egress from this environment:** `api.supabase.com`, `api.resend.com`,
  GitHub, npm. NOT the Vercel app, `trywazn.app`, or `openrouter.ai`.
- **Data, live:** exercises 134, workouts 154, workout_sets 3,201 (335
  supersetted, **491 records**), profiles 2, routines 0.
- **Tests:** 164 passing, plus the SQL RLS suite. CI is green on every run in
  the repo's history — the failures Ameen is seeing are runtime, not build.
- **Migrations: 0001–0013 are ALL live**, confirmed 2026-08-05 by probing for
  objects — `strength_summary` exists (0012) and `social_feed` returns
  `best_record_name` / `best_record_e1rm_kg` (0013). There is still no
  `schema_migrations` ledger, so this remains a probe rather than a read.
- **Data, live (2026-08-05):** 4 auth users, 156 workouts and 3,201 sets all on
  `6da348ed`, exercises 134, routines 0, profiles 4, usernames 0.
- **Edge Function deploys are automated, and production is current.**
  `coach-notes` and `generate-routine` are at **version 14**, deployed
  2026-08-05 by `.github/workflows/deploy-functions.yml` — merging to `main`
  now deploys them, so "merged" and "live" are the same thing. Before that they
  sat at 13 while the fix for a routine builder that had never once succeeded
  waited on `main`. `SUPABASE_ACCESS_TOKEN` is a repository secret; the CLI is
  pinned to `supabase@2.111.0` because `latest` made every deploy depend on a
  shared GitHub API rate limit.
- **`vercel.json` is validated in CI** (`npm run check:vercel`). A `"//"`
  comment key in a rewrite once made Vercel reject every deploy, main included,
  while CI stayed green and production quietly froze on the previous build.
- **Not verified yet, and it is the acceptance test:** nobody has generated a
  routine through the app since the fix. Coach → Build me a routine, on a real
  account, is what proves it. The ledger says `generate-routine` has never
  produced a successful generation in its life.
- **Open decision for Ameen:** four zero-set workouts from desktop testing
  still render as blank History rows. Say "delete all my workouts with zero
  sets" and they go server-side.
- **Next action:** the two blocked items above. After beta starts: offline
  sync (Stage 4 fast-follow), then Stage 4B store publishing.
- **Privacy policy is live at `/privacy`** (2026-08-05), linked from the auth
  screen. The plan filed this under Stage 4B as a store prerequisite; it was
  actually overdue from the day 2A let strangers sign in. Standalone HTML, no
  bundle dependency. **Ameen should read it** — it describes his obligations.
- **Design v2.1 — DONE (2026-08-05).** All four missing screens built against
  the v2 tokens: Coach tab, Progress dashboard, Friends, Finish + 4:5 share
  card. Tab bar is five items. Bundle committed at `docs/design/`. Six
  deviations logged in DECISIONS.md, including one that reverses an earlier
  call of mine (the like icon). Side effect worth knowing: drawing the volume
  trend to the v2 chart grammar removed the last recharts import, so the
  dependency is gone and **precache fell 914 KiB -> 537 KiB**.
- **LAUNCH.md is current again** — the five-tab bar and the new empty states
  landed with the custom-exercises work. Re-read it before the second-account
  pass regardless; it is the checklist that would have caught today's defects.
- **Routine generation was failing in production**, with "The routine came back
  unreadable" on the Coach tab. Cause found and fixed in code: `parsePlan`
  handled a fenced ```json block but not a bare object after a reasoning
  preamble, while `coach-notes` handled both. One shared parser now serves
  both, with 9 tests. **The fix is not live until the functions are deployed** —
  see the Edge Function item above.
- **Free models are now the default in code, not just in config.** An unset
  `*_MODEL_FREE` secret used to skip the free attempt and go straight to paid.
  Confirmed empirically: every row in `ai_generations` used the free model.
- **The launch build queue is EMPTY.** Everything the Launch Bundle asks for
  is built. What stands between here and invites is the Ameen-owned items
  above. Nothing else should be built before the beta runs — offline sync and
  Stage 4B are explicitly sequenced _after_ it. The one exception is the work
  the beta itself surfaces, which on 2026-08-05 alone was four defects.
- **Auth is now four paths (2026-08-07, built same day):** Google OAuth
  (PKCE), email/username + password, code-based password recovery, and
  the original 6-digit code. New `auth-alias` Edge Function (deploys
  automatically on merge), recovery email template, Gmail
  dot-normalisation, welcome-screen username claim. **Blocked on
  Ameen — Part 3 of `docs/auth-social-setup.md`**: enable the Google
  toggle, Confirm-email ON, password min length 8, and
  `supabase:admin -- set-templates` for the recovery template. LAUNCH.md
  §1 now checks all four paths and remains the pre-invite gate.
- **Two strategy PROPOSALS exist** (2026-08-07):
  `docs/HEVY_PARITY_UPGRADE_PLAN.md` (close the gap, phases U1–U6) and
  `docs/BEATING_HEVY_PLAN.md` (open a lead via AI + social, phases
  B1–B6 — note B3 requires Ameen to explicitly reverse the no-chat
  rule), plus a reusable `wellness-app-design` skill in
  `.claude/skills/`. `BEATING_HEVY_PLAN` is still unapproved and unbuilt.
- **U1 items 1–2 are BUILT (2026-08-07), approved by Ameen.** The four
  functions in `src/lib/progress.ts` that were written, tested and rendered by
  nothing now draw: `trainingCalendar`/`heatStep` as a nine-month heatmap atop
  History, `sessionsPerWeek` and `liftBalance` as Progress blocks,
  `monthlyVolume` behind the long volume ranges. Time-range chips (3M/6M/1Y/All)
  on the volume and strength blocks, applied client-side — neither RPC takes a
  window, and both already return everything RLS allows. **Items 3–7 of U1 are
  NOT built**, so GATE U1 is only half-reportable.
- **U1 items 3–7 are BUILT (2026-08-07).** Picker filter chips (muscle group +
  equipment, two taps to "cable · shoulders"); discard-workout — a zero-set
  workout is dropped when the Log tab is left and when Finish is pressed, plus
  an explicit Discard behind the armed finish row; un-superset; the sticky
  warm-up defect; workout rename + note on the finish summary and in the
  History expansion; a rest-duration control in both the exercise detail page
  and the timer bar; one-tap logging of the warm-up ramp rows. **GATE U1 is now
  fully reportable** — see the PR.
- **Migration 0015 (`exercise_rest`) is PARSE-CHECKED, NOT APPLIED.** It is the
  first unapplied migration in the repo. The app degrades rather than breaking
  without it — a missing table reads as "no override" and the rest timer falls
  back — but the per-lift rest setting does nothing until Ameen applies it.
- **`exercises.default_rest_seconds` was never writable.** The upgrade plan
  read its emptiness as an oversight; RLS makes it structural. `exercises` is a
  shared catalogue and the only update policy covers rows you own, so a user
  cannot write to a seeded row — and should not, since the value would be
  everyone's. 0015 gives the preference a user-scoped table instead.
- **`workouts.notes` also already existed** (0008), unread and unwritten since
  the day it was added. Same dead-column pattern as the U1a charts; no new
  column was needed.
- **The muscle-balance chart had never actually drawn.** `inset-block-0` is not
  a Tailwind v4 utility; a class that does not exist emits no CSS and fails no
  check, so the fills, the knurl target band, the Coach rail and the rest-timer
  bar were all height 0 in production. One utility definition in `index.css`
  fixes all four. Nothing in the CI wall could have caught it — a screenshot
  did. See DECISIONS.md.
- **A visual pass was run on the built app (2026-08-07)** — the thing the Hevy
  comparison never did, and it falsified a claim in that comparison: the
  muscle-balance chart the parity plan listed as a differentiator to protect
  had never drawn. Two findings remain open and are now **U1c** in
  `docs/IMPLEMENTATION_PROMPTS.md`: no number anywhere in the app is
  thousands-grouped (no `toLocaleString`/`Intl.NumberFormat` in `src/` at all),
  and there is no error boundary, so one leaf crash blanks an entire tab.
  Screenshotting the built app is now a cross-cutting requirement of every UI
  phase — §4 of the parity plan says how, including the two ways the first run
  got it wrong.
- **An infrastructure audit was run (2026-08-08)** — `docs/INFRASTRUCTURE_AUDIT.md`,
  covering retrieval, evals, harnesses and tooling, with H0–H3 prompts added to
  `docs/IMPLEMENTATION_PROMPTS.md`. Three results worth carrying here.
  **RAG is now a recorded non-goal** (DECISIONS.md): Wazn has a schema, not a
  corpus, and embeddings would break the one-file privacy boundary that
  `coach_stats()` currently is. What the coach lacks is a tool layer, not a
  vector store. **The Edge Functions are outside every gate the project has** —
  `tsc --listFiles` sees 3 of 8 files under `supabase/functions`, so auth,
  quota, the model key and the alias sign-in have no typecheck and no test
  while merging to `main` deploys them. **The eval harness both plans depend on
  needs the ledger first**: `ai_generations` has five columns and can produce
  none of the cost, latency or hallucination figures §12 promises, because
  `recordGeneration` only ever runs after success. Tranche **H2 (grounding gate
  - ledger + breaker) is a hard dependency of the whole B-series** and is about
    two days.
- **Last updated:** 2026-08-08 by Claude Code (the infrastructure audit above).
  Previously 2026-08-07 (the four-path auth screen; then

- **R1 "Finished" is BUILT (2026-08-08) — U1c + U7.** Numbers are grouped
  everywhere by one formatter (`formatVolume`/`formatCount` in
  `src/lib/format.ts`), volume as a grouped integer, digits pinned to Latin so
  Stage 5 Arabic inherits the grouping and none of the risk. `toneFor` and the
  thumbnail initial are guarded, so the leaf that blanked Progress cannot throw
  at all. Motion is four tokens on the two approved easings, three of which
  name motion that already existed; the one new one is a 90ms set-commit rise.
- **L7's boundary was built twice in parallel and this branch's copy was
  deleted.** R1 shipped a `ScreenBoundary`; the H-series shipped an
  `ErrorBoundary` on `main` at the same hour. Theirs wins on three counts and
  loses on none — a **root** boundary as well as a per-tab one (a boundary
  inside `<main>` cannot catch a crash in the header or tab bar), `resetKey` so
  switching tabs is itself the recovery, and reporting to the error ledger. Two
  branches converging on the same feature in one day is the cost of running
  them in parallel; worth watching before it happens a third time.
- **Two U7 budgets are MISSED, and both misses are informative.** Cold start is
  2308ms against a 2000ms budget (470 KiB main chunk, mostly `supabase-js`,
  needed before the auth gate). Core-loop tap → set on screen is 204ms against
  100ms — and that is a floor of one round trip, exactly what §3-U7 predicted:
  **U3's optimistic writes are what make that budget reachable.** Warm start
  (1148ms), tap feedback (23ms) and tab switch (25ms) all pass; Lighthouse
  mobile is 97 with CLS 0.001.
- **The perf and screenshot harness is COMMITTED** — `npm run perf`,
  `npm run shots`, sharing `scripts/harness/app-harness.mjs`. The 2026-08-07
  visual pass used an ad-hoc rig that was lost; §4 requires a screenshot run
  every UI phase, so the rig is now part of the repo. `playwright` and
  `lighthouse` are devDependencies, deliberately NOT in the CI wall.
- **~~The precache ceiling has been over for a while.~~ FIXED 2026-08-08 —
  571.25 KiB**, under the ~600 KiB requirement. It was 654 KiB measured with
  real config; the old 537 KiB figure came from a config-less build where the
  authenticated screens tree-shake away entirely. Measure it with config,
  always. The fix was 78 KiB of `@supabase` client for features Wazn does not
  have — realtime (plus its phoenix websocket layer) and file storage, neither
  tree-shakeable, both aliased to Proxy stubs in `build/supabase-slim/`. **Main
  chunk 471.99 → 387.05 kB, cold start 2308 → 2192ms.** The stubs sit on the
  auth path (`realtime.setAuth` runs on every token refresh), so they no-op
  anything unrecognised rather than throwing, and a test re-reads supabase-js's
  own dist to catch an upgrade changing the contract. See DECISIONS.md.
- **`rate_limit_email_sent` IS 2. Every other auth rate limit is 30.** Read
  2026-08-08 off the live auth config. That is Supabase's default for the
  built-in mailer, and configuring custom SMTP does not raise it — you do,
  deliberately. **Two auth emails per hour, project-wide**: invite five friends
  in one evening and three of them get nothing and have no way to say so. Raise
  it before the invite wave. It is a forward-looking risk and **nothing more** —
  it did not cause the 08-05 case (the Gmail tester was sent a code 88 seconds
  later and got it), and Resend's log shows the ceiling has never once been
  reached: 25 sends across eight days, never more than 2 in any single hour.
- **Email authentication for `trywazn.app` is correctly set up**, checked
  2026-08-08 by querying DNS directly: SPF `v=spf1 include:amazonses.com ~all`
  on `send.trywazn.app` (Resend sends through SES), a DKIM key at
  `resend._domainkey.trywazn.app`, and `v=DMARC1; p=none;` at
  `_dmarc.trywazn.app`. The From is `code@trywazn.app`, and DKIM signs for the
  root domain, so DMARC aligns. **So the Yahoo failure was not an
  unauthenticated-sender rejection** — confirmed the same day by Resend's
  delivery log, which marks that message `delivered`. One loose end: the root
  domain carries no TXT record at all, so anything ever sent with an envelope
  from `trywazn.app` itself, rather than the `send.` subdomain, has no SPF to
  fall back on.
- **THE EMAIL SUBJECTS WERE LYING, and that is what a new tester actually saw.**
  Found 2026-08-08 in the same Resend log. `set-templates` has always guarded
  the email BODIES — it refuses any template missing `{{ .Token }}`, because the
  app verifies a 6-digit code and never follows a link — but it never touched
  the SUBJECTS, so they sat at Supabase's dashboard defaults describing a
  link-based flow this app has never had: "Confirm your email address" (no
  code), "Reset your password" (no code), and **"Your sign-in link" — which
  promised a link to an app that has never sent one**, against §2.4's rule.
  The guard covered half the email. Fixed and **applied live**: all three now
  read `{{ .Token }} is your Wazn sign-in code` / `… password reset code`,
  matching the reauthentication subject that was already right, and
  `set-templates` now guards subjects the same way it guards bodies. Code first
  so it is readable from a lock screen without opening anything. `invite` and
  `email_change` are deliberately left alone — their bodies carry no token, so
  a subject promising a code would be the same lie in reverse.
- **Part 3 of `docs/auth-social-setup.md` is DONE**, contrary to the blocker
  above: `external_google_enabled` is true, `mailer_autoconfirm` is false
  (confirm-email on), `password_min_length` is 8, and every code-carrying
  template — confirmation, magic link, recovery, reauthentication — contains
  `{{ .Token }}`. Verified against the live config, not the dashboard.
- **THREE TABS DIED ON EVERY DEPLOY, and it is fixed.** Ameen reported
  Progress, Coach and Friends broken on 2026-08-08 — exactly the three
  `React.lazy` tabs. A deploy retires the hashed chunk an already-open page is
  about to import, and `autoUpdate`'s `skipWaiting`/`clientsClaim` hand that
  page to a worker whose precache no longer has it. React remembers a failed
  module as failed, so "Try again" could not recover it. Fixed twice over: the
  new worker no longer claims a live page, and `lazyScreen` reloads once if an
  import fails anyway. `npm run check:deploy` plays it out in a browser and
  fails if either regresses. Eager loading was measured as an alternative and
  costs 32ms of cold start on a budget already missed — staying lazy.
- **Migrations: production is at 0018. 0016, 0017 and 0018 were APPLIED
  2026-08-08** through the Supabase MCP connector, on Ameen's instruction,
  after a probe found production stopped at 0015 — the reverse of what STATUS
  had claimed (it said 0015 was unapplied). Verified against
  `information_schema` rather than trusted from a success flag:
  `client_errors` has its 8 columns, RLS on, 2 policies;
  `ai_generations` went from 6 columns to 14 plus `ai_generations_quota_idx`;
  `follows.follower_id` and `workout_likes.user_id` default to `auth.uid()`;
  `coach_notes.prompt_version` exists. **The error boundary finally has
  somewhere to report to** — its absence is why the deploy break was invisible
  until a user mentioned it.
- **0019 is still unapplied, deliberately.** Its five stat-tool functions have
  no caller until B3's Ask surface exists, and `coach-notes` does not use them.
- **A MIGRATION LEDGER NOW EXISTS, AND IT ONLY KNOWS ABOUT THREE.**
  `supabase_migrations.schema_migrations` was empty before 2026-08-08 — every
  migration from 0001 to 0015 was applied by hand-executed SQL, so Supabase
  had no record of any of them, which is why "what is live" has always been a
  probe rather than a read. Applying through the connector created the ledger,
  and it contains `social_owner_defaults`, `ai_observability` and
  `client_errors` only. **It is accurate about those three and silent about
  the fifteen before them, so it reads as though the database began at 0016.**
  Anyone reaching for `supabase db push` or `db reset` needs to know that
  first. Backfilling 0001–0015 as ledger-only rows is offered and not done.
- **R0 blocker 1 is CLOSED (2026-08-08).** Ameen pulled Resend's API log and
  its Emails list; both are read above. The send was accepted and the message
  was delivered, so there was never anything to fix in delivery — the finding
  that came out of it instead was the subject lines. **Blocker 2 stands**:
  `LAUNCH.md` on a real phone with a second account, which is also GATE U7's
  last item, and is not reachable from a sandboxed session.
- **`auth_logs` retention is ~1 day**, which is why Supabase could not answer
  the 08-05 question and Resend had to. Checked 2026-08-08 against the
  Management API's analytics endpoint: counts by day were 38 for 2026-08-07 and
  **0 for 08-04, 08-05 and 08-06**. Anything older than about a day is gone —
  worth knowing the next time a sign-in question arrives, because the window to
  ask Supabase is one day and Resend's is longer. Two caveats on the check: the
  endpoint returned
  aggregates but not rows for this token (`count(*)` works, `select
event_message` comes back empty), so nothing here inspected message contents;
  and a no-window query silently returns `[]` because the default window is
  short — always pass `iso_timestamp_start`/`iso_timestamp_end`.
- **The screenshot harness had never rendered the Coach tab.** `installSupabaseStub`
  had no route for `/functions/v1/*`, so the call fell through to `json([])` and
  the tab drew the error boundary in every `npm run shots` run since the harness
  was committed. Four screenshots of "Something broke", taken repeatedly, read
  as normal. Both functions are stubbed now, including the empty-account path.
  The §4 rule about stubbing every column a real RPC returns applies to
  responses, and a function is a response too.
- **Date formatters throw.** `Intl.DateTimeFormat.format` raises `RangeError` on
  an invalid date, and a formatter that throws during render takes its tab down —
  the same defect class U1c guarded `toneFor` against, and the dates were missed.
  Every one in `src/lib/format.ts` now degrades to an em dash.
- **U2b — the workout overview — is BUILT (2026-08-08), design v2.2.** The
  active workout is a board, not a corridor: every exercise a block, every
  planned row a ghost, one tap on a row's check to commit it exactly as shown.
  **No set is pre-inserted, and none ever will be** — a ghost is client state in
  `src/lib/plan.ts` and nothing there writes anything. Per-row previous-session
  ghosting, the superset rail with a round count, grip long-press reorder
  (hand-rolled, no `@dnd-kit`, plus Move up/down in the block menu for the
  keyboard path), per-lift notes and rest on the block, and `SKIPPED` at Finish
  and nowhere else. The focused view survives unchanged as the zoom state; its
  25 tests still pass untouched, which is the proof.
- **The superset round-rest had NEVER fired, and the parity plan listed it as a
  shipped differentiator.** `addSet` asked "who is behind?" before "is the round
  done?", and after the set that closes a round the first question always
  answers — so the rest branch was unreachable from the second set onward. An
  A/B superset rested exactly once per session, after A's first set, before B
  was even picked. This is the muscle-balance chart again: right in intent,
  wired wrong, invisible because nothing drew the round. Fixed in the new
  `src/lib/commit.ts` with a full A/B/A/B replay as a test. **Protect-list items
  are not verified until something renders them.**
- **Migration 0020 (`workouts.exercise_order`) is PARSE-CHECKED, NOT APPLIED.**
  It is a `uuid[]` column, deliberately not a join table: an unapplied column
  makes one PATCH fail and the board falls back to deriving order from the sets
  (the pre-v2.2 behaviour), where an unapplied table would error on every write
  mid-workout. The column is NOT named `position`. Block order does not survive
  a reload until Ameen applies it; nothing else degrades.
- **U7 budgets re-measured against the new hot path.** `measureCoreLoop` used to
  time "Log set N" in the focused view and now times the overview's row check,
  because that is what a repeat set costs. Cold start 2192 → **2130ms** (still
  over the 2000ms budget), warm 1148 → **1055ms**, tap → feedback **25ms**,
  tap → set on screen 204 → **195ms** (still over 100ms; the floor is one round
  trip and U3's optimistic writes are what make it reachable), tab switch
  **21ms**, Lighthouse **98**, CLS 0.001. Precache 570.63 → **587.13 KiB** with
  config, under the ~600 KiB ceiling with 12.87 KiB of headroom.
- **The screenshot harness had never opened a workout.** Every fixture workout
  carried an `ended_at`, so the Log tab always drew the idle screen and the
  entire U2b screen would have been invisible to `npm run shots` — the same hole
  as the missing Edge Function routes, one week later. There is now an `active`
  fixture, and the run commits a real set against a real build. It also found a
  real defect: the sticky rest bar's wrapper was transparent and cut a control
  in half mid-scroll.
- **U3a is BUILT (2026-08-08) — trust-ladder rungs 1 and 2.** Set commits are
  optimistic: the row goes on screen when the check is pressed and the insert
  follows behind it. **Tap → set on screen 195ms → 46ms, so the U7 budget that
  has been missed since R1 now passes.** The client generates the row's uuid
  and it IS the primary key, which makes a replay idempotent (`23505` reads as
  "already landed"), gives the row its final identity so it is never remounted,
  and makes the queue safe to persist. PR flags arrive on reconcile — a record
  is computed in the database and an optimistic row genuinely cannot know it.
  The pending queue and the board's client-only state are checkpointed to
  localStorage on every change, so killing the tab mid-set loses nothing.
  Finish flushes first and refuses while writes are outstanding. **U3b is now
  built — see below.**
- **R5 is BUILT (2026-08-08) — "Bring your history from Hevy".** File picker →
  client-side parse → preview (workouts, sets, date range, which lifts matched,
  which will be created, every problem the file has) → one confirm that writes
  under the user's own RLS. The file never leaves the device. Deliberately does
  NOT reuse `scripts/import_hevy.ts`: that script aborts where this must
  report, hardcodes Ameen's timezone, and reads `weight_lbs` unconditionally —
  which for a kg Hevy account would make every weight silently null.
  **Offered only to an account with no history**, because importing the same
  export twice would duplicate every workout and nothing de-duplicates.
- **The precache went OVER the ceiling and was brought back.** 604.98 KiB at
  worst, now **592.20 KiB** by excluding the import chunk from the service
  worker's precache — an import that writes to Supabase cannot work offline
  anyway, so precaching it was waste. **7.8 KiB of headroom is a warning, not a
  budget: the next UI phase should expect to remove something.**
- **Cold start is still the one missed budget: 2171ms against 2000ms.** It has
  measured 2308 / 2192 / 2130 / 2317 / 2171 across runs, so treat anything
  under ~200ms of movement as noise rather than progress.
- **U3b is BUILT (2026-08-08), and GATE 4 now has an answer.** A workout can be
  started, logged and finished with no signal at all: the queue widened from
  sets to an ordered op log (`set` / `workout-start` / `workout-finish` /
  `workout-discard`), the workout's id is client-generated like a set's, and
  order in the queue IS the foreign-key guarantee. A durable IndexedDB store
  (raw, no `idb` — justified in DECISIONS.md) holds the queue and a structured
  read cache; the localStorage checkpoint stayed as the synchronous last-gasp
  copy and the load path merges the two by id.
- **Offline is no longer treated as failure**, which was the §2.1 violation
  nobody had noticed. `classifyFailure` splits `landed` / `offline` /
  `rejected`; an offline write does not count an attempt and is never
  surfaced, so a basement gym no longer produces an error banner over a board
  somebody is lifting from. Same rule now covers the rest, note and
  block-order writes.
- **THE TRUST LADDER'S RUNG 1 HAD NEVER WORKED.** The checkpoint effect clears
  itself on mount (`if (!workout) clearCheckpoint`), it is declared before the
  load effect, and `loadCheckpoint` runs after an await inside it — so the
  clear always beat the read. "Kill the tab mid-workout, reopen, nothing lost"
  shipped in U3a and had never once restored anything. Fixed; both persist
  effects now wait for the load path to read the device first. Found by the
  first check that ever drove a reload in a browser, and it is the
  muscle-balance chart again: right in intent, wired wrong, invisible because
  nothing rendered it.
- **The Log tab could hang on "Loading…" forever.** A dead radio rejects and
  the offline path takes over; a network that accepts and then goes quiet never
  rejects at all, so `Promise.all` never settled. The load path now has a
  six-second deadline and skips the network entirely when the browser already
  says the radio is off. Found by a screenshot, not a test.
- **`e2e/offline.spec.ts` runs in CI** — three tests against the real bundle
  with the project's network cut: a full airplane-mode workout syncing clean on
  reconnect, a tab killed mid-workout losing nothing, and a dead-zone reopen
  still drawing the board. The stub is stateful now, and answers a replayed
  primary key with `23505` exactly as Postgres would.
- **The parity plan's Workbox plan for `previous_session` is not
  implementable.** Supabase RPCs are POSTs and the Cache API stores GETs only,
  so no service worker can cache them. The NetworkFirst route covers
  `/rest/v1/` GETs (real value for History and Progress); everything the Log
  screen needs is cached structurally in IndexedDB instead. The read cache is
  emptied by `device-reset.ts` when the signed-in user changes — not on
  sign-out, because signing back in as yourself with a set still queued must
  not lose the set.
- **The precache went over again and was cut again: 600.15 → 559.38 KiB.**
  Progress, Coach and Friends left the precache on the same argument that moved
  the import chunk — all three read through RPCs and an Edge Function, so
  precaching them buys nothing offline. They are runtime-cached on first open.
  `npm run check:deploy` still passes. **40 KiB of headroom, for the first time
  in three phases.**
- **U7 budgets re-measured:** cold start **2164ms** (the one standing miss, and
  inside the ±200ms noise band: 2308 / 2192 / 2130 / 2317 / 2171 / 2164), warm
  **1035ms**, tap → feedback **32ms**, tap → set on screen **48ms**, tab switch
  **20ms**, Lighthouse **98**, CLS 0.001.
- **`npm run shots` can cut the network now**, after being caught blind for the
  third time. It photographs the board with a set queued and the board reopened
  from cache; both frames are what found the hang above.
- **Still NOT built, deliberately:** starting a routine you have never opened on
  this device while offline (there is nothing cached to start from — one opened
  before works), removing a block that has committed sets while offline, and
  editing past workouts offline. Each reports honestly rather than pretending.
- **Last updated:** 2026-08-08 by Claude Code (U3b: the offline op log, the
  IndexedDB store and read cache, the airplane-mode e2e, and the two defects
  they found — rung 1 never restoring, and the load path with no deadline).
  Previously 2026-08-08 (U3a's optimistic writes and
  checkpoint; R5's Hevy import; the precache ceiling breach and its fix).
  Previously 2026-08-08 (U2b, the workout overview; the
  superset round-rest defect it uncovered; migration 0020; the harness's missing
  in-progress workout). Previously 2026-08-08 (the deploy-time lazy-chunk break
  Ameen reported, found by reproduction and fixed twice over; the precache
  ceiling met at 571.25 KiB by dropping unused Supabase realtime and storage;
  guarded date formatters; the harness's missing Edge Function stubs; and the
  discovery that migrations 0016–0019 were never applied). Previously
  2026-08-08 (R1: U1c's number formatting and
  error boundaries, U7's motion system and measured latency budgets, and the
  committed perf/screenshot harness). Previously 2026-08-07 (the four-path auth screen; then
  all of U1 — the unrendered progress functions now draw, time-range chips, the
  `inset-block-0` fix that made the muscle-balance chart visible for the first
  time, and items 3–7: picker filters, discard-workout, un-superset, the sticky
  warm-up defect, workout notes, per-lift rest on migration 0015, and one-tap
  warm-up ramp logging; then the visual pass and the U1c findings it produced).
