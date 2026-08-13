# PRODUCT.md — Wazn

Durable product truth for design and product work. Written 2026-08-04 via
`/impeccable init`: facts marked **[plan]** are established in `WAZN_PLAN.md`
(the project's source of truth — read it for detail and stage gates); facts
marked **[Ameen]** were confirmed directly in the init interview. Where this
file and the plan disagree, the plan wins.

## What it is

Wazn (Arabic: وزن, "weight") is a mobile-first strength-training log — a PWA
built toward functional parity with Hevy, then monetized globally with
regional pricing. **[plan]**

The core job, subordinate to nothing: **log a set in under 30 seconds, one
hand, mid-workout.** Every design decision serves that. **[plan]**

## Primary user and situation

A lifter mid-workout in a gym — chalked hands, one thumb, between sets,
under whatever lighting the gym has. Egypt is the first test market; the US
and global market follow (Minnesota friends are the first non-Egypt cohort).
Budget Android phones and Egyptian mobile data are the baseline environment,
not the edge case. **[plan]**

## Position and mechanism

- **Positioning: a global app with an Egyptian soul.** It reads first as a
  polished global lifting app; the Arabic identity — the وزن mark, the
  name's story — is the distinctive accent, not the lead. **[Ameen]**
- **Mechanism:** regional pricing Hevy structurally cannot match (EGP tier
  from day one), Arabic-native by design (RTL is a planned flip, not a
  rewrite — Stage 5), and a logging flow that is never interrupted and
  never paywalled. **[plan]**

## Voice

**Terse gym partner.** Short, direct, zero fluff — respects the mid-workout
context. PRs get an ember flash, not confetti. Errors say what failed and
what to do next. **[Ameen]**

## Durable constraints future work must preserve

- The logging flow is sacred: no ads, modals, spinners, or celebration
  screens mid-set. Logging is never paywalled. **[plan]**
- Design system: dark-first, near-black warm ground, off-white text, single
  ember accent (#e8491d; adopted 2026-08-12, DECISIONS.md), numbers ≥24px
  tabular, touch targets ≥48px, three faces with fixed roles (Sora for
  figures and display, Hanken Grotesk for prose, IBM Plex Mono for meta),
  no gradients/shadows/emoji in UI. CSS logical properties only. A paper
  light theme arrives at stage R4 as the secondary option.
  **[plan]**
- Weight is stored in kg, always; lbs is display-only. **[plan]**
- The brand mark is the word وزن composed as a barbell ("Loaded Ink" —
  `docs/design-philosophy.md`); chalk letters, ember iron. Regenerate via
  `scripts/build_logo.py`, never redraw by hand. **[plan]**
- Auth is a 6-digit email code, never a magic link. **[plan]**

## Platform

`web` — an installed PWA is the product today; a Capacitor Android wrapper
arrives at Stage 6 for Play Store + ads, wrapping the same code. iOS is
parked. **[plan]**

## Stack

Decided and incumbent: React + Vite + Tailwind (tokens in `src/index.css`),
Supabase (auth, Postgres, RLS, RPCs), Vercel hosting, recharts lazy-loaded
on the Progress screen only. Three screens, no router; back-gesture support
via `src/lib/use-back.ts`. **[plan]**

## Evidence and assets

Real training history: ~152 workouts / ~3,200 sets imported from Hevy
(2025-10 → 2026-07) — charts and previous-session data are real from day
one. Exercise thumbnails from free-exercise-db, desaturated to sit in the
app's palette. **[plan]**
