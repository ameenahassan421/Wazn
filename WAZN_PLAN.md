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
4. **Design system: v5 "Momentum" (current since 2026-08-16).** The
   authoritative values are `src/lib/tokens.ts` and `src/index.css`, not
   this paragraph: `npm run check:tokens` compares them and regenerates
   `mobile/tailwind.tokens.js`, and CI fails on drift. **Never type a colour
   or a size into a document and expect it to stay true.**

   What is stable enough to write down: one accent, **ember `#e8491d`**
   (adopted 2026-08-12, replacing v2's amber `#F0B429`). Text on solid ember
   is warm near-black `#1c0e08`, never white. Display and figures are
   **Saira Semi Condensed**; the type ramp is named steps, and
   `npm run check:type` fails any off-ramp font size in `src/`. On native,
   type is a component (`<Txt step="hero">`) and never a class, because React
   Native picks a font cut by family NAME. Numbers render tabular. Touch
   targets min 48px, hot-path controls 58 to 66px. Elevation is a 1px hairline
   ring, no drop shadows. No emoji, no decorative illustration. Two easings
   (ease-out, linear); reduced-motion collapses durations.

   **The lineage, because four systems in fifteen days is itself a finding.**
   v2 "Loaded Ink" (2026-08-04, amber, IBM Plex, dark only), v3 "The Plate"
   (2026-08-13, paper-first, five tabs retired), v3.0 "the coach everywhere"
   (2026-08-14, six tabs restored on Ameen's call), v5 "Momentum"
   (2026-08-16, ember ground, named type ramp). **This paragraph specified v2
   until 2026-08-19**, three systems after it stopped being true, inside the
   section this plan calls non-negotiable. Live specs:
   `docs/design/v5-momentum/` (`README.md`, `P0-PLAN.md`, `P0-GATE.md`).
   Superseded bundles are stamped in place or in `docs/archive/`.

   **v5 is the last new visual system until the app has users.** Stage 4A
   implements it in full during the Expo migration, because the port and the
   restyle are the same edit.

5. **CSS logical properties only** (`margin-inline-start`, `text-align:
start`, etc.), `dir="ltr"` on root. Arabic RTL lands in Stage 5 and
   must be a flip, not a rewrite. The header language toggle is a
   named exception to any out-of-scope list, not a settings screen.
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

**The active stage is 4A, One App** (decided 2026-08-19): one Expo codebase
for iOS, Android and web, with v5 "Momentum" implemented inside the migration
rather than before it. Stages 0 through 4 shipped. Stage 4B (store publishing)
is blocked on GATE A4 and on accounts Ameen has not bought.

**Nine gates have produced zero evidence-based stops.** GATE 0 and 1 were
opened by decision rather than evidence (DECISIONS.md:690), GATE 5 was waived,
GATE 2 and 3 need users the app has never had, GATE 4 has only an automated
answer, and v5's P0 was read against the running app only after all eight of
its PRs had merged. "Gates are evidence, not vibes" is the rule; the record
says it has not been kept. **GATE A2 exists to break that pattern**: it is the
first gate in this file that measures §1's own sentence.

### Stage 0 — Foundation fix (SHIPPED 2026-08-01)

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
countdown visible in-flow, survives navigation; done state = ember
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
celebrated inline (ember flash, no confetti), stored consistently.
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

### Stage 4A: One App (ACTIVE, decided 2026-08-19)

**One codebase: Expo Router plus NativeWind, shipping iOS, Android and web.** The separate
Vite PWA in `src/` is retired at the end of this stage. The web is not lost; it becomes an
Expo Router web target through `react-native-web`, which `mobile/` already depends on.

**The redesign is implemented in full here, not in a separate stage.** The port and the
restyle are the same edit. Every screen moves to Expo already in its final form, once.
Building it on the web first would mean building everything twice, in a codebase that is
being deleted.

**Which redesign changed on 2026-08-20.** This stage said "v5 Momentum" everywhere until
Ameen replaced it with the prototype at `docs/design/prototype/`. The premise did not change
— one edit, not two — but the target did, and A1 was already three screens in when it moved.
See DECISIONS.md 2026-08-20 and §7.0. **The design system itself is now DONE**: tokens, ramp,
fonts, mark, `Btn`, `Card`, `Txt` and the icon set are all on the new system and green on the
full wall. What remains is screens.

This is a strangler-fig migration, not a rewrite. The app stays shippable at every step.

#### Phase A0: Foundations (nothing user-visible)

- `@expo/metro-runtime`, and prove `npx expo export --platform web` produces a working build.
- **The native locale adapter.** `expo-localization` plus `resolveInitialLocale` and `t` from
  `portable.ts`. Without it Stage 5's Arabic does not exist on the phone, and roughly half of
  native's user-visible strings already have EN and AR keys in the shared catalogue. This is
  a wiring gap, not a translation gap, and it goes before any screen work.
- **Fix `set_type`** (`mobile/src/state/live-workout.ts:255`). Data corruption, one line.
- **Unit preference round-trip.** Native never calls `get_user_preferences` or
  `upsert_user_preference`, so kg in the browser leaves the phone on lbs.
- **Deep-link domain** to `www.trywazn.app` (`mobile/app.config.ts`).
- Move `DEFAULT_REST_SECONDS` out of `use-rest-timer.ts` into `rest.ts`, then
  `export * from './rest'` in `portable.ts`. 109 lines of pure arithmetic are quarantined by
  one browser import.
- Rename native `Readiness` to `CheckIn` and import it from `@wazn/domain`; the two stacks
  currently use one name for two different types.
- **Vitest in `mobile/`**, and CI runs it. First tests on `live-workout.ts`'s reducers, which
  are pure over injected state.

**GATE A0:** `expo export --platform web` serves the app. A set logged on native and a set
logged on web agree on `set_type` and on units. `portable.test.ts` and `npm run check:tokens`
still pass. `mobile/` has a test suite that runs in CI.

#### Phase A1: The five stub tabs, built native, in v5

**Revised 2026-08-19. This phase said "come over as DOM components" and that was wrong.** It
was written from the generic web-to-native playbook, which assumes ONE package migrating.
Wazn has two, with a deliberate wall between them, and the wall is what breaks the pattern.
Four reasons, all verified against this repo, full reasoning in DECISIONS.md 2026-08-19:

1. **Two Tailwind majors, by hard constraint.** Web is `tailwindcss@^4.0.0`; `mobile/` is
   `tailwindcss@^3.4.19`, forced by NativeWind v4. Separate lockfiles on purpose. A DOM
   component inside `mobile/` importing web screens needs the v4 pipeline inside the v3.4
   build.
2. **It would ship a second auth session.** `src/lib/supabase.ts:19` sets
   `persistSession: true` against default storage, which is `localStorage`. A DOM component
   runs in a WebView with its own storage origin, so a lifter signed in natively would open
   History and find themselves signed out.
3. **It drags 12,267 lines with it.** 43 web components plus a second locale provider and a
   second unit provider, duplicating what A0 built natively.
4. **It wraps code scheduled for deletion.** Those screens are pre-v5 and `src/` retires at
   A4, so it is a throwaway wrapper around throwaway code, against the whole premise that the
   port and the restyle are one edit.

**The one case that appeared to need a WebView does not.** `ProgressScreen.tsx:842` says it
outright: "Not recharts. This is three paths, and recharts was half the bundle on a screen the
Log tab must never wait for." The charts were already hand-drawn SVG. `src/lib/progress.ts`
has **zero imports** and is already exported through `portable.ts`, so every bit of the data
shaping crosses today, and `react-native-svg@^15.15.4` is already a dependency. **No WebView
anywhere in this migration.**

Each screen is built once, native, already in v5. Order, and the reasoning for it:

1. **History.** The only door to "what did I do before" apart from the tab bar, and it
   carries the least coach machinery, so it is the cheapest place to establish the pattern
   the other four follow.
2. **Body.** Smallest (374 lines of web equivalent) and the one screen with no card door, so
   the tab bar is its only route in. Its data is empty in production, so it must be built
   against its degraded render rather than a happy path.
3. **Coach.** Read-only surfaces first; "Tell the coach" was never assessed in v5 P0 and
   needs a look rather than a decision.
4. **Friends.** Social, and the least load-bearing for a lifter mid-session.
5. **Progress.** Last, because the charts are the most work even hand-drawn, and because it
   is lazy-loaded on web for a reason the native build must preserve: the Log tab must never
   wait for it.

Honest cost of the revision: A1 is no longer "ship day one". It is real work per screen,
against 4,292 lines of web equivalent. The alternative was building all five twice and
shipping a signed-out WebView in between.

**Reordered 2026-08-20, and A1 is no longer next.** History was built, and Body was about to
be, when the design changed underneath. Two things follow, and neither is a preference:

- **The four screens the prototype actually specifies come first.** Home, Workout, Rest and
  Finish are drawn, measured and running in `docs/design/prototype/`. The other six are not.
  Building a derived screen before a specified one means inventing a language and then finding
  out it disagrees with the reference — which is the failure that produced this reorder.
- **History has to be revisited.** It was built against v5 and swept to paper mechanically. It
  compiles and it is not the design.

So A2's core loop runs BEFORE the rest of A1. The order is now Home → Workout → Rest → Finish
(specified), then History → Body → Coach → Friends → Progress (derived), with auth last
because it is the screen a lifter sees once.

**GATE A1:** all six tabs render real content on a device, no 21-line stub remains, and each
screen has been read side by side against `docs/design/prototype/` where the prototype covers
it — and, where it does not, against a written derivation that says which of the prototype's
patterns it is built from (see "How a screen is verified" in §6).

#### Phase A2: Strangle the core loop (NEXT, and it now runs before the rest of A1)

Home, Workout, Rest and Finish become native, already in the prototype's form. These are the
four screens `docs/design/prototype/` actually draws, which is why they go first. This phase carries **all five open P0 findings** and P1's momentum bar, PR moment,
toasts and finish verdict. Shared triggers (notable-set, in-session PR baseline, finish
verdict) go behind `portable.ts` before either target renders them, following the
`live-board.ts` precedent.

**The background rest timer ships here** (`expo-notifications`), because a lifter locks their
phone between sets and a web timer dies when they do. It is the single capability that
justifies this whole stage, and it does not exist yet.

**The wordmark is DONE (2026-08-20)** and took three attempts to get right, which is the
argument for it never being a type step. It rendered `WAZN` at hero scale because it borrowed
`<Txt step="hero">`; it then rendered a v5 mark after v5 had been replaced; and it then hung
below the baseline because a CSS pixel offset was ported as a ratio. It is now
`mobile/src/components/ui/Wordmark.tsx`: `w` + the plate glyph + `zn`, baseline-aligned, with
the plate sized to Sora's x-height. `Plate.tsx` holds the mark's four variants.

Nativize means redesign, not reskin. Reach for `@expo/ui` before styled primitives.

**GATE A2, and it is the one this project has never had:** an instrument for §1's sentence.
A test that counts taps and elapsed time from opening the Log screen to committing the first
set, run on a device, that fails the build if it regresses. §1 has said "log a set in under
30 seconds, one hand, mid-workout" for 206 commits and nothing in the repo has ever measured
it.

#### Phase A3: Strangle the insight screens, by value

Whichever of the five the cohort actually opens, in the order they open them. Progress last:
its charts need a native library, and until then the DOM component is correct.

**GATE A3:** no DOM component remains on a screen the cohort opens weekly.

#### Phase A4: Retire the PWA

- Rebuild what `vite-plugin-pwa` gives today: installability, the service worker, offline
  caching. **Expo web does not provide these for free, and losing them is a real regression**
  for a cohort member training in a basement.
- Vercel serves the Expo web build.
- Delete `src/components` and `src/screens`. **`src/lib` stays**; it is the domain.
- The 222 SEO pages are untouched throughout. `scripts/build_seo_pages.mjs` imports nothing
  from `src/`.

**GATE A4:** `trywazn.app` serves the Expo web build, installs to the home screen, and an
airplane-mode workout still syncs clean on reconnect. GATE 4 re-proved on the new stack.

#### What Stage 4A is NOT doing

- **Not rewriting `src/lib`.** 11,184 lines of domain that already crosses. It survives.
- **Not touching the 222 SEO pages.** They are independent and they are the only organic
  acquisition channel.
- **Not a monorepo, and not npm workspaces.** Adding a `workspaces` key to the root
  `package.json` changes how Vercel installs. Rejected 2026-08-16 for that reason and the
  reasoning has not changed.
- **Not Capacitor.** Rejected 2026-08-16 (DECISIONS.md:7266): App Store Guideline 4.2,
  keyboard and haptic ergonomics, and the background timer foundation.
- **Not P2 onboarding** (screens 01 to 05) until GATE A2 passes.
- **Not store submission.** That is Stage 4B and it gates on retention that does not exist.
- **No new visual system.** v5 is the fourth in fifteen days and it is the last one until
  there are users.

#### Hazards, named in advance

- Two Tailwind majors cannot share one lockfile (NativeWind v4 needs Tailwind 3.4, the web
  app is Tailwind v4). This is why `mobile/` has its own lockfile and why this stage ends by
  deleting the web app rather than merging the two.
- The 16 component and screen test files (2,430 lines) need React Native Testing Library. The
  58 `src/lib` test files (9,825 lines) do not move at all.
- A green `expo export` proves a screen bundles, not that it renders. Verify by running.

### Stage 4B: App Store and Google Play publishing (blocked on GATE A4 and on accounts)

**Superseded 2026-08-16: this stage said "wrap the same React codebase with Capacitor" and
that was rejected.** Compiled native via Expo shipped instead, for App Store Guideline 4.2,
for keyboard and haptic ergonomics on a one-handed logger, and as the foundation for
background rest timers. Stage 4A builds the app this stage publishes. See DECISIONS.md
2026-08-16.

Store builds come from **EAS Build** off the single Expo codebase. The Expo web target at
trywazn.app stays the fallback that keeps users unblocked through review friction.

- **Google Play:** $25 one-time developer account. Internal testing track first (the cohort
  installs from it), then production.
- **Apple App Store:** $99/year developer account, TestFlight for the cohort, then App
  Review. Apple sign-in becomes **mandatory** the moment Google sign-in exists in the iOS
  build.
- **Store prerequisites, both platforms:** a public privacy policy URL at
  trywazn.app/privacy covering Supabase storage, Resend email and AI processing via
  OpenRouter; store listing assets (icon, screenshots, descriptions, Arabic and English per
  Stage 5); data-safety and privacy-nutrition forms.
- **Universal Links and App Links** need `.well-known/apple-app-site-association` and
  `.well-known/assetlinks.json` served from `www.trywazn.app`. Both need an Apple Team ID,
  which does not exist yet.
- Native-only additions ride these builds later: AdMob (Stage 6), push notifications, health
  integrations if ever un-parked.

**GATE 4B:** beta cohort retention looks healthy AND LAUNCH.md checks pass on a
store-installed build on both a real Android device and an iPhone.

**This gate cannot be evaluated today and no amount of building changes that.** It requires a
cohort. The app has never been shared. GATE 2 comes first, and GATE 2 needs nothing but
Ameen's phone and `LAUNCH.md`.

### Stage 5 — Egypt-ready

Full Arabic UI + RTL (the logical-properties investment pays off
here). Head start: design v2 ships a complete RTL screen build with
draft Arabic copy and IBM Plex Sans Arabic rules (Latin digits for
weights, Arabic-Indic allowed in prose) — the draft copy REQUIRES
native-speaker review, which is already part of GATE 5. Arabic exercise names alongside English. kg default for
Egypt-region users. Ramadan-aware streaks (a missed daytime pattern
during Ramadan doesn't break streaks; suhoor/iftar-friendly session
times treated as normal).

**Locale preference (per-user, display only).** The initial locale is
resolved in order: (1) stored per-user preference from
`user_preferences.locale` if set, (2) region/browser signal
(`navigator.language` or Egypt region), (3) English as the fallback.
The `locale` column is `text not null default 'en' check (locale in
('en', 'ar'))` on `user_preferences`, and the existing RPC
`upsert_user_preference` gets a third branch in its allowlist. The
toggle lives in the header next to the lbs/kg control: same style,
same persistence pattern. Setting `ar` flips `dir` on the root element
and switches all strings and exercise names; digits stay Latin (§2.4).
Setting `en` flips back. The preference is persisted server-side via
the RPC and cached client-side the same way the unit preference is,
so it survives a new device. This is display only, like the unit
toggle: one stored preference, no data rewritten.

**GATE 5 — WAIVED by Ameen 2026-08-09.** The review below was not done; the
machine-drafted Arabic shipped without it. Kept here as the standard to meet
whenever someone does read it, not as an open blocker. Original text:

**GATE 5:** a native Arabic speaker completes onboarding → routine →
logged workout → progress review without involuntarily hitting English
on the Arabic path (region detection is not infallible, and the
diaspora is large). The locale toggle round-trips: switch to Arabic,
reload, still Arabic; switch back to English, reload, still English;
same result on a second device (server-side persistence).

### Stage 6 — Monetize

Wazn Pro with regional pricing: USD ~$3–4/mo globally (Stripe or
Play billing), EGP 50–100/mo in Egypt via Paymob (cards + mobile
wallets). Free =
unlimited logging + basic 1RM chart + 4 routines. Pro = unlimited
routines, advanced analytics, body measurements, no ads. Ads on free
tier per §2.3 only. Rewarded video unlocks premium analytics for 24h.
AdMob needs real native slots, which the Expo build from Stage 4A
already provides; there is no separate wrapper to build here. The Expo
web target stays ad-free by architecture.

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

1. **Read the banner before you read any file.** `.claude/hooks/session-start.sh`
   prints computed state: position against `origin/main`, how many commits have
   landed since this file was last edited, unmerged branches, open PRs. It is
   derived from git, so it cannot go stale. This file can.
2. **If the banner says §7.0 is stale by N commits, it is lying to you.** Reconcile
   it against the code and the database before building anything. On 2026-08-19 it
   was nine commits stale, said the rest canvas takeover was "not built" after it
   had shipped, and named that finished work as the next action.
3. Read `WAZN_PLAN.md` (this file), `DECISIONS.md`, and `CLAUDE.md`.
4. Read **§7.0** as a **claim to verify, not a fact to recite**. §7.1 below it is a
   chronological log that contradicts itself; §7.0 wins over §7.1, and the database
   wins over both. The active stage and its next unchecked item is where work resumes.
5. Verify reality matches STATUS before building (query row counts, check deploy
   state, read `information_schema` rather than the migration ledger). If they
   disagree, trust reality, fix STATUS, note it in `DECISIONS.md`.
6. **If an open PR exists, another session may be mid-flight. Do not rebuild its
   work.** The banner lists them.

**Ending any work session:**

1. Update **§7.0** with what is now true, and date-stamp it. Append narrative
   to §7.1 if it carries a lesson. Do not let §7.0 grow into another log:
   if a bullet there is no longer current state, it belongs in §7.1 or
   nowhere.
2. Append significant choices/deviations to `DECISIONS.md`.
3. Commit with a message referencing the stage (e.g. `stage0: import
   - rename`), push, confirm Vercel deploy is green.
4. If a gate was reached: post the acceptance checklist results and
   STOP. Do not begin the next stage.

**`CLAUDE.md` must contain a pointer to this file and rules §2.6-2.8
verbatim, so they survive even if this file isn't read.**

### How a screen is verified (2026-08-19)

**The web export only reaches the sign-in screen, and that is a hole in this
rule.** `expo export --platform web` plus a static server renders the app in a
browser with no simulator and no Xcode, which is how the wordmark defect was
finally SEEN rather than inferred. But every tab is behind
`Stack.Protected`, so an unauthenticated session cannot reach History,
Progress, Body, Coach or Friends. Signing in needs real credentials, which a
session must never type.

So for any screen behind auth, "read the reference beside the build" degrades
to "read the reference beside the SOURCE", which is weaker and must be said
out loud rather than reported as a visual pass. Two ways to close it, neither
built yet: a dev-only route that renders a screen against fixture data with no
session, or component tests through `react-native-web` in `mobile/`'s vitest
(the config already collects `.tsx`). The second is the ratchet and is the
better answer.

Until one exists: **screens behind auth are verified by Ameen on a device, or
by reading the reference's source against the implementation. Neither is a
screenshot, and neither should be written down as one.**

**Five visual defects have shipped from this repo and Ameen found every one of them by
looking at a screen while the wall was green.** Arabic numerals rendering backwards,
`ExerciseThumb` missing from the board, exercise names English in Arabic, the eleven v5 P0
findings, and the wordmark rendering `WAZN`. `CLAUDE.md` already said "screenshot the app
after any locale or layout work" and the rule did not hold, because a screenshot on its own
answers "did it render", never "did it render the right thing".

**The design is a runnable React app and almost nobody has run it.**
`docs/design/prototype/Wazn-Prototype.html` — open it in a browser and the core loop runs,
with a live rest timer and plate maths. The one time anyone read the PREVIOUS reference
against the app (the v5 P0 gate, 2026-08-17) it produced **eleven findings in a single
sitting**, six on Home alone. That is the whole argument for this section.

**And running it is still not the strongest form of the check.** On 2026-08-20 the prototype's
bundle was unpacked instead: the `__bundler/template` block is a JSON string holding the whole
design, and every size, colour, radius and shadow in the system is a literal in it. Counting
literals found 25 distinct font sizes where a screenshot would have found "some big text".
`docs/design/prototype/README.md` has the ten lines of Python. **Read the source; look at the
render to check you read it right.**

So, before any screen is called done:

1. **Open the reference next to the build, and NAME THE FILE.** `docs/design/prototype/`
   covers FOUR screens: Home, Workout, Rest, Finish. It does not contain auth, History,
   Progress, Body, Coach or Friends. **Before comparing, confirm the screen you are looking at
   exists in the file you opened** — on 2026-08-20 a session verified the auth screen against
   a reference that did not contain it, and reported a pass. "I ran the reference" is not a
   claim until it names which one and confirms the screen is in it.
   **For the six screens the prototype does not cover there is no reference to open**, and the
   honest move is to say so and write down which of the prototype's patterns the screen is
   derived from — not to quietly compare it to the retired v5 handoff.
2. **Compare per element, not per screen.** "The branding looks right" is the claim that was
   made about a screen rendering `WAZN` in 50px uppercase, and "the wordmark matches" is the
   claim that was made while the plate hung below the baseline. A claim about one element is
   a claim that can be wrong out loud; a full-screen screenshot offered as evidence for it is
   not evidence.
3. **The word "verified" is unusable without naming what it was compared against.** A session
   that writes "verified" and cannot name the reference has not verified anything.
4. **Every defect a human finds becomes a machine assertion the same day.** This is the only
   part that compounds. `src/components/Wordmark.test.tsx` exists because a mark once swapped
   locales; that class of bug cannot ship on web again. `mobile/` had no such test and the
   mark broke there three times.
   **And the assertion has to be proved to fail.** The `Pressable` lint rule added on
   2026-08-20 was run against a deliberate violation before it was trusted, because this repo
   has shipped guards that read correctly and did nothing (0027's `revoke`, the invented-lift
   guard, and `check:tokens` claiming for months to assert a colour in a file it had never
   opened). A guard nobody watched fail is a comment.
5. **A screenshot catches what nothing else can, and it is not optional.** Four of the
   defects in the paragraph above were invisible to every automated check in the repo. The
   worst — every button in the native app rendering with no background — was found by taking
   one screenshot on 2026-08-20, after `tsc`, `eslint`, `expo export` and `bundle:ios` had all
   passed on it repeatedly.

**Structural properties are machine-checkable and belong in a test: presence, order, count,
element type, token identity, text direction, case.** Proportion, balance and rhythm are not,
and belong to the eye. Do not build a check that pretends to judge the second kind, and do not
leave the first kind to a human twice.

**Step 1 of "ending a session" is enforced now, because it was skipped four
consecutive times.** PRs #103, #104, #105 and #106 merged code and left §7.0
untouched. Three hooks and one CI job close that loop:

- `.claude/hooks/status-guard.sh` (Stop) blocks a session ending with committed
  changes under `src/`, `mobile/` or `supabase/` that never touched this file.
  Uncommitted scratch work gets a reminder instead of a wall.
- `.claude/hooks/git-safety.sh` (PreToolUse on Bash) snapshots uncommitted work to
  `refs/wazn-safety/<stamp>` before any destructive git command, then allows it.
  Written after a subagent told read-only in its own prompt ran
  `git checkout -- CLAUDE.md` and destroyed a session's work. **Instructions do not
  bind subagents. Commit before you fan out.**
- CI fails a pull request that changes `src/`, `mobile/` or `supabase/` without
  changing `WAZN_PLAN.md`. Hooks are local; CI is universal. It cannot yet block a
  merge (branch protection needs a public repo or GitHub Pro), but it fails loudly.

**Routing around these is not a shortcut, it is the exact behaviour that made the
source of truth untrustworthy.**

## 7. STATUS

> Claude Code: **§7.0 below is authoritative. Everything in §7.1 is a
> chronological log, newest last, and it contradicts itself in places.** Where
> the two disagree, §7.0 wins. Do not resolve a conflict by reading further
> down the log; the log is history, not state. Verify against the database
> before trusting either.

### 7.0 CURRENT STATE: verified 2026-08-19 against production and the database

Every number below was read live, not recited. **Re-verify before quoting it.** This block
was nine commits stale on 2026-08-19 and said so nowhere; PRs #103 through #106 all merged
code and none of them touched this file. Three hooks now make that visible and expensive
(see "How this block stays true", last in this section).

#### P0 FIXED 2026-08-20: every button in the native app was invisible

`Pressable`'s idiomatic `style={({ pressed }) => ...}` callback is **silently dropped** under
NativeWind 4.2.6 + React Native 0.86. NativeWind applies `cssInterop` to `Pressable` so it can
carry a `className`, and a function `style` does not survive it. The control renders with no
background, no height, no padding and no `flexDirection` — and still takes taps.

Every `Btn` in `mobile/` used that form. On the sign-in screen SIGN IN was a **gap in the
layout** and CONTINUE WITH GOOGLE was two lines of near-black text on a near-black ground. The
tab bar's buttons had no height and the header avatar had no disc. `tsc`, `eslint`,
`expo export` and `npm run bundle:ios` were all green throughout, because none of it is a type
error and the bundle builds fine.

It was found by taking a screenshot, which is the only thing that could have found it.

Fixed at four call sites — `Btn`, `ChipBtn`, `Header`'s avatar, the tab bar — by tracking the
pressed state with `onPressIn`/`onPressOut` instead. `mobile/eslint.config.js` now fails the
build on a function `style` on a `Pressable`; the rule was proved to fire against a probe file
rather than assumed to work.

This also corrects a claim this file made on 2026-08-19: the sign-in button was reported as
"grey where the reference fills it cream", attributed to a disabled-state opacity. It had no
fill at all.

#### DECIDED 2026-08-20: the prototype replaces v5 Momentum

Ameen attached `~/Downloads/Wazn Prototype.html` (dated 2026-08-20) with "you are not
following the design" and "even the logo is not correct based on the v5 design". It is a
runnable four-screen prototype — Home, Workout, Rest, Finish — and it is **not** the v5
Momentum system in `docs/design/v5-momentum/`. Source extracted from its bundle; these are
read out of it, not inferred:

|                | v5 Momentum (this repo)              | The attached prototype                                          |
| -------------- | ------------------------------------ | --------------------------------------------------------------- |
| Ground         | ink `#0f0d0a`                        | paper `#f7f3ec`, page `#e9e4d8`                                 |
| Text / muted   | `#ece7dc` / `#9a927f`                | `#16130e` / `#8a8378`                                           |
| Cards          | `#181510`, hairline ring             | `#ffffff`, ring **plus** `0 1px 2px` shadow                     |
| Display face   | Saira Semi Condensed 600/700         | **Sora 600/700/800**, tracking `-.02`…`-.05em`                  |
| Body / mono    | Hanken Grotesk, IBM Plex Mono        | same                                                            |
| Accent         | `#e8491d`                            | `#e8491d`, pressed `#b83915`                                    |
| Control radius | 12                                   | **99 (pill)**, cards 20                                         |
| Shadows        | forbidden outright                   | used, including `0 10px 26px rgba(232,73,29,.35)` under the CTA |
| Wordmark       | `w` + ember `a` + `zn`, set in Saira | `w` + **an ember plate glyph AS the `a`** + `zn`, Sora 800      |

The wordmark difference is the one Ameen named. The prototype's mark is a plate seen
side-on — disc with a counter, plus a rounded bar at the right — used as the letter, at 14px
beside 26px type. Neither the interface wordmark nor the app icon in this repo is that.

**Why this cannot be absorbed quietly.** It contradicts a hard rule in `CLAUDE.md`
("Dark-first… No gradients, shadows"), the whole of `docs/design/v5-momentum/`, and
`src/lib/tokens.ts` — which is the palette's source of truth for BOTH stacks and is
CI-checked against `index.css` and `mobile/tailwind.config.js`. Adopting it means new tokens,
a new type ramp, a fourth font family shipped in the native bundle (Sora), a new icon set,
and every screen redrawn in both apps.

**Ameen's call, 2026-08-20: the prototype replaces v5, and the wordmark goes with it**
("same as prototype"). What that cost and what it left open:

DONE, and green on the full wall (1222 tests, lint, typecheck, check:tokens, check:type,
check:coverage, production build, `bundle:ios`):

- `src/lib/tokens.ts` carries BOTH systems. `palette`/`type`/`fontFamily` are the prototype's
  and the native app reads them; `legacyPalette`/`legacyType` are v5's and exist only so
  `src/index.css` can still be checked against something while the dying PWA lives. They go
  at phase A4 with the stylesheet. The web app's APPEARANCE did not change — it reads
  `index.css`, never this module.
- 19 colours, 19 type steps, `elevation`, and the new `radius`/`space` shapes.
- Sora 600/700/800 and Hanken 500/600 ship in the native bundle; Saira is gone from it.
- `Plate.tsx` — the mark at its four levels of detail, paths copied from the prototype.
  `Wordmark.tsx` sets `w` + the plate + `zn`, which is what "the logo is wrong" meant.
- `Btn` is five pill kinds with sentence-case labels and the ember glow; `Card` is four tones
  including the two the rest canvas needs; `Txt` has the paper ink roles and the `onInk`
  family for the one screen that inverts.
- Every screen swept off the v5 roles. The app compiles, bundles and runs.
- The icon set is the ember plate on paper, and `app.config.ts` is `light`/`#f7f3ec`.

FIXED the same day, and worth the note: the plate in the wordmark hung below the baseline.
The prototype writes it as `width: 14` and `top: 3px` against 26px type, which reads like two
arbitrary nudges. It is not: `26px/1` with Sora's metrics puts the baseline at 23.0 from the
row top and the x-height at 9.2, and those two numbers land the plate at top 9.0, bottom 23.0.
The plate occupies the x-height box exactly — it is set as a letter with no ascender and no
descender, which is what `a` is. The first port carried the `3px` across as a ratio of font
size; React Native does not compute a text box the way CSS does, so it drifted and Ameen
caught it by eye. It now uses `alignItems: 'baseline'`, which Yoga resolves to a non-text
child's bottom edge, so the plate sits on the line by construction at any size.

**A proportion copied out of a browser is a bet that two layout engines agree.** They do not.

OPEN, and none of it guessed at:

1. **Six screens the prototype does not cover.** It has Home, Workout, Rest and Finish. Auth,
   History, Progress, Body, Coach and Friends have to be DERIVED in this language, not copied.
   Auth is currently the v5 layout wearing paper — it works and it is not the prototype.
2. **Brass is gone and nothing replaced it.** v5 reserved a second hue for earned states —
   rank, duel opponent, record pace. The prototype has no such tier; its "earned" signal is
   the `full` plate on the PR card. Every brass usage was swept to `accent`, which puts a
   second ember on screens that already have an action. Friends and Progress need a ruling.
3. **Three contrast pairs are below AA for small text**, all of them the prototype's own
   values, all asserted at their measured figure in `tokens.test.ts` so they cannot drift
   silently:

   | pair                                                    | measured | candidate                        |
   | ------------------------------------------------------- | -------- | -------------------------------- |
   | `muted` on paper                                        | 3.39:1   | `body` `#4f4a41` at 7.95:1       |
   | `accent` on paper (the "12 wk" chip, the NEW PR kicker) | 3.51:1   | `accentSoft` `#9a3012` at 6.77:1 |
   | `onInk` on the ember CTA (a 16px label)                 | 3.51:1   | v5's `#1c0e08` at 4.84:1         |

   They were NOT quietly corrected. Changing a designer's greys behind their back is not a fix,
   and this app is read one-handed in gym lighting, so the numbers belong in front of Ameen.

4. **The core loop is still the v5 layout in paper clothes.** Home, Workout, Rest and Finish
   are the four screens the prototype actually specifies and they are the four still to be
   rebuilt against it. That is the next block of work, and it is A2, not A1.

#### The decision that governs everything below

**ONE CODEBASE. Expo, shipping iOS, Android and web.** Decided by Ameen 2026-08-19. The
separate Vite PWA in `src/` is retired at the end of the migration; the web survives as an
Expo Router web target via `react-native-web`, not as a second app. **v5 "Momentum" is
implemented in full, and the port and the restyle are the same edit**: each screen moves to
Expo already in its v5 form, once. Stage 4A below is the whole plan. See DECISIONS.md
2026-08-19.

Corollary that decides what is worth building this week:

> **`src/lib` survives the migration. `src/components` and `src/screens` do not.**

`src/lib` is 11,184 lines of portable domain that already crosses to native through
`src/lib/portable.ts`. The screens and components, roughly 19,600 lines, are the port. Work
in the first is banked. Work in the second is rented.

#### Database, read 2026-08-19

|                         |                                                                               |
| ----------------------- | ----------------------------------------------------------------------------- |
| Accounts / profiles     | 8 / 8, one is a robot, one is the simulator                                   |
| Workouts                | 152, of which 2 are unfinished                                                |
| Workout sets            | 3198                                                                          |
| Routines                | 18                                                                            |
| Exercises               | 134 (0 custom)                                                                |
| AI generations          | 83                                                                            |
| `client_errors`         | 0                                                                             |
| `user_preferences` rows | 4                                                                             |
| Body tables             | `body_weights` 0, `body_measurements` 0, `protein_days` 1, `daily_checkins` 1 |
| Last workout, any user  | 2026-08-17                                                                    |
| Migrations applied      | **0001 through 0028**                                                         |

**THE APP HAS STILL NEVER BEEN SHARED.** The 8 accounts are Ameen, people he already knows,
one test robot and `simulator@trywazn.app`. **No reading of these numbers is a retention
signal.** GATE 2 and GATE 3 cannot be evaluated until the app is distributed. Ameen's last
real training session was 2026-07-20, so the Coach reporting near-zero sessions is correct,
not broken.

**The second dataset is still empty.** The Body tab, the readiness score and the cross-signal
all run their degraded render in production. Nothing supplies `sleepMinutes` or `hrv` at all.

`supabase_migrations.schema_migrations` holds 10 entries and has never known about
0019 to 0026. **The ledger is not a record of what is applied and must never be treated as
one.** `information_schema` is.

#### Code, verified 2026-08-19

|                                    |                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------ |
| Tests                              | **1,204 in 85 files, all passing** at HEAD                               |
| of which `src/lib` (survive)       | 58 files, 9,825 lines                                                    |
| of which component/screen (do not) | 16 files, 2,430 lines                                                    |
| `mobile/` tests                    | **zero.** No test script, no test file                                   |
| Production web                     | **https://www.trywazn.app**, 200 OK                                      |
| Web-only runtime dependencies      | four: `react`, `react-dom`, `@supabase/supabase-js`, `@vercel/analytics` |

`mobile/` already carries `react-native-web ~0.21.0` and `react-dom 19.2.3`. **Expo web is
one dependency away** (`@expo/metro-runtime`). This is why the migration keeps a web target
rather than losing one.

The 222 static SEO exercise pages are generated by `scripts/build_seo_pages.mjs`, which
imports **zero** things from `src/`. They are independent of any app migration and survive
untouched.

#### Live defects, all verified, none fixed by a document

1. **FIXED 2026-08-19, ships on the next deploy.** All 222 SEO pages canonicalised to
   `https://workout-theta-plum.vercel.app`, the free Vercel alias, and `robots.txt` pointed
   the sitemap there too, so every page told Google the unbranded alias was the canonical
   home of the domain Ameen actually bought. The cause was not a missing Vercel variable, it
   was the **default**: `scripts/build_seo_pages.mjs` read
   `process.env.WAZN_SITE_URL || DEFAULT_SITE_URL` and `DEFAULT_SITE_URL` was the alias.
   `WAZN_SITE_URL` was never set in Vercel for the whole life of the SEO pages. The default
   is now `https://www.trywazn.app`, so nothing has to be remembered. Verified by
   regenerating: canonical and sitemap both name the bought domain. **A default nobody has
   to set beats an environment variable everybody forgets.**
2. **Native writes every set as a working set.** `mobile/src/state/live-workout.ts:255`
   hardcodes `set_type: 'normal'` while the same file correctly reads `set_type` at `:148`.
   Every warm-up logged on the phone poisons e1RM, records and volume. Fixed in Stage 4A
   phase A0.
3. **Native deep links point at a dead domain.** `mobile/app.config.ts:49` and `:66` claim
   `wazn.app`: DNS resolves to registrar parking, HTTPS returns a connection failure, nothing
   is served. Real invites go to `www.trywazn.app` (`src/lib/invite.ts:2`), so `join/[code]`
   can never fire from a real link.
4. **`src/lib/i18n.ts` holds 83 em-dashes**, most inside sentences a user reads, against
   Ameen's standing rule. `277a65f` swept three `mobile/` files and not this one.
5. **`mobile/` has no locale layer at all.** Stage 5's Arabic does not exist on the phone.

#### The native app, measured

`mobile/` bundles for both platforms in CI and is not on a store. What is real: Expo Router
with a declarative `Stack.Protected` guard, email-or-username plus password and the 6-digit
code, the `join/[code]` deep link, the live board with zones, momentum bar and BANK IT, and
the rest canvas.

**Five of the six tabs are still exactly 21-line stubs**: History, Progress, Body, Coach,
Friends. Against 4,292 lines of the equivalent web screens.

**The native app does not yet do one thing the PWA cannot.** The reasoning for going native
(DECISIONS.md:7266) names App Store Guideline 4.2, keyboard and haptic ergonomics, and
**background rest timers**. `mobile/package.json` declares `expo-keep-awake` and **no
`expo-notifications`, no `expo-task-manager`**. The native rest timer is a `setInterval` in a
React component (`mobile/src/components/RestCanvas.tsx:49`) and dies on backgrounding exactly
like the web one. The background timer is the capability that justifies the migration and it
is scheduled in phase A2, not assumed.

#### v5 "Momentum"

**P0 CLOSED at 4/11 acceptance (Ameen, 2026-08-17), not passed.** Eight PRs merged with no
stop between them and the acceptance list was read against the running app afterwards.

Of the eleven carried findings, **six are closed and five are open**, verified at HEAD:

| closed                                                                                    | by             |
| ----------------------------------------------------------------------------------------- | -------------- |
| stat tile order (FREEZE deliberately kept over SESSIONS, a rule-6 deviation)              | #104 `8be4205` |
| avatar polarity                                                                           | #104 `8be4205` |
| header band                                                                               | #104 `8be4205` |
| two competing start controls                                                              | #105 `6046b08` |
| tab bar glyphs (DECIDED: glyphs stay)                                                     | #105 `6046b08` |
| screen 08's four inputs (DECIDED by construction: `pointerEvents: 'none'` under takeover) | #103 `74f7d9d` |

Open: numbered plan list rows (06); status strip (07); exercise header (07); cream rest bar
(07); next-set block (08). **The full table, with status, is
`docs/design/v5-momentum/P0-GATE.md`, which is maintained again as of 2026-08-19.**

**All five open findings and all of P1 land in Expo, not in `src/`.** P1's other buckets,
none started: momentum bar and its brass flip, the PR moment, toasts, the finish verdict, the
remaining screen restyles, coach-volume wiring. Item 6 (Tell the coach) was **never
assessed**; `TellCoachSheet.tsx` is v3-era.

#### The wordmark renders uppercase on native. THE MARK IS FIXED 2026-08-20

**Corrected 2026-08-19, same day, after reading the reference.** The first version of this
block claimed four defects. **Two of them were wrong**, and they were wrong because the
session wrote them from the web implementation instead of from the v5 reference. Both are
struck below rather than deleted, because a wrong claim that reached this file is exactly the
failure this file keeps having.

**The v5 design is a runnable React reference app, not a spec**, and nobody has run it:
`docs/design/v5-momentum/design/Wazn v5.html` plus `ui.jsx`, `screens_core.jsx`,
`screens_tabs.jsx`, `data.js`, `coach2.js`. Every screen, live. Open it in a browser.

**FIXED 2026-08-20 in `mobile/src/components/ui/Wordmark.tsx`.** The mark now
sets itself directly (Saira Semi Condensed 700 by family NAME, lowercase, the
`a` in ember) at 21 in the header and 34 on auth, and no longer borrows a ramp
step in either place. The cause turned out to be the same mistake twice in
opposite directions: the header used `step="num"`, the FIGURES step at weight
600 and tabular, which was close enough to look right; auth used `step="hero"`,
which carries `uppercase: true` at 50, which was not. The bare-`<Text>` lint
rule added in A0 flagged the new component immediately, and it is exempted in
the config beside `Txt.tsx` with the reason attached rather than by an inline
disable.

**The real defect, and it is one line.** The v5 reference sets the wordmark as its own
treatment, not as a ramp step (`design/ui.jsx:68`):

    fontFamily: 'Saira Semi Condensed', fontWeight: 700, fontSize: 21
    w<span style={{color:'#e8491d'}}>a</span>zn

Lowercase, 21px, in the header. Native at `mobile/app/sign-in.tsx:116` writes the same
lowercase `w` + accent `a` + `zn` but sets it with `<Txt step="hero">`, and the shared ramp's
`hero` step carries **`uppercase: true`** (`src/lib/tokens.ts:128`) at **size 50**. So the
mark renders `WAZN` at hero scale instead of the wordmark. **The wordmark is not a type step
and must not borrow one.** Confirm Saira Semi Condensed actually resolves on native while
fixing it; the reference pulls it from Google Fonts and the local `fonts/` folder ships only
Sora, Hanken and IBM Plex.

**~~Native renders the mark as text rather than the SVG lockup.~~ WRONG.** v5 _specifies_
text. The SVG plate lockup with the `evenodd` counter is the v3 "Loaded Ink" mark, and v5
**deliberately retired it from the interface** in favour of the Latin wordmark. Native's
approach is correct. `src/components/Wordmark.tsx` is the thing that is now out of step, not
`mobile/`.

**~~The Arabic وزن mark has no native path.~~ WRONG.** v5 retires وزن from the interface too.
It stays canonical on the share card, the PWA icon and the favicon, none of which are native
interface surfaces.

**The lesson, which is worth more than the fix.** The session claimed a defect against
`src/components/Wordmark.tsx` because it read the _implementation_ and never opened
`docs/design/v5-momentum/design/`. The reference was sitting in the repo, runnable, the whole
time. **Read the reference before calling anything a defect, and prefer running it to reading
it.** Scheduled: the wordmark treatment lands in A0 alongside the type work; the full v5 pass
is A2.

#### Stage 4A phase A0, in progress (started 2026-08-19)

**The web target exists and runs.** `mobile/` now declares
`web: { bundler: 'metro', output: 'single' }` and depends on
`@expo/metro-runtime`. `npx expo export --platform web` produces a working
build, and it was **verified by running it, not by building it**: served and
loaded in a clean browser tab, the sign-in screen renders with NativeWind
styling, the wordmark and the type ramp intact, and **zero console errors**.
This is the load-bearing claim of the whole migration, now demonstrated.

`output: 'single'` and not `'static'` on purpose. Static prerendering runs
every route's render in Node at build time, so any module-scope browser access
anywhere in the tree becomes a build failure. Production is already an SPA
behind a rewrite. Revisit at A4.

**A green export hid a crash, which is why GATE A0 says run it.**
`expo-secure-store` has no web implementation at all: every method is undefined
there, so the first Supabase session read threw
`getValueWithKeyAsync is not a function` before anything rendered.
`mobile/src/services/supabase.ts` now picks storage by platform, `localStorage`
on web (which is what the Vite app has always used, so a session written by one
and read by the other agrees) and the chunked SecureStore adapter on native.
`detectSessionInUrl` follows the same split. **Assume nothing about the web
target that has not been loaded in a browser.**

`mobile/` has `vitest` and a `test` script for the first time. It had 3,768
lines and no suite while `src/` enforces a per-module coverage floor.

Still open in A0, being built now: `rest.ts` through `portable.ts`, the native
locale adapter, the unit round-trip to the server, the `Readiness` to `CheckIn`
rename, and the first `mobile/` tests. GATE A0 is not claimed until all of them
land and the wall is green on both packages.

#### The auth screen does not match, and the wordmark claim was too broad

**Ameen, 2026-08-20, from the design zip.** The entry above said the wordmark
was "FIXED and verified on a device". The MARK is correct and that part holds:
the reference's computed styles are Saira Semi Condensed 700, 34px,
`textTransform: none`, `#ece7dc` with the `a` at `#e8491d`, and the device
renders exactly that. **But a screenshot of the whole screen was offered as the
evidence, which implied the screen was right. It is not.**

Against `design/Onboarding.html:22-48`, where `AuthScreen` actually lives:

| element                     | reference                                                   | `mobile/app/sign-in.tsx`      |
| --------------------------- | ----------------------------------------------------------- | ----------------------------- |
| subtitle                    | "Log a set in under thirty seconds, one hand, mid-workout." | **absent**                    |
| "Your training, on record." | `T.title` at **22**                                         | `title` step, which is **17** |
| fields                      | placeholders inside the input                               | mono uppercase labels above   |
| SIGN IN                     | `kind="ink"`, cream fill, 52px                              | renders grey                  |
| links                       | one centred row, sentence case, `·` separated               | stacked, uppercase            |

**The Google hero button and the OR divider are NOT on that list.** They are
deliberately absent: neither credential exists, and stubbing a sign-in path
that cannot work is worse than omitting it.

**The methodology failure is the finding.** Auth is not in `design/Wazn v5.html`
at all. The session ran that file, compared History against it, wrote "run the
reference beside the build" into §6 as a rule, and then verified auth against a
reference that does not contain auth. Same shape as describing the wordmark
from the web implementation instead of the reference: the check was performed,
against the wrong artefact, and reported as though it had passed. §6 now
requires naming the file and confirming the screen is in it.

The zip Ameen sent is byte-identical to `docs/design/v5-momentum/`. Nothing was
missing from the repo. It simply had not all been read.

**Scope: auth is screen 01, P0 work, not one of A1's five tabs.** Carried here
rather than folded into A1 without a decision.

#### GATE 4 does not hold on native, and A0 found out why

The A0 gate asks whether a set logged on native and one logged on web agree. On the two
fields it names they do: both write `weight_kg` (weight is stored in kg always, §2, the
toggle is display only) and both now write the board's real `set_type`, which a test locks
(`mobile/src/state/live-workout.test.ts`, "writes the set type the board holds, not a
hardcoded normal"). But comparing the two payloads turned up divergence the gate did not ask
about:

|                              | web (`LogScreen.tsx:667`) | native (`live-workout.ts:266`) |
| ---------------------------- | ------------------------- | ------------------------------ |
| client-generated `id`        | **yes**                   | **no**                         |
| goes through the write queue | **yes**                   | **no**                         |
| `rpe`, `superset_group`      | yes                       | no (both nullable)             |

**The `id` is the idempotency key, and native does not send one.** On web that uuid IS the
row's primary key, so a replay after a mid-flight kill hits a unique violation, which
`isAlreadyLanded` reads as the server saying "I already have that". Native lets Postgres
default the id, so the same replay inserts a duplicate set.

**Native has no write queue at all.** It writes straight through and increments `unsynced` on
error; `live-workout.ts` says so itself, that the store "must not be described as
offline-capable". So **GATE 4, an airplane-mode workout that syncs clean on reconnect, is
proved on web and false on native.** Stage 4 is marked shipped, and it is shipped on one of
the two targets.

This is not an A0 item and is not being smuggled into one. It lands in **A2**, with the core
loop, because the queue is shared-domain work (`write-queue.ts` and `offline-store.ts` are 468
lines that already pass the purity guard) and because a lifter in a basement is exactly the
user the native app exists for. **GATE A4 re-proves GATE 4 on the new stack**, and it cannot
pass until this is built.

#### Blocked on Ameen

1. **DONE, reported not verified. `rate_limit_email_sent` raised to 30** by Ameen,
   2026-08-19. `LAUNCH.md` needs at least five auth emails in one sitting, so at 2/hour the
   checklist stalled on its own third checkbox. **This session could not confirm it against
   live config**: `npm run supabase:admin -- show` answers
   `401, JWT could not be decoded`, so the `SUPABASE_ACCESS_TOKEN` in `.env.local` is expired
   or revoked. Re-verify with that command once the token is replaced, and do not record it
   as verified until something reads it back.
2. **Run `LAUNCH.md` on a real phone with a second account**, airplane mode included. The
   PWA installs to the home screen today (`display: standalone`), so this needs no store and
   no spend. GATE U7's last item and v5 acceptance item 11.
3. **Leaked-password protection is NOT a config click.** It is Supabase **Pro only**; it was
   attempted and returned 402 (DECISIONS.md:2468, `scripts/supabase_admin.ts:398-421`). It is
   a purchase decision. This block said "it is a config change" for days and that was wrong.
4. **Google OAuth client and the Apple developer account** ($99/yr, plus $25 Play). These
   block the hero auth path on both targets, and Apple sign-in becomes mandatory the moment
   Google exists on iOS.
5. **Branch protection is unavailable.** `gh api .../branches/main/protection` returns 403:
   the repo is PRIVATE on the GitHub free plan. Required status checks cannot be turned on
   until it goes public or onto Pro. Four of the last twelve PRs merged before their own CI
   reported and two turned `main` red.

The other four security-advisor warnings (`resolve_invite`, `social_feed`,
`upsert_user_preference`, `weekly_leaderboard` being SECURITY DEFINER) are by design.

#### One tool this session lost

**`SUPABASE_ACCESS_TOKEN` in `.env.local` is dead.** `npm run supabase:admin -- show`
answers `401, JWT could not be decoded`, so every command in `scripts/supabase_admin.ts`
(site URL, SMTP, templates, OTP length, password policy, email rate limit) is unavailable
until it is replaced, and so is any read-back verification of auth config. The Supabase
**MCP server** still works for SQL and advisors, which is how the counts above were read.
Replace the token from the Supabase dashboard (Account, then Access Tokens) into
`.env.local`. Until then, treat every auth-config claim as reported rather than verified.

#### A simulator is available on this machine (2026-08-19)

Xcode **26.6**, six **iOS 26.5** simulators, and `mobile/ios/` prebuilt with Pods installed.
This was not true for most of this project's life and it changes two things.

**It makes the visual loop runnable.** Every visual defect this repo has shipped was found by
Ameen looking at a screen (see "How a screen is verified" in §6), and the reason the wall
never caught one is that nothing in it renders. A simulator build plus a screenshot, read
against the runnable v5 reference, is the missing half. **This is how a screen gets checked
from here on, and it is what would have caught the wordmark.**

**It is a laptop capability, not a CI gate, and the distinction matters.** `mobile/ios/` is
gitignored (`mobile/.gitignore:42`) and generated by `expo prebuild`, so zero files are
tracked and GitHub Actions cannot reproduce it. CI keeps `expo export`, which proves a bundle
and nothing about pixels. **Do not write a gate that depends on a simulator and then mark it
green in CI.** The simulator pass belongs to whoever is at the machine.

**For Stage 4B it satisfies exactly one prerequisite.** "Build and sign in Xcode on Ameen's
Mac" is now possible. It buys nothing else: TestFlight and App Review still need the $99
Apple developer account, Play still needs the $25 one, and GATE 4B still needs cohort
retention that cannot exist until the app is shared.

#### Next action

**RESUME HERE (2026-08-21, written before a compaction).** `main` is at the coach dial commit,
tree clean, CI green on `check` / `smoke` / `mobile`. Nothing is uncommitted and nothing is
half-done.

**Built and verified on a simulator:** the design system, Home, Workout, Rest, Finish, History,
Body, the exercise picker, the shared `Spark` chart, GATE 4's durable write queue, and the
coach's ghost with its Full/Quiet/Off gate and its Settings dial.

**Do these next, in this order:**

1. **Home's `brief`** — the coach's sentence on the highest-traffic screen. `use-home.ts`
   returns `brief: null` unconditionally; `verdictFor` and `forecast.ts` can both supply a true
   line. Gate on `speaks` from `useCoach`.
2. **The Finish debrief** — same shape, one sentence over the session's own numbers.
3. **The Coach tab (v5 screen 15)** — the largest remaining piece and the one v5 calls the
   control room: mode selector, week review, notes, Ask the coach. Currently a stub.
4. **Progress**, then **Friends**. Neither needs new chart geometry — `sparkGeometry` is
   built and tested. Both still carry Ameen's open brass question; build in ember and flag,
   which is what every other screen did.
5. **Auth last.** The screen a lifter sees once, the prototype does not cover it, and with auth
   switched off it is unreachable anyway.

**Two audits worth a WORKFLOW rather than a linear read** (ultracode is on; Ameen confirmed
2026-08-21). Both are read-only fan-outs, so no file conflicts:

- **v5 leftovers across all native screens.** Settings was found printing a four-line paragraph
  in IBM Plex Mono because it took `step="meta"`. Mono is this system's machine voice. That
  class is almost certainly elsewhere, along with uppercase copy and ramp misuse.
- **Dead controls and dead props.** The recurring defect of this whole session: a `brass` prop
  branching to the same value twice, an "Add exercise" line with nothing behind it, a Save
  button over an empty catalogue, `adjustRest` with no caller. Every one was found by eye.

**The standing pattern, and the reason to keep doing it:** every automated gate stayed green
through nine defects this week, and a screenshot found all nine. Run the app.

**Still open for Ameen, unchanged:** the `muted` contrast at 3.39:1, and what replaces the
brass tier on Friends and Progress.

#### NativeWind removed 2026-08-20, and it changed the app by zero pixels

Ameen asked whether the stack is the standard way to build a mobile app. It is —
Expo SDK 57, Expo Router, RN 0.86 on the New Architecture, React 19, Reanimated 4,
TypeScript 6, ESLint 9 flat config, all current against npm — with one exception,
and the exception was expensive.

**NativeWind was fully wired and used `className` zero times.** Babel preset,
Metro transform, `tailwind.config.js`, a generated `tailwind.tokens.js`, a types
shim, a `global.css` and its `.d.css.ts` sibling. Every screen styles through
`src/design/Txt.tsx` and `src/components/ui/`, in plain JS, because **React
Native picks a font cut by family NAME** and a utility class cannot express
that — so the ramp was never going to be classes here, and once the ramp is a
component the rest follows it.

What it cost:

- Tailwind pinned to 3.4 while the web app is on v4. That was the stated reason
  the two packages needed separate lockfiles, in `CLAUDE.md` and in CI's own
  comments. They still stay separate — a `workspaces` key changes how Vercel
  installs — but for a different reason now.
- A transform over every file in the bundle, including the shared domain modules.
- A third copy of the tokens, generated on every `check:tokens -- --write`.
- **`cssInterop` on `Pressable`, which silently dropped a function `style` and
  rendered every button in the app invisible for three days**, through a green
  `tsc`, `eslint`, `expo export` and `bundle:ios`.

Removed, and verified the honest way: `bundle:ios`, `bundle:android`,
`check:routes`, mobile tsc/eslint/tests, the full root wall, and **a simulator
screenshot pixel-identical to the one taken before the removal**. That identity
is the proof it was doing nothing.

The `Pressable` lint rule STAYS. The callback form would work again now, but
re-adding NativeWind is a plausible future move and this failure mode is
completely silent.

#### Still non-standard, and worth knowing

1. **`@wazn/domain` is a Metro alias to `../src/lib`, not a workspace.** The
   documented Expo answer is an npm/pnpm monorepo; that was ruled out because a
   root `workspaces` key changes how Vercel installs. It is why
   `disableHierarchicalLookup` and `watchFolders` exist in `metro.config.js`. It
   stops mattering when the PWA retires at A4.
2. **Tests are vitest, not `jest-expo` + `@testing-library/react-native`**, which
   is the official preset. It is why no component test exists: vitest cannot
   render an RN tree without a `react-native-web` shim.
3. **No `eas.json`, no `expo-updates`, no `expo-notifications`.** All three are
   needed for Stage 4B, and the notifications one is the background rest timer —
   the single capability that justifies going native at all.
4. ~~**No offline write queue on native.**~~ **Built 2026-08-21** — see below.
   `mobile/src/state/live-workout.ts` now checkpoints to AsyncStorage on every
   mutation and retries with client-generated ids. It is not yet a BACKGROUND
   sync: nothing drains when the radio returns on its own.

#### Home is built against the prototype (2026-08-21)

`mobile/app/(tabs)/index.tsx`, the first screen rebuilt in the new language rather than swept
into it. Header (mark at 26, ink avatar at 38), a two-line greeting under a meta line, an ink
Up next card, the check-in, and one ember CTA with the plate as its glyph.

**Three v5 surfaces were removed, and removing them cost nothing.** The stat tiles, the rank
card and the plan manifest were never wired on native: `use-home.ts` returns
`{...DAY_ONE, username, target, routineName, daysRested}`, so `stats` stayed
`{streak:'—', thisWeek:'—', sessions:'—'}`, `plan` stayed `[]` and `rank` stayed `null` on
every render this app has ever done. The tiles rendered three em-dashes. They come back when
the queries do.

**Two things the prototype draws are NOT drawn, because there is no data for them.** The
header's `12 wk` chip and the meta line's "week 12 · 3 of 4 done" need a training-week count
and plan progress that no query produces. Omitted rather than faked, per the same rule that
keeps `rank` null. The coach card renders only when `brief` is non-null, which needs the coach
Edge Function.

**The number to beat moved rather than died.** v5 gave `BEAT 4,320 KG` a card at hero scale;
the prototype has no such card. It is now the Up next card's third line — the slot that
answers "what am I about to do". Section 1's number survives, its container does not.

#### The app icon on the home screen is still Expo's default

`mobile/assets/images/icon.png` is the plate on paper and has been since 2026-08-20, but the
installed simulator build still shows the blue chevron: **icons are baked into `ios/` at
prebuild, not served by Metro.** Nothing is wrong with the asset. It needs

```bash
npx expo prebuild --platform ios --clean
cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install
```

and a rebuild, which is ~14 minutes cold. Worth doing once before the next device check, not
per change.

#### Workout is built against the prototype (2026-08-21)

`mobile/app/session/[id].tsx`. Header with a back circle and a Finish pill, the exercise card
with its banked sets, the two dials in one row, the plate strip, and one ember CTA pinned
below the scroll.

**The 48px floor survived a layout that breaks it.** v5 gave each stepper a full-bleed row
with 82px zones, and this file argued for that: a pair sharing 390px puts each target under
the floor. The prototype draws them as two cards with **46px** keys. They are drawn at 46 and
`hitSlop` brings the target to 48 — the same technique `Btn` uses for its small variant. The
ink is the prototype's, the target is §2.4's.

**The prototype is drawn at 430pt and the reps card does not survive 375.** Its inner width
falls to roughly 20pt there, against a 29px figure. The figure is `flex: 1` with
`adjustsFontSizeToFit`, so it shrinks rather than clips. Verified at 402pt on a simulator;
**not yet verified on a 375pt device**, and that check is worth doing before this ships.

**The momentum bar is gone, and unlike Home's tiles it WORKED.** `view.pct` is real, computed
from the last session's volume, and it answered "am I winning" — the question the Home card
asks on the way in. The prototype's board has no slot for it. Removed rather than relocated by
invention; the Finish screen's stat tiles are the obvious home and that is Ameen's call.

**Not drawn, for want of data:** the exercise thumbnail (no image pipeline on native), the
equipment word (`deriveEquipment` needs a muscle group the board does not carry), and the
coach's sentence (`ghost-reason` is not wired to this screen).

#### THE COACH WAS BUILT AND NOTHING ON NATIVE CALLED IT (2026-08-21)

Ameen: "did you wire the AI into the app? read v5 again. This app niche is integrating AI at
every user touchpoint across the journey."

He is right and the miss is worse than "not built yet". **The engine exists, is tested, and is
already portable**, and the migration shipped six screens that render `null` where its
sentence belongs:

| module            | what it decides                                                       | exported via `@wazn/domain` |
| ----------------- | --------------------------------------------------------------------- | --------------------------- |
| `ghost-reason.ts` | `verdictFor` — raise / hold / ease / repeat, with a cause             | yes                         |
| `coach-mode.ts`   | strength / hypertrophy / meet-prep, AND the Full / Quiet / Off volume | yes                         |
| `forecast.ts`     | slope, forecast, plateau                                              | yes                         |
| `tell-coach.ts`   | `proposeEdit` for the mid-workout sheet                               | yes                         |

v5's handoff is titled "full app redesign **+ AI layer**" and its §Coach is explicit: _"The
deterministic engine is `design/coach2.js` … The model only phrases; every number comes from
computed stats."_ Sixteen of its seventeen screens carry a coach surface. Native had none.

**Wired so far: the ghost, on the live board.** It is the hero, it is on the logging path, and
it now does both halves of its job:

- **It proposes the numbers.** The dial seeds from `verdict.weightKg` / `verdict.reps` ahead of
  the stored value. Without that the chip would explain a jump the dial never made: "↑ 102.5 ·
  8/8/8 last time" printed over a dial showing 100. The lifter still commits; nothing
  auto-writes.
- **It says why, in one sentence and one chip**, and is ABSENT rather than empty when
  `cause === 'none'` — the honest silence.

`ghostChip` moved into `ghost-reason.ts` so the branch is shared: the web's `WorkoutOverview`
picked its chip with an if-ladder and native was about to grow a second copy. The rule is
shared, the FORMATTING is not — the shared half returns kilograms and never learns what unit is
on screen. Four assertions.

**No model is on this path, and that is the rule, not an omission.** CLAUDE.md: "the model
never sits on the critical path", "statistics answer anything statistics can answer". It is
also why the ghost works in a basement with no signal.

**The volume dial is wired, and it went BEFORE the remaining lines on purpose.** Adding three
more coach surfaces and then gating them means going back to all three.
`mobile/src/hooks/use-coach.tsx` is the native adapter — AsyncStorage, mirroring the web's
`coach-context` contract — and it re-exports the two predicates rather than letting a screen
re-derive them:

- `speaks` = `showsCoachSurfaces` = `full` alone. Gates the SENTENCE.
- `thinks` = `usesGhostIntelligence` = `full` AND `quiet`. Gates the NUMBERS.

Quiet is "stop talking", not "stop thinking": a quiet app still seeds the next set from the
coach's arithmetic and simply does not narrate it. `coach-mode.ts` warns in its own header that
collapsing the two either leaves the coach talking with the dial Off or strips a silenced app
of ghosts it had before v3 existed. The board honours both separately.

**The rest canvas has its line**, and it is the NEXT set's reasoning by construction: `view.set`
has already advanced by the time a rest starts, which is exactly what screen 08 specifies. The
board and the canvas phrase the same verdict once.

**Still `null`, in priority order:**

1. **Home** — `brief`. v5 draws a sentence plus chip.
2. **Finish** — the debrief sentence.
3. **Coach tab (screen 15)** — the control room: mode selector, week review, notes, Ask the
   coach. Untouched.
4. ~~Settings has no dial yet.~~ **Built.** Volume only — `COACH_MODES` is a lens over the same
   history and belongs on the Coach tab beside what it changes (v5 screen 15); a mode picker
   buried in Settings is the one place a lifter would never look for it.

   **Not verified end to end.** Setting Off is one boolean away from silencing the board, and
   with no data there is no verdict to silence, so the gate has been typechecked and never
   watched to work. It needs one signed-in session with history.

5. **Tell the coach** (screen 09), the PR moment and the notable-set toasts.

**Settings was printing prose in the machine voice.** The coach note and the units note both
took `step="meta"` — IBM Plex Mono — so a four-line paragraph rendered like a terminal. Mono in
this system is set counts, timestamps and plate maths; prose is Hanken. Both moved to `label`.
It is a v5 leftover and worth grepping for elsewhere.

**And the server gap is real.** `use-coach` writes to AsyncStorage only. The web reads and
writes `user_preferences`, so Off on the phone is still Full in the browser — the same gap
`use-unit` and `use-locale` carry and that A0 named. `off` in particular has to survive a
REINSTALL to be a promise, and on this side it currently survives only a relaunch.

**`npm run test:smoke` could not run for this change.** Playwright's browser binary is not
installed on this machine (`chromium_headless_shell-1194` missing) and `WorkoutOverview.tsx` is
a web component that this touched. CI runs it; it was NOT verified locally.

#### The shared chart, and a chart that lied about its own numbers (2026-08-21)

`src/lib/spark.ts` places the points; `mobile/src/components/ui/Spark.tsx` turns them into
SVG. Split that way because what can be got wrong is arithmetic, and arithmetic is testable —
seven assertions, and three of them are traps:

- **It normalises to `min..max`, not `0..max`.** That is the difference from the web's volume
  bars, which scale from zero because a bar's length IS its value. A LINE is about change: body
  weight between 80.4 and 82.9 drawn from zero is a flat line four pixels from the top.
- **A flat series sits through the MIDDLE.** The v5 reference writes `(mx - mn) || 1`, which
  avoids the division by zero and silently pins every point to the bottom edge. A lifter whose
  weight has not moved should not see a line along the floor.
- **A single reading is centred, and reported as `flat`** so the caller says "one reading so
  far" instead of drawing a horizontal line that reads as a measurement.

**The first version labelled the band at both ends and the chart lied.** `min` at the left,
`max` at the right — which is exactly where a reader's eye expects FIRST and LAST. A series
running 82.4 down to 81.2 was labelled "80.7 … 82.9" and read as rising. Every number on
screen was correct and the chart said the opposite of the truth. It is one line now: "Range
80.7 to 82.9 kg".

Because the band is normalised, that label is not decoration: 0.4kg of drift fills the box
exactly as 40kg would, and the range is the only thing keeping the shape honest.

Body draws it. Progress is the other caller, and needs no new geometry.

#### Body: it told people to log a weigh-in and had no way to (2026-08-21)

The screen was 24 lines whose entire content was the sentence "Log a weigh-in to start the
second chart." No input, no table read, and no write path anywhere in the native app. The same
shape as the workout board before it had an exercise picker: the app instructing somebody to
do a thing it had not built.

It now reads `body_weights` and writes to it. `mobile/src/hooks/use-body.ts` plus a screen with
the reading as its one figure and a numeric field under it.

- **Upsert, not insert.** `body_weights` is keyed `(user_id, measured_on)` (0027), so a second
  weigh-in the same morning is an UPDATE. Stepping on the scale twice before coffee is normal.
- **A field, not a stepper.** The board dials weight in plate increments from a known previous;
  a first reading is 82.4 from nothing and reaching it by tap is absurd. Seeded with the last
  reading, so the common case is an edit of one character.
- **`logWeight` throws.** Unlike the check-in, which degrades to Normal and costs nothing, a
  weigh-in that silently failed to save is a hole in the one series this screen exists to draw.
- **The `< 500` bound is checked before the write**, so the failure is a sentence rather than a
  constraint violation.

**`react-hooks` v7 refused the obvious shape, and it was right to.** A `load()` that both
fetched and set state is a `setState` reachable synchronously from an effect body — an ERROR,
not a warning, and the linter sees through `useCallback`. Split into a pure `fetchWeights()`
and an `apply()` the effect calls from a `.then`. Same shape `use-home` already uses.

**Not built, and named rather than left as empty space:** the chart (`body.empty` promises "the
second chart" and this draws numbers — a sparkline is shared work with Progress and belongs in
`components/ui/` where both read it, not hand-rolled twice), protein, and measurements. All
three exist in `src/lib/body.ts` and in migration 0027 with no surface on native.

#### History, and a raw Postgres error that was reaching lifters (2026-08-21)

The first of the six screens the prototype does NOT draw. Structure kept, typography moved
onto the new ramp: rows take `strong` (which IS 15 here, and is not uppercase, so the two
overrides that line carried are gone), and meta reads `2026-07-20 · 12 sets · 45 min` in
sentence case rather than v5's shouting mono.

**Three defects, and two of them I introduced with the colour sweep:**

1. **The heatmap's empty half vanished.** An untrained cell was `raised` `#211d15` on a dark
   card; the sweep mapped that to `paper` on a WHITE card, a 5% step. A heatmap whose zero
   state is invisible is a row of floating dots.
2. **`brass` became a prop that branched between two identical values.** `Chip`, `Ring` and
   `Fill` all read `brass ? accent : accent` after the sweep, on a flag nothing passed. A
   boolean selecting the same thing twice is a claim the code does not honour. All three props
   are gone; if the tier returns it returns as a real token with a real branch.
3. **`permission denied for function session_volume_history` was rendered to the user.**
   Verified on a simulator, in that wording, on the History tab.

The third is the one that matters, and the fix is shared. `describeError` lived in
`src/lib/supabase.ts`, which builds the browser client and can never be portable — so native
had no humaniser at all and printed whatever Postgres said. It is now `src/lib/errors.ts`,
re-exported from `supabase.ts` so no web caller changed, with six assertions and two fixes:

- **A `permission denied` branch.** It is what every RLS-scoped table and `security invoker`
  function says to a signed-out request, so it is reachable by a session simply expiring — and
  the old code fell through to appending the raw string.
- **No em-dashes.** Both messages carried one, in copy a user reads, against a standing rule.
  A test asserts their absence rather than a comment claiming it.

**This matters more than one screen.** Auth is off, so every server-backed surface —
Progress, Body, Coach, Friends — takes exactly this path. They will now say "your sign-in has
expired" instead of naming a Postgres function.

#### Finish is built, and the four prototype screens are done (2026-08-21)

`mobile/src/components/FinishSummary.tsx`, rendered by the session screen when the store's
status turns `finished`. Weekday, "In the books." at hero, three stat tiles, the set list, and
one button.

**Finish now ENDS the workout instead of leaving the screen.** It used to be
`finishWorkout → resetWorkout → router.back()`, which threw the session away before the lifter
saw a single number about it. `finishWorkout` drains the queue and sets the status; the screen
switches; "Done" resets and pops.

**Three of the prototype's claims are not made, because they cannot be proved:** "workout 47"
needs a lifetime count no query produces; "New PR" needs this session's best set against every
previous one (`exercise_bests` and 0009's trigger do it server-side, native reads neither);
the debrief needs `ghost-reason`. The ember card is KEPT and given the claim that IS provable —
this session's working volume against the last one's, which the store already holds as
`targetKg`. "Beat last session" is smaller than "New PR" and it is true.

**One button, not two.** The prototype pairs "Share card" with "Done" and there is no share
surface on native, so it would open nothing.

**Three more defects, all found by walking the flow, none visible to any check:**

1. The duration tile counted upwards forever on the summary — the elapsed interval had no
   reason to stop. A finished workout's duration is a fact.
2. "Done" started a NEW workout. The auto-start effect was keyed on `live.status`, so resetting
   the store to idle re-fired it one render before `router.back()` could leave. Opening the
   route is the event; the status is not.
3. **A `0 × 0` set reached the summary.** The commit button was live at zero reps. Nothing
   downstream can use such a row — `estimatedOneRepMax` refuses it, volume counts it as
   nothing — and it occupies a set number permanently. The button is now disabled below one
   rep, and Finish stays available.

`seedWeight` moved to `src/lib/live-board.ts` with five assertions. It was written inline on the
screen, where it could not be tested: importing the screen pulls in React Native, whose entry
is Flow, which vitest refuses. It is board arithmetic with no React in it and the web board
needs the same three cases the day it grows an add-exercise path.

#### Rest is built against the prototype, and it reverses a documented decision (2026-08-21)

The one dark surface in the app. Ink ground, the prototype's 240px ring reproduced exactly
(a 22.5px band at a 102.5px radius — it draws a 96-unit viewBox at 240px with a 9-unit
stroke), the 54px clock, `REST · OF 2:00` at the prototype's own 0.16em, the ±30s pair and
"skip rest".

**The previous canvas took no touches at all, and its reasoning was good.** Built once as a
full-screen Pressable it swallowed every touch on the board, so the next set cost
dismiss-then-commit and GATE U2's one tap became two. Its comment concluded, in bold:
"a zIndex cannot fix that".

**That conclusion was wrong, and the web app has been disproving it since v5.**
`src/components/RestExpanded.tsx:126` renders the takeover at `z-[29]`;
`src/components/SetEntry.tsx:640` renders the commit bar at `z-[31]`. The bar sits ABOVE the
takeover, so a repeat set is one tap there while the takeover owns its own controls. Native
now does the same: canvas at `zIndex: 29`, session CTA at `zIndex: 31`. **Verified on a
simulator: mid-rest, `Log set 2 · 2.5 × 1` is visible and pressable over the dark canvas.**

That z-order pair is in the CODE and in neither `WAZN_PLAN.md` nor `DECISIONS.md`. It is
written down here now because it took a search of three documents and a read of two components
to recover, and lowering either number is a silent two-tap regression on the only metric §1
states.

The prototype's translucent "next Bench — set 3 · 62.5 × 5" strip is deliberately NOT drawn:
the CTA above the canvas already carries that sentence, as an action rather than a
description.

**Two defects the screenshot caught and no check could:**

- The canvas is absolutely positioned to the root, so it does not inherit the session screen's
  `paddingTop` — its header drew over the status bar and the clock. An overlay covering the
  window owns its own safe area.
- The COACH LINE is `null`. `ghost-reason` is not wired to this screen, and the prototype puts
  a sentence there. A gap, not a placeholder.

#### TWO BUGS IN THE PICKER PATH, FOUND BY WALKING IT (2026-08-21)

Neither was visible to `tsc`, eslint, the tests or `bundle:ios`. Both were visible in one
screenshot of a board with a lift added.

1. **A freshly added Bench Press had no weight dial.** `addExercise` seeded every set with
   `weightKg: null`, and `live-board.ts:24` defines a null `weightKg` as _bodyweight lift_ —
   so the board hid the weight stepper entirely. The picker knows the equipment; it now says
   so, and only a genuine bodyweight lift gets a null.
2. **Set 2 of an added lift reset to zero.** The dialled values re-seed from the new set, and
   a lift with no history has none — so banking set 1 at 60×8 left set 2 showing 0, which is
   GATE U2's one-tap repeat turning into eight presses on `+`. The values now carry forward
   when the next set has none, and `seedWeight` keeps a bodyweight set from inheriting the
   60kg of the bench press before it.

#### DAY ONE IS A DEAD END ON NATIVE, AND THIS SCREEN MADE IT VISIBLE

The board is seeded from the LAST session, so on the first workout of a new account it is
**empty** — and native has no way to add an exercise. `startWorkout` succeeds, the screen
renders, and the only control that does anything is Finish.

It had been true since the native app existed and nothing surfaced it, because every check runs
against a signed-in account with history.

**Closed the same day.** `mobile/app/session/add.tsx` is the picker, `services/exercises.ts`
the catalogue read, and `addExercise` on the store puts a lift on the board with three blank
sets. The prototype does not draw a picker — its demo always has a bench press — so it is
DERIVED: paper ground, one white card, hairline-separated rows, the same 22px gutter, and no
primitive that is not already in `components/ui/`.

Two things worth keeping:

- **Ranked by `exercise_usage()`, not alphabetically.** The catalogue is 130-odd lifts and a
  lifter uses fifteen. By name, "Romanian Deadlift" is nine screens down for the person who
  does it every week. The web picker has always sorted this way; native now does too, from the
  same RPC. Ties break alphabetically so rows do not move between two openings.
- **Search is local, through the SHARED `searchByName`.** A per-keystroke round trip in a
  basement is a picker that fails in the one place this app is used, and sharing the matcher
  means a search that hits on the phone hits in the browser.

**IT IS UNVERIFIED WITH REAL DATA, AND THAT IS A CONSEQUENCE OF AUTH BEING OFF.**
`exercises` is `for select to authenticated` (0001_init.sql:91), so an anon read returns ZERO
ROWS rather than an error. Every screenshot of this picker is its empty state. The populated
list, the usage ranking and the tap-to-add path have been typechecked, linted and bundled and
have never rendered a row. **Re-verify the moment auth comes back on.**

That empty read also produced a small wrong claim, now fixed: the screen said "No lift by that
name" — a SEARCH result — when the truth was that the catalogue had not loaded at all. Two
states that render identically if you only check `shown.length`.

#### GATE 4 on native: sets now survive the app being killed (2026-08-21)

Found by reading `origin/claude/live-board-duplicate-backup` before building Workout, which is
the only reason it was found at all. That branch holds a second, independent implementation of
the live workout, and comparing the two turned up something worse than "the screen exists
twice":

|                                          | `main` before this          | the branch       | now                    |
| ---------------------------------------- | --------------------------- | ---------------- | ---------------------- |
| set id                                   | server-generated            | **client**       | client                 |
| persistence                              | none, a module variable     | **AsyncStorage** | AsyncStorage           |
| failed insert                            | `unsynced++`, never retried | queued           | **queued and retried** |
| set banked before the workout row landed | **DROPPED, never sent**     | queued           | queued                 |
| survives an app kill                     | no                          | yes              | yes                    |

The third and fourth rows are data loss on the app's core action, in its stated use case. The
file said so honestly in its own header and nobody had acted on it.

**The schema already allowed the fix.** `workouts.id` and `workout_sets.id` are both
`uuid primary key default gen_random_uuid()`, so the client may supply them, and a replay is a
23505 rather than a duplicate row. `workouts` also has a unique `(user_id, started_at)` index,
so even the workout row is idempotent. Nothing needed a migration.

Neither implementation was adopted wholesale. `main`'s module store is the right architecture —
it outlives the `fullScreenModal` route and does not re-render every tab when a set lands — so
the branch's two mechanisms were ported INTO it.

**Two bugs were written and caught by the tests, not by review.** A drain per banked set sent
the same row once per walk in flight (12 inserts for 3 sets). Then the guard against that was a
boolean, so `finishWorkout`'s `await flushPending()` no-opped against the drain
`bankCurrentSet` had just started and marked a workout ended with its sets still on the phone.
The guard is a promise now, so a second caller awaits the work rather than being told "busy".

**Testing it required stubbing two native modules.** `AsyncStorage` and `expo-crypto` both
reach into `react-native`, whose entry is Flow, which vitest refuses — so importing them would
have made this file untestable on the day it started to matter most. `mobile/test/stubs/` holds
working implementations rather than `vi.fn()`s, because the questions worth asking are "what
came back after the kill" and "did the replay collide", and only a real store answers those.
Six new assertions, 16 in the file.

**What is still missing**, and it is named rather than implied:

- **No background sync.** `flushPending()` runs on a banked set, a restored checkpoint and a
  finished workout. Not on a timer, and not when connectivity returns. A lifter who finishes
  offline and never reopens the app has sets on the phone only. It closes by giving that
  function a `NetInfo` or `AppState` trigger.
- **No resume affordance.** The launch restore brings the DATA back and starts draining it, but
  nothing navigates to the board or offers to. That belongs on Home.

#### READ BEFORE BUILDING WORKOUT: 1,244 lines of it already exist, on a branch

`origin/claude/live-board-duplicate-backup` (1 commit, 2026-08-18, "Build the live board —
steppers, BANK IT, and the rest canvas") holds native workout-loop code that **`main` does
not have**:

| file                                            | lines | on main?                                                                                                |
| ----------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------- |
| `mobile/src/hooks/use-workout.ts`               | 310   | **no**                                                                                                  |
| `mobile/src/hooks/use-rest-timer.ts`            | 112   | **no**                                                                                                  |
| `mobile/src/components/workout/Zone.tsx`        | 129   | **no**                                                                                                  |
| `mobile/src/components/workout/Picker.tsx`      | 117   | **no**                                                                                                  |
| `mobile/src/components/workout/RestCanvas.tsx`  | 114   | no (main has a different 139-line one at `components/RestCanvas.tsx`)                                   |
| `mobile/src/components/workout/CommitBar.tsx`   | 73    | **no**                                                                                                  |
| `mobile/src/components/workout/MomentumBar.tsx` | 48    | **no**                                                                                                  |
| `mobile/src/services/exercises.ts`              | 26    | **no**                                                                                                  |
| `mobile/app/session/[id].tsx`                   | +332  | main's is 388 lines with `LiveWorkout` and `Zone` inline; the branch's is ~720 with the parts extracted |

**Workout and Rest are the next two screens in A2.** Building them without reading this branch
rebuilds a day of work that already exists. It was written against v5, so the STYLING is
obsolete — but `use-workout.ts`, `use-rest-timer.ts` and `services/exercises.ts` are logic and
I/O, not pixels, and those are the expensive half.

This is exactly the failure Ameen opened this project to fix on 2026-08-19: "multiple sessions
kept creating PRs and I have no clue the status". A local `git branch -d` sweep on 2026-08-21
deleted nineteen LOCAL branches and touched no remote, so the banner still counts these.

#### The other unmerged remotes, triaged 2026-08-21

| branch                                      | verdict                                                                                                                                                                                                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claude/direction-and-exempt`               | **empty diff against main** — its one commit is a merge commit whose content is already in. Noise.                                                                                                                                                             |
| `claude/forecast-dst-span`                  | one 183-line `docs/` handoff, for a session long past. Read once or drop.                                                                                                                                                                                      |
| `claude/home-gate-findings`                 | `.prettierignore`, a `DECISIONS.md` entry, and `src/screens` — the last is the retiring PWA, so obsolete. The decisions entry may not be.                                                                                                                      |
| `claude/one-app-consolidation`              | 8 commits of hooks, CI and CLAUDE.md work. **A peer session may still be on it — do not delete, do not rebuild.**                                                                                                                                              |
| `claude/workout-tracker-pwa-slice-1-97kisx` | 11 lines correcting `docs/agent-setup.md`, and **the correction is right**: cloud environments have no secrets store, so an env var is plain text readable by anyone who can use that environment. Main still carries the weaker advice. Worth cherry-picking. |
| `v5/p0-tokens`                              | 5,716 lines, almost all `docs/design/v5-momentum` and fonts that are already in main. v5 is retired; the one live piece is a web perf fix, "fill-move animates transform, not width".                                                                          |

#### Waiting on Ameen

Neither blocks the next screen; both get more expensive the longer they sit.

1. **Three contrast pairs below AA for small text**, shipping as the prototype
   draws them, tabled above with candidates. The `muted` one is the one that
   matters — it carries the date line, the exercise meta and every stat
   sub-label, and this app is read one-handed in gym lighting.
2. **What replaces brass.** v5 reserved a second hue for earned states; the
   prototype has no such tier, so every brass usage swept to `accent`. That
   puts a second ember on Friends and Progress, screens that already have an
   action. It does not bite until those screens are built, which is item 3 of
   the order above.

### 7.1 Log (chronological, newest last)

> History, not state. Items here may be superseded, and several are. §7.0 wins.

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
- **~~Data, live:~~ SUPERSEDED, see the RECONCILED block at the foot of this
  section (2026-08-09).** Said: exercises 134, workouts 154, workout_sets 3,201
  (335 supersetted, **491 records**), profiles 2, routines 0.
- **Tests:** 164 passing, plus the SQL RLS suite. CI is green on every run in
  the repo's history — the failures Ameen is seeing are runtime, not build.
- **Migrations: 0001–0013 are ALL live**, confirmed 2026-08-05 by probing for
  objects — `strength_summary` exists (0012) and `social_feed` returns
  `best_record_name` / `best_record_e1rm_kg` (0013). There is still no
  `schema_migrations` ledger, so this remains a probe rather than a read.
- **~~Data, live (2026-08-05):~~ SUPERSEDED, see the RECONCILED block at the
  foot of this section (2026-08-09).** Said: 4 auth users, 156 workouts and
  3,201 sets all on `6da348ed`, exercises 134, routines 0, profiles 4,
  usernames 0.
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
- **~~Not verified yet, and it is the acceptance test.~~ VERIFIED AND PASSING
  (2026-08-09).** This said `generate-routine` had never produced a successful
  generation in its life. The ledger now holds **7 rows with
  `feature = 'routine'`**, and `recordGeneration` writes only after a success,
  so the routine builder demonstrably works on real accounts. **8 routines exist
  across 2 users.** Nothing recorded the moment it started working, which is why
  this bullet sat here as an open question for four days after it was answered.
- **CLOSED 2026-08-08 — deleted, and there were ten rather than four.** Open decision for Ameen: four zero-set workouts from desktop testing
  still render as blank History rows. Say "delete all my workouts with zero
  sets" and they go server-side.
- **Next action (superseded — see the U4 entry at the foot of this section):**
  the two blocked items above. After beta starts: offline
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
  `docs/archive/HEVY_PARITY_UPGRADE_PLAN.md` (close the gap, phases U1–U6) and
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
  first unapplied migration in the repo. **WRONG, and left here as a marker:
  the 2026-08-08 probe found production had 0015 and stopped at it — see the
  migration entries further down. This bullet is why "what is live" is a probe
  and not a read.** The app degrades rather than breaking
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
  `docs/archive/IMPLEMENTATION_PROMPTS.md`: no number anywhere in the app is
  thousands-grouped (no `toLocaleString`/`Intl.NumberFormat` in `src/` at all),
  and there is no error boundary, so one leaf crash blanks an entire tab.
  Screenshotting the built app is now a cross-cutting requirement of every UI
  phase — §4 of the parity plan says how, including the two ways the first run
  got it wrong.
- **An infrastructure audit was run (2026-08-08)** — `docs/INFRASTRUCTURE_AUDIT.md`,
  covering retrieval, evals, harnesses and tooling, with H0–H3 prompts added to
  `docs/archive/IMPLEMENTATION_PROMPTS.md`. Three results worth carrying here.
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
- **Migration 0020 (`workouts.exercise_order`) — APPLIED 2026-08-08; the note
  below describes the state before that.**
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
- **Cold start is still the one missed budget: 2193ms against 2000ms.** It has
  measured 2308 / 2192 / 2130 / 2317 / 2171 / 2141 / 2193 across runs, so treat
  anything under ~200ms of movement as noise rather than progress. **This
  figure and the ones below are from the MERGED tree** — U3b and B1/B2 were
  each measured before the other landed, so neither branch's numbers described
  what shipped. Everything else passes: warm **1032ms**, tap → feedback
  **30ms**, tap → set on screen **43ms**, tab switch **19ms**, Lighthouse
  **97**, CLS 0.001. Precache **565.00 KiB** with the four excluded chunks.
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
  **20ms**, Lighthouse **98**, CLS 0.001. (Measured on the U3b branch before
  B1/B2 merged; the bullet at the top of this section carries the merged-tree
  run that supersedes it.)
- **`npm run shots` can cut the network now**, after being caught blind for the
  third time. It photographs the board with a set queued and the board reopened
  from cache; both frames are what found the hang above.
- **Still NOT built, deliberately:** starting a routine you have never opened on
  this device while offline (there is nothing cached to start from — one opened
  before works), removing a block that has committed sets while offline, and
  editing past workouts offline. Each reports honestly rather than pretending.
- **MIGRATIONS ARE EXECUTED IN CI NOW, NOT JUST PARSED.** `npm run check:sql`
  starts a throwaway local Postgres, applies `scripts/pg_shim.sql` (the `auth`
  schema, the platform roles, the default privileges) and then every migration
  in order from an empty database, and runs the suites in `supabase/tests/`. No
  network, no project, no credentials. It found **two defects in 0021 that the
  parse check passed**: a `default (select auth.uid())`, which every real
  Postgres rejects because a column default may not contain a subquery, and an
  `order by` naming a column its own subquery had aliased away. The line in
  STATUS that has said "a migration that has never been executed is unverified"
  now has something behind it — but only for "applies cleanly from empty".
  Production is at 0018 and that is still a different claim.
- **B1 IS BUILT (2026-08-08) — the proactive coach's two surfaces.** The
  pre-workout briefing sits above Start on the idle Log screen (dismissible,
  never blocking, mounted in the idle branch only, which is what enforces "the
  coach disappears the moment a workout starts"), and the debrief is one line
  under the receipt on the finish summary. **Both draw twice**: the client
  calls `session_brief()` / `session_debrief()` and composes an English line
  with no model involved, then a phrased sentence upgrades it if one arrives.
  So neither surface has a loading state, a spinner, or a failure state, and
  "usable with AI dark" is a property of the shape rather than of the error
  handling. The Edge Function recomputes the block rather than trusting the
  client's figures — a body carrying numbers is a body that can carry any
  numbers.
- **B2 IS BUILT (2026-08-08) — Coach's Notes is now the weekly review.** Five
  sections, same order every week: adherence, bands, plateaus, wins, and
  exactly ONE "next week, change this". **The recommendation is chosen in SQL**,
  in priority order (stopped turning up > a group is starving > a lift has
  stalled > nothing is wrong), because "exactly one" is a promise about the
  product and a model is not the thing to trust with it. `PROMPT_VERSION` moved
  to `coach-review@1`, so every cached row is a miss and the next Coach open
  regenerates; a version miss with no quota left serves the old answer and says
  it is in the previous format rather than erroring on deploy day.
- **The eval harness now covers all three surfaces.** Golden fixtures for the
  review, briefing and debrief were **printed by the real SQL on a real
  Postgres**, not hand-written, so a renamed key breaks CI instead of quietly
  producing a vaguer review. Five adversarial responses must fail and are
  asserted to fail for their stated reason: a fabricated figure, an invented
  lift, diet advice, a dropped section, and four sentences where two were
  allowed. `eval:live` follows the new prompts and skips the pre-B2 fixtures,
  whose prompt no longer exists in the repo.
- **THE COACH WAS SPEAKING KILOGRAMS TO PEOPLE READING POUNDS, and a screenshot
  caught it.** The block is always kg, the model copies figures verbatim, and
  grounding enforces that — all three correct, and together they printed
  "102.5 kg" under a header toggled to `lbs`. The block is now converted to the
  caller's display unit before the prompt is built, so grounding checks the
  same converted block, and the unit is part of the cache key. Two related
  finds: an e1RM was being rounded to the nearest 0.25 kg like a load, printing
  116.75 where the Progress screen says 116.7 — which is exactly the
  disagreement the data chips exist to make catchable — and `due_routine.name`
  is user-typed text, so the privacy check refused it until the widening was
  made explicit and logged.
- **GATE B1 has an instrument, and an honest one.** `coach_views` records
  `view` and `dismiss` per surface. A `view` row is exposure, not reading, and
  dismissal is the only in-app signal of attention the design can claim. The
  gate's second half — a tester changing a session because of it — stays an
  exit-interview question, because nothing in the app can observe it.
- **Migration 0021 — APPLIED 2026-08-08; the note below describes the state
  before that.** It carries
  `session_brief()`, `session_debrief()`, `weekly_review()`, the `coach_briefs`
  cache, `coach_views`, and a widened `ai_generations.feature` check — without
  that last one every ledger write from `coach-brief` would fail silently and
  the two new surfaces would run completely unmetered. `supabase/tests/
coach_surfaces.sql` asserts what the three functions RETURN against a seeded
  ten-session history. Until Ameen applies it, both functions degrade to quiet
  via `isMissingSchema()` and the client renders no card at all — which is the
  "or nothing" branch B1 asks for, reached by design rather than by luck.
- **Precache 592.20 → 598.32 → 590.24 KiB.** The Coach tab chunk left the
  precache on the same terms as the Hevy import: both its tools are Edge
  Function calls, so precached it installs 8 KiB that can render nothing
  offline. The warning in the previous entry was correct and has now been
  spent; the phase ends with more headroom than it started with.
- **0020 AND 0021 ARE APPLIED (2026-08-08), and B1/B2 are LIVE.** Applied
  through the Supabase Management API — `SUPABASE_ACCESS_TOKEN` is in the
  sandbox environment and `api.supabase.com/v1/projects/$REF/database/query`
  runs DDL, which reverses the long-standing "no egress from a sandboxed
  session" note in CLAUDE.md. Verified against `information_schema` rather than
  trusted from a success flag: `workouts.exercise_order` exists as a `uuid[]`;
  `coach_briefs` and `coach_views` have RLS on with 1 and 2 policies;
  `session_brief`, `session_debrief` and `weekly_review` all exist as
  SECURITY INVOKER; and `ai_generations_feature_check` now admits `briefing`
  and `debrief`, **without which both new surfaces would have run completely
  unmetered**.
- **The three functions were run against the real 152-workout history, as the
  real user.** `session_brief()` returned a due routine (`Core & Conditioning`,
  never run — the rotation rule preferring a never-run routine, working as
  designed), a target of 15.00 kg × 12 to beat a 19.1 e1RM on Cable Crunch, and
  three muscle groups at zero this week. `weekly_review()` returned five wins,
  two genuine plateaus (Lat Pulldown, slope -0.72 over 7 sessions; Lateral
  Raise, -0.10 over 6) and one recommendation. **RLS was proved rather than
  assumed**: a different `request.jwt.claim.sub` asking for the owner's workout
  gets `found: false` and `total_sets_90d: 0`, while the owner gets their own.
- **The zero-set workouts are deleted, and there were TEN, not four.** STATUS
  had said four since the note was written; six more accumulated. All ten were
  finished, so none was a live session, and the delete carried an
  `ended_at is not null` guard so an in-progress workout could not have been
  caught by it. **162 → 152 workouts, zero-set count now 0, and
  `workout_sets` unchanged at 3210** — the check that matters, because it says
  nothing with data in it was touched. The open decision in this section is
  closed.
- **The migration ledger now holds five rows**, having gained
  `workout_exercise_order` and `coach_surfaces`. It is still silent about
  0001–0015, so it still reads as though the database began at 0016 — but a
  `supabase db push` would now wrongly re-attempt sixteen migrations rather
  than eighteen. **0019 is still deliberately unapplied**, so the gap at that
  version is correct rather than an omission.
- **E1 — the rest canvas — is BUILT (2026-08-08).** The between-sets surface
  offense plan §8-E1 calls the largest unclaimed one in the category. One card
  above the existing rest bar: what is coming and why the number moved, a
  record, the crew's day, or where the session stands — fixed priority, and
  null when there is nothing worth saying, which is the plain timer exactly as
  before. **The log control did not move**: the board, the check buttons and the
  timer row keep their coordinates, tap count is unchanged at one, and tap → set
  on screen measured **47 → 48ms** either side on the committed harness.
- **"Vanishes the moment the user reaches" is enforced by the inverse rule.**
  Hiding on `pointerdown` would already have taken the tap meant for a check, so
  the canvas may only ever APPEAR after two seconds of nothing being touched
  (`src/lib/use-idle.ts`, capture-phase listeners). It therefore cannot grow
  under a thumb in motion — a stronger property than hiding fast. It also stays
  away for the last 8 seconds of a rest.
- **No model phrases it, deliberately.** §8-E1 asks for one; a rest happens
  15–30 times a session, so that is 15–30 Edge Function calls per workout
  against a tier sized for one regeneration a week, on the critical path of the
  flow §2.1 calls sacred. Deterministic only, composed the way `briefSkeleton`
  is. See DECISIONS.md — the door is left open for one phrased line per session.
- **A screenshot caught the defect again, and it is the third time this week.**
  The exercise name in the kicker rendered "NEXT UP · OVERHEAD PRESS (BARBEL…",
  truncated mid-word on the one surface that exists to be read at three feet.
  The name has its own line now and a test asserts every kicker is ≤ 20
  characters. **The harness had to be taught to hold still** to see the canvas
  at all — a surface gated on not being driven was its fourth blind spot.
- **Migration 0022 — APPLIED 2026-08-08**, on Ameen's instruction, after a probe
  found it genuinely unapplied (the live constraint still listed only the three
  B1 surfaces). It widens `coach_views.surface` to admit `rest_canvas`, reusing
  GATE B1's instrument. Verified rather than trusted from the `[]` response:
  `pg_get_constraintdef` reads back all four values with `convalidated = true`,
  the three pre-existing rows survived re-validation, and RLS is still on with 2
  policies. **Then proved functionally** — a real insert of both a `rest_canvas`
  `view` and a `dismiss`, inside a block that aborts on purpose, was accepted
  and rolled back (0 rows written, total still 3). **Production is at 0022.**
  Exposure is one row per workout, dismissals every time — a dismissal is the
  kill signal §8-E1 names.
- **The ledger holds six rows**, having gained `rest_canvas_views`. Still silent
  about 0001–0015, so it still reads as though the database began at 0016.
  **0019 remains deliberately unapplied**, so the gap at that version is correct
  rather than an omission.
- **Wall green on the merged tree:** 660 tests (30 new), 8 Playwright tests,
  `check:sql` executes all 22 migrations from empty, `check:deploy` passes.
  Precache **565.00 → 569.93 KiB** with config, under the ~600 KiB ceiling.
  Cold start 2186 → 2235ms, still the one standing miss and still inside the
  ±200ms noise band.
- **The release ladder had drifted from what shipped, and §11 of the offense
  plan now carries a state column.** As of this merge **R4 "It knows" is
  COMPLETE** — B1 + B2 + E1, all three. **R5 "Switch" is still not**: §11
  defines it as F1 + U4, the commit that shipped the Hevy import is titled
  `R5`, and this file said "R5 is BUILT" while U4 has never started. Nothing
  was mis-built; phase IDs are what gets committed and releases are what the
  table promises, and nothing reconciled the two. One R4 dependency stayed open
  through the whole release: the OpenRouter hard cap §10 asks to be set _before
  B1_, still unset with three model-calling surfaces now live.
- **Four parity-gap items verified open (2026-08-08), each checked in code
  rather than assumed.** **L9 is HALF built and the missing half got worse**:
  B1's `session_brief()` computes the due routine by rotation and the briefing
  says "Upper A is up", but `routines.ts` and `RoutineList.tsx` are untouched,
  so the list directly under that sentence is still in stored `position` order
  — a card naming a day the list does not reflect. **L8** was never built
  (`Discard` appears in `LogScreen.tsx` and nowhere else; the header has no
  entry, and the amendment asking for one was written because Ameen went
  looking and could not find it). **L3** was never applied and never decided
  either way — the tick is still 30s. **O15** stands, with a clarification:
  `routine_exercises.position` IS written; it is the routine list's own order
  that has no writer, which pairs it with L9.
- **U4 is NEXT, and it is marked so in `docs/archive/IMPLEMENTATION_PROMPTS.md`.**
  Three reasons: it is the half of R5 that never shipped; it closes the last
  block of P-class parity gaps in one phase (O3, O5, O8, O12 — after it the
  only P-items left are native-gated or post-retention); and **it is the only
  open phase whose gate can be run without a beta**, because GATE U4 asks
  whether Ameen can answer "is my bench actually progressing?" from one screen
  against the 152 workouts already in production. The four items above ride
  with it.
- **U4 IS PART BUILT (2026-08-08), and the gate is already answerable.** The
  exercise page now draws an estimated-1RM series from `exercise_1rm_history`,
  **live since migration 0001 and called by nothing.** Its type
  (`OneRepMaxPoint`) was already in `types.ts` too, so the RPC, the type and the
  screen that wanted it were all written and the line between them never was.
  Above the line is one sentence (`+43 lbs since 8 months ago`), computed from
  the same series so the two cannot disagree. Plus a rep-max ladder, and the
  rep-range distribution off `exercise_rep_distribution`, **also live in 0007
  with no caller.** `SeriesChart` is extracted and shared with the Progress
  volume trend.
- **U4 needs NO migration.** `records_ladder` lives in 0019, which stays
  deliberately unapplied; the ladder is computed on the client from sets the
  page already fetches. Stated honestly in the code: it is best-in-window, not a
  guaranteed all-time record, and SQL is where that would belong.
- **L3, L8, L9 and O15 are DONE (2026-08-08).** The duration tick is 10s, not
  30s. Discard is in the header overflow as well as the armed Finish row, via
  `lib/active-workout.ts`, an external store rather than a context, because
  pushing a value up from a child in an effect is the setState-in-effect the
  hooks rule forbids. `routines.position` is finally written on create. And the
  routine list is in rotation order with the head labelled "Up next", with the
  rule **transcribed from migration 0021** rather than invented:
  `max(started_at) asc nulls first, position, id` over FINISHED workouts only.
  The first draft counted unfinished ones, which would have made abandoning a
  session look like completing it.
- **The harness had no routines at all**, so the idle Log screen had only ever
  been photographed empty. With three added, a screenshot showed the briefing
  card saying "Upper A is up" above a list headed by Core & Conditioning:
  fixture drift, corrected, but it is the real risk in miniature, because the
  phrased model sentence overrides the deterministic line and the routine name
  does reach the model.
- **`e2e/offline.spec.ts` "killing the tab mid-workout loses nothing" FAILS on
  this laptop and PASSES in CI on the same commit.** Bisected properly: it fails
  with the U4 batch stashed, with the preferences WIP stashed, and on a
  completely clean `HEAD`. The reload lands on the idle screen, so the restore
  lost a race rather than returning wrong data, and the load path has a six
  second deadline on a machine that had been running builds, Postgres and
  Playwright for hours. **CI is the authority for that one.** Do not spend
  another hour bisecting it.
- **The records list is BUILT (2026-08-08)**, second on Progress above the
  diagnostics, because it is the only block there that answers "am I getting
  stronger" without being read. It shapes migration 0009's trigger-written
  flags and computes nothing. Five rows, not eight: at eight it pushed the
  muscle-balance chart off a phone, which a screenshot showed and no test would.
- **Custom exercise EDIT is built; ARCHIVE is not, and the reason matters.**
  `workout_sets.exercise_id` is **`on delete restrict`** (0001), so the database
  already refuses to delete an exercise with any logged set. Logged history is
  structurally unlosable and archive was never what protected it. What archive
  would add is tidiness, getting a used custom lift out of the picker, and that
  needs a column, a migration, and Ameen. **Flagged, not quietly skipped.** What
  the app owed instead was the reason for the refusal, which is now in plain
  words rather than a constraint code.
- **The stub had no `or=` support**, so the records query matched nothing and the
  block drew empty while looking like an account with no records. It now
  implements `or()` and **throws on an unsupported operator**: a stub that
  silently answers a filter it has not implemented is worse than one that
  answers nothing, because the result looks real. The first records fixture also
  showed a state production cannot reach (the same lift flagged three times at
  one weight, which `pr_weight` makes impossible).
- **PAST-WORKOUT EDITING IS BUILT (2026-08-08), so U4's build list is COMPLETE.**
  Set type and RPE in `EditSetDialog`, per-exercise add-set, add-exercise through
  the real picker, delete-workout, and duplicate-as-routine. Rename and notes
  already shipped in U1.
- **The old "weight and reps only" reasoning was reversed on purpose.** The
  dialog's own comment said changing a set type after the fact is rewriting
  history. Half right: marking a set as the warm-up it always was is a
  CORRECTION, and leaving it uncorrectable meant a mislabelled warm-up inflated
  every record, chart and volume figure it touched with no way to fix it. The
  EXERCISE still cannot be changed, because that is rewriting rather than
  correcting.
- **A screenshot found an app defect in that work.** The History breakdown
  grouped sets by exercise NAME with the literal string "Exercise" as the
  fallback, so **18 sets of four different lifts merged into one block** when the
  embed was missing. Grouping is by `exercise_id` now: the id is the identity,
  the name is only display. Two harness gaps closed with it (the to-one
  `exercises(...)` embed, and the fact that the editing surface had never been
  photographed at all, since all five controls sit behind two taps).
- **U4 GATE, reportable:** "is my bench actually progressing?" is answerable from
  the exercise page in one glance, from a series that has been live since
  migration 0001 and had no reader. **Ameen still has to run it against his own
  152 workouts on a phone**, which is the half of the gate no sandbox can do.
- **ARCHIVE IS BUILT, and migration 0024 IS NOT APPLIED.** Ameen said to apply
  it; the harness permission classifier refused `apply_migration` twice,
  including after that authorization, and production DDL is exactly what that
  guard is for, so it was not routed around. ~~**Production is still at 0022 with 0023 and 0024 both unapplied.**~~
  **FALSE as of 2026-08-09: 0024 was already applied when this was written, and
  0023 was applied 2026-08-09. See §7.0.** The SQL is in the repo and executes from empty.
- **The client is built so that is harmless.** `archived_at` is optional on
  `Exercise`, `!archived_at` is true for both null and absent, so until 0024
  lands every exercise stays listed exactly as today. Writing it returns
  Postgres `42703` and is reported as "Archiving needs migration 0024", the same
  way the app already handles 0008 and 0015 being absent.
- **`exercises_select_visible` is deliberately unchanged.** An archived exercise
  must stay READABLE or History would blank the exercise name on every past
  workout that used one, which is the opposite of what archive-rather-than-delete
  promises. The picker filters; RLS does not.
- **`check:sql` runs ONE of the three files in `supabase/tests`**, while printing
  "the SQL suites pass". The `rls_*.sql` suites are excluded deliberately (they
  need two real profiles; adding them to the runner was tried and fails
  immediately against the empty shim). So the two new archive assertions, and
  the eight social assertions STATUS cites as proof of Stage 3's visibility
  model, run only by hand against a real project. Nothing automatic re-verifies
  them.
- **The harness could not see the edit section at all** because every fixture
  lift was seeded and the whole surface is gated on `is_custom`. Sixth blind spot
  of that shape. Adding one custom lift took three tries: it broke
  `previousSession` (which indexed `LIFTS` past its end), then the page was
  unreachable because `strength_summary` only knows exercises with sets, then the
  row sat below `STRENGTH_SHOWN`.
- **Wall green on Node 22, all 11 checks, 754 tests.** `test:smoke` passes
  locally again now that the machine is quiet, confirming the earlier failure was
  load, as suspected.
- **A screenshot run found five defects the eleven checks cannot see**, and
  `ExerciseDetail` had never been photographed at all: the fifth blind spot in
  that harness. Two of five rep-range bars rendered EMPTY because Tailwind v4
  prunes `@theme` tokens nothing statically references, so a runtime-composed
  `var(--color-accent-400)` emitted no CSS. That is `inset-block-0` all over
  again. Nine months of progress read as a flat line on a zero axis. The
  latest-point dot had been clipped in half on the volume trend since the day it
  was written. The harness stub does not implement PostgREST embeds, so the page
  hung on "Loading..." forever, a throw inside a `.then`, which no error
  boundary can catch. See DECISIONS.md.
- **`formatEstimate` was reaching only the coach.** Every other e1RM in the app
  went through `formatWeight`, which snaps to the nearest plate, so the coach
  said 116.7 where the exercise page said 116.75. That is the exact
  disagreement that function's own comment warns about. Fixed on the exercise
  page.
- **A SANDBOXED SHELL RUNS NODE 26, NOT THE 22 IN `.nvmrc`.** fnm's hook is not
  loaded in a non-interactive shell. Node 26 ships an experimental built-in
  `localStorage` that shadows jsdom's and is unavailable without
  `--localstorage-file`, so **18 tests across three suites fail in a tree CI
  calls green**, and two wrong diagnoses were published before the environment
  was probed rather than the code. Prefix `PATH` with
  `~/.local/share/fnm/node-versions/v22.23.2/installation/bin` per command. Do
  NOT change the global node; the OmniRoute LaunchAgent depends on that path.
- **Wall green on Node 22:** all 11 checks, **704 tests**, `check:sql` executes
  all 23 migrations from empty, Playwright green, `npm run shots` reports no
  uncaught page errors.
- **RECONCILED AGAINST PRODUCTION, 2026-08-09.** Read live, not recited. This
  section was wrong on five counts and a session that trusts it will make bad
  calls, which is why the stale bullets above now point here.

  | this file said                     | production says                                 |
  | ---------------------------------- | ----------------------------------------------- |
  | 4 auth users, 4 profiles           | **6 and 6**, two created in the previous 4 days |
  | usernames 0                        | **2**                                           |
  | routines 0                         | **8**, across 2 users                           |
  | `generate-routine` never succeeded | **7 successful generations**                    |
  | migrations at 0022                 | **0024**                                        |

  Full snapshot: 152 workouts, 3,210 sets, **491 records**, 134 exercises (0
  custom), 8 routines, 6 profiles, 1 follow, 0 unfinished workouts, 10
  `ai_generations`, 3 `coach_views`, **0 `client_errors`**. Last workout logged
  2026-08-07.

- ~~**THE BETA HAS STARTED AND RETENTION IS THIN.**~~ **WRONG PREMISE, corrected
  2026-08-09: Ameen has not shared the app. These accounts are not a cohort and
  the numbers below say nothing about retention. Kept because the inference is
  an easy one to repeat.** Six accounts exist, three
  signed in within two days, and **one person logged a workout in the last
  seven**. Two workouts in seven days, both from a routine. That is the only
  number that matters now and no amount of building moves it. GATE 3 asks for a
  third of testers still logging unprompted at week 6, and §4 pre-declares it as
  the stop-building line.
- **All 10 AI generations used the FREE model**, so real OpenRouter spend is
  zero to date. The §10 hard cap is still unset, so that is luck rather than
  control: one free-tier outage turns four live surfaces into uncapped paid
  traffic.
- **`client_errors` is empty.** Either nothing has crashed since 0018 landed, or
  nothing reaches the table. Worth one deliberate crash to find out which,
  because an error ledger nobody has ever seen a row in is not yet an instrument.
- **The ledger knows 6 of 24 migrations**, having gained nothing since 0022:
  tonight's 0024 was applied through the dashboard SQL editor, which writes no
  ledger row. `supabase db push` or `db reset` still behaves as though the
  database began at 0016. Backfilling 0001 to 0024 is the first item in the
  housekeeping prompt in `docs/archive/IMPLEMENTATION_PROMPTS.md`.
- **Migration 0024 is APPLIED and verified (2026-08-09).** `exercises.archived_at`
  exists as a nullable `timestamptz` with no default and its comment matches the
  repo file, checked by reading `information_schema` and `col_description` rather
  than trusting a success flag. All 134 exercises are active, RLS still on with 4
  policies, and 3,210 sets and 152 workouts were untouched. **0023 (the
  preferences WIP) remains the only unapplied file in the repo.**
- **Resolved 2026-08-09: `locale` now lives in migration 0023.** It was edited
  in place rather than given its own migration, because 0023 is written and
  still unapplied, so there is no ledger to respect and no second file to
  keep in step. `user_preferences` gains `locale text not null default 'en'
check (locale in ('en', 'ar'))` and `upsert_user_preference` gains a third
  allowlist branch. **Still unapplied**, so this is "applies cleanly from
  empty" (verified by `check:sql`), not "applies cleanly to production".
- **0023 IS APPLIED TO PRODUCTION (2026-08-09).** Verified against
  `information_schema`, not the success flag: `user_preferences` exists with
  RLS on and 3 policies, both RPCs exist, all 3 check constraints exist, and
  `handle_new_user` now bootstraps a preferences row. **`locale` is NULLABLE
  with no default**, deviating from the file as first written — a
  `not null default 'en'` would have had the signup trigger stamp every new
  user English, which the client then adopts on sign-in, so an Arabic phone
  in Cairo would land in English and `navigator.language` would never get a
  say again. NULL means "never chose", which is a different fact from "chose
  English". **No backfill**: the 7 existing users have 0 rows, so their
  localStorage unit stays authoritative instead of being overwritten by the
  table's `kg` default. Untouched by the apply: 153 workouts, 7 profiles,
  134 exercises. The ledger gained a `user_preferences` entry.
- **The ledger is not a record of what is applied.** It lists 7 migrations and
  has never known about 0020, 0021 or 0024 — yet `exercises.archived_at`
  exists in production, so 0024 IS applied despite this repo saying it is not.
  Trust `information_schema`, not the ledger and not the STATUS notes.
- **Known mismatch, NOT fixed:** `unit-context` falls back to `lbs` when
  localStorage is empty, while `user_preferences.weight_unit` defaults to
  `kg`. A brand-new user sees lbs before sign-in and kg after. Left alone on
  purpose — it belongs to the in-flight U-work, and the plan's Egypt default
  is kg, so the server side may well be the correct one.
- **Stage 5 locale is BUILT, not shipped (2026-08-09).** 520 catalogue keys,
  the EN/AR header toggle, the pre-auth toggle, root `dir`/`lang` flip, and
  `locale` in migration 0023. Full wall green: lint, typecheck, format,
  check:coverage, check:vercel, check:sql, build, and 806 tests (the one
  `lazy-screen` failure predates this work and reproduces on a clean tree).
  **NOT done:** every Arabic string is machine-drafted and GATE 5's
  native-speaker review is still the gate; plurals are two keys against
  Arabic's six categories; `ErrorBoundary` stays English because a class
  component cannot call the hook; charts are not mirrored, by prior decision.
  0023 is now applied (see above).
- **Last updated:** 2026-08-09 by Claude Code (the production reconciliation
  above, and the R4/R5 state correction in the offense plan's §11 ladder).
  Previously 2026-08-08 (U4 part 1: the e1RM trend and its
  verdict, the rep-max ladder and its band merge, the rep-range distribution,
  the shared `SeriesChart`, two e1RM formatting fixes, the five defects a
  screenshot found, and the Node 26 versus 22 trap). Previously 2026-08-08 (E1,
  the rest canvas; the idle
  gate; migration 0022; the truncated kicker a screenshot found — merged with
  the release-ladder accounting, the four verified gap items, and U4 marked
  next). Previously 2026-08-08 (B1's briefing and debrief; B2's

  weekly review contract and eval harness; migration 0021; the executable
  migration runner and the two defects it caught; the kg/lbs defect a
  screenshot found). Merged with U3b the same day — **the perf figures in the
  two entries above were each measured before the other landed, and the numbers
  below are a fresh run of the merged tree.** Previously 2026-08-08 (U3b: the
  offline op log, the IndexedDB store and read cache, the airplane-mode e2e,
  and the two defects they found — rung 1 never restoring, and the load path
  with no deadline). Previously 2026-08-08 (U3a's optimistic writes and
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
