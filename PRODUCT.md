# PRODUCT.md: Wazn

Durable product truth for design and product work. Written 2026-08-04 via
`/impeccable init`, corrected 2026-08-19: facts marked **[plan]** are
established in `WAZN_PLAN.md` (the project's source of truth, read it for
detail and stage gates); facts marked **[Ameen]** were confirmed directly in
the init interview. Where this file and the plan disagree, the plan wins.

**This is a product description, not a status board.** For what is built,
what is active, and what the current gate is, read `WAZN_PLAN.md` section
7.0 and treat it as a claim to verify. Nothing here tells you how far along
anything is.

## What it is

Wazn (Arabic: وزن, "weight") is a mobile-first strength-training log: one
app on iOS, Android and web, built toward functional parity with Hevy, then
monetized globally with regional pricing. **[plan]**

The core job, subordinate to nothing: **log a set in under 30 seconds, one
hand, mid-workout.** Every design decision serves that. **[plan]**

## Primary user and situation

A lifter mid-workout in a gym: chalked hands, one thumb, between sets,
under whatever lighting the gym has. Egypt is the first test market; the US
and global market follow (Minnesota friends are the first non-Egypt cohort).
Budget Android phones and Egyptian mobile data are the baseline environment,
not the edge case. **[plan]**

## Position and mechanism

- **Positioning: a global app with an Egyptian soul.** It reads first as a
  polished global lifting app; the Arabic identity (the وزن mark, the
  name's story) is the distinctive accent, not the lead. **[Ameen]**
- **Mechanism:** regional pricing Hevy structurally cannot match (EGP tier
  from day one), Arabic-native by design (RTL is a planned flip, not a
  rewrite, at Stage 5), and a logging flow that is never interrupted and
  never paywalled. **[plan]**

## Voice

**Terse gym partner.** Short, direct, zero fluff, respecting the mid-workout
context. PRs get an ember flash, not confetti. Errors say what failed and
what to do next. **[Ameen]**

## Durable constraints future work must preserve

- The logging flow is sacred: no ads, modals, spinners, or celebration
  screens mid-set. Logging is never paywalled. **[plan]**
- Design system: dark-first, near-black warm ground, off-white text, single
  ember accent (#e8491d; adopted 2026-08-12, DECISIONS.md), numbers ≥24px
  tabular, touch targets ≥48px, three faces with fixed roles (Saira Semi
  Condensed for figures and display, Hanken Grotesk for prose, IBM Plex Mono
  for meta), no gradients/shadows/emoji in UI. CSS logical properties only.
  Both grounds ship: iron is the default and the paper light theme is the
  choice. That polarity has been reversed twice and is pinned by a test, so
  the next reversal has to edit an assertion. **[plan]**
- Weight is stored in kg, always; lbs is display-only. **[plan]**
- The brand mark is the word وزن composed as a barbell ("Loaded Ink",
  `docs/design-philosophy.md`); chalk letters, ember iron. Regenerate via
  `scripts/build_logo.py`, never redraw by hand. **[plan]**
- Auth offers four ways in, never a magic link: Google sign-in, Apple
  sign-in (Stage 4B), email + password with code-based recovery, and a
  6-digit email code. A username works as an alias for the email on any
  non-social path. Decided 2026-08-07. **[Ameen]**

## Platform

adaptive

That first line is a parsed field, not prose: `impeccable`'s `context.mjs`
reads it to decide whether to load the iOS and Android references, and
anything it does not recognize silently degrades the project to `web`. It
said `web` until 2026-08-19. Leave it as a bare word.

**One codebase, three targets.** Expo Router plus NativeWind, shipping iOS,
Android and web (react-native-web). Decided 2026-08-19; the separate Vite
PWA in `src/` is retired at the end of that migration. Capacitor was
rejected 2026-08-16 (App Store Guideline 4.2, keyboard and haptic
ergonomics, background rest timers), so any Capacitor guidance you find is
stale. Play Store and App Store presence, and the ads that fund the free
tier at Stage 6, ride the native build. **[plan]**

## Stack

Expo Router plus NativeWind, Supabase (auth, Postgres, RLS, RPCs), Vercel
for the web target. `src/lib` is portable domain and crosses to native
through `src/lib/portable.ts`, the only door between stacks; the palette's
source of truth is `src/lib/tokens.ts`, never a hand-typed colour. Charts
stay lazy and off the Log screen's path, because Log is the hot screen
mid-workout. Seven screens: Log, History, Progress, Body, Coach, Friends,
Settings. Six of them sit in the tab bar (all but Settings), and all but
Body also have a card door into them, because the bar is not the only way
in. **[plan]**

## Evidence and assets

Real training history: ~152 workouts / ~3,200 sets imported from Hevy
(2025-10 to 2026-07), so charts and previous-session data are real from day
one. Exercise thumbnails from free-exercise-db, desaturated to sit in the
app's palette. **[plan]**
