# Handoff: Wazn v5 "Momentum" — full app redesign + AI layer

## Overview

Complete redesign of the Wazn PWA (repo: `ameenahassan421/Wazn`), approved by Ameen 2026-08-16 after three tested iterations. It replaces the current visual system with one strict type ramp ("Instrument × Momentum": night-iron ground, giant condensed figures, ember + earned brass), keeps the six-tab IA the codebase already has, and weaves the AI coach through every moment per the repo's own doctrine (one sentence + one data chip; the AI proposes, the lifter commits; never guilt). Covers: auth/onboarding (synced to the 2026-08-07 auth decisions), Hevy import, all day-one empty states (LAUNCH.md copy verbatim), the full workout loop (hunt home → live logging → rest canvas → PR moment → finish verdict), History, Progress with forecasts, Body, Coach control room with bounded Q&A, Friends with duels, and Settings with a wired coach-volume dial.

## About the Design Files

The files in `design/` are **design references created in HTML** — working prototypes showing exact look and behavior, not production code. The task is to **recreate these designs pixel-perfectly in the Wazn codebase's existing environment** (React + TypeScript + Tailwind v4 + Supabase PWA) using its established patterns: the offline write queue, workout checkpoint, `coach.ts` + Edge Function pipeline, `use-back.ts`, RLS-scoped SQL stats, logical-properties/i18n groundwork. Do not ship the HTML. Do not treat it as inspiration — every color, size, weight, spacing value, and copy string is a requirement.

## Fidelity

**High-fidelity and normative.** Where a value here conflicts with instinct or with the old stylesheet, this handoff wins. Open each HTML file in a browser at 430px width and measure against it. The prototypes run on Ameen's real training history (`design/data.js`, parsed from `workouts_corrected.csv`) — production reads the same truths from Supabase.

## Design Tokens

### Color (dark-first; this theme replaces the current paper-default for v5)

| Token  | Value                                                             | Role                                                                                                                                                            |
| ------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| bg     | `#0f0d0a`                                                         | app ground (warm near-black iron)                                                                                                                               |
| sur    | `#181510`                                                         | cards                                                                                                                                                           |
| sur2   | `#211d15`                                                         | raised / pressed / track fills                                                                                                                                  |
| line   | `rgba(236,231,220,0.08)`                                          | hairline ring: `box-shadow: 0 0 0 1px` — never border                                                                                                           |
| line2  | `rgba(236,231,220,0.16)`                                          | drawn borders (inputs, outline buttons)                                                                                                                         |
| text   | `#ece7dc`                                                         | primary text                                                                                                                                                    |
| mut    | `#9a927f`                                                         | secondary text                                                                                                                                                  |
| faint  | `#615b4d`                                                         | meta/disabled                                                                                                                                                   |
| em     | `#e8491d`                                                         | THE accent: the one action, live states, PR, momentum fill                                                                                                      |
| emInk  | `#1c0e08`                                                         | text on ember fills                                                                                                                                             |
| soft   | `#f4a68c`                                                         | small accent text on dark (contrast-safe tier)                                                                                                                  |
| chipBg | `rgba(232,73,29,0.15)`                                            | data-chip tint                                                                                                                                                  |
| brass  | `#b08d3e` / brassSoft `#d9bc7a` / brassBg `rgba(176,141,62,0.18)` | **earned metal only**: rank, duel opponent, record pace, target-beaten. Never UI chrome. This is a deliberate, scoped second hue — flag any third use in review |

### Typography — the entire ramp; no other sizes exist

Faces: **Saira Semi Condensed** (display + every figure; replaces Sora at display level — deliberate v5 brand decision; wordmark stays lowercase `w a zn`, the `a` in ember), **Hanken Grotesk** (body/UI), **IBM Plex Mono** (meta/chips/kickers). All numerals `font-variant-numeric: tabular-nums`.

| Step  | Spec                                      | Use                                            |
| ----- | ----------------------------------------- | ---------------------------------------------- |
| mega  | Saira 700 / 84 / 1.0                      | live weight zone (reps zone 56)                |
| hero  | Saira 700 / 50 / 0.98, uppercase, −0.01em | BEAT figure, finish total (66)                 |
| fig   | Saira 700 / 30 / 1.05                     | weigh-in figure, rest "next set" (38–42)       |
| num   | Saira 600 / 21 / 1.1                      | stat tiles, e1RM list, session volume          |
| title | Saira 600 / 17 / 1.2, uppercase, +0.01em  | card titles, buttons (exercise headers 24–26)  |
| body  | Hanken 400 / 14 / 1.5                     | coach sentences, prose                         |
| label | Hanken 400 / 13 / 1.4                     | rows, inputs, chips-as-buttons                 |
| kick  | Mono 500 / 10 / 0.14em, uppercase         | section labels, zone labels (9 in tight spots) |
| meta  | Mono 500 / 11, tnum                       | data chips, timestamps, prev-set strings       |
| nano  | Mono 500 / 9 / 0.1em, uppercase           | tab labels, disclaimers, footnotes             |

### Shape, elevation, spacing, motion

- Radii: card 16 · control 12 · chip 6 · pill 999. Screen gutter 18px (auth screens 22px). Card padding 16.
- Elevation is the hairline ring (`0 0 0 1px line`) — no drop shadows anywhere.
- Touch: 48px floor; stepper side-zones 82px wide full-row; commit bars 70–76px; OTP cells 58px.
- Motion: bar fills `width .5s cubic-bezier(.2,.8,.2,1)`; overlays fade/slide 200–300ms; ring drain `stroke-dashoffset 1s linear`. Nothing on the logging path exceeds 200ms; the PR screen is reachable only after a commit.
- Logical properties only in production (`ms-`/`ps-`/`inset-inline-start`) — the prototype inlines some physical values; do not copy those, the RTL flip is planned.

## The data-chip grammar (app-wide, non-negotiable)

Every AI sentence renders with exactly one chip: Mono 11, `soft` on `chipBg`, radius 6, padding 3px 8px, nowrap, `dir="ltr"`. No chip, no claim — an AI line without its number must not render. Brass chips (`brassSoft` on `brassBg`) mark earned states only.

## Screens

All in `design/`. `Onboarding.html` = screens 01–05; `Wazn v5.html` = 06–16 (six-tab app).

- **01 Auth** — wordmark 34 → "Your training, on record." (title 22, sentence-case) → **Continue with Google** (ember hero, 56px) → OR divider → email-or-username + password inputs (48px, `line2` border, bg ground) + SIGN IN (ink fill) → links row: Create an account · Email me a code instead · Forgot password? → "Coming from Hevy?" door card → nano footer: privacy link, "6-digit codes, never magic links", Apple-at-4B note. Auth LOGIC already exists in `src/components/AuthScreen.tsx` (all four paths, 2026-08-07) — restyle it; do not rewrite flows.
- **02 Code** — 6 OTP cells 58px (filled = 1.5px ember border), VERIFY at 45% opacity until 6 digits, `RESEND CODE · 0:42` countdown, no-oracle note. Also serves password-signup confirmation and code-based recovery.
- **03 Welcome** — kicker WELCOME TO WAZN → "Log a set in under thirty seconds." (hero 38, sentence case) → username-claim card (@-prefixed input + CLAIM, optional) → I'LL JUST START LOGGING (hero) / DRAFT ME A ROUTINE (line) / IMPORT FROM HEVY (ghost).
- **04 Hevy import** — "Bring your history." + file card (`workouts.csv · HEVY EXPORT · 412 KB` + CHANGE) + progress card (149 workouts ✓ / 134 exercises matched ✓ / 3,197 sets + ember bar) + coach line with chip ("first session opens with your own previous numbers") + FINISH IMPORT disabled (45% opacity) until complete. Import logic exists (`scripts/import_hevy.ts` → productize per BEATING_HEVY §F1).
- **05 Day one** — every tab at zero data, copy verbatim from LAUNCH.md: Log = one button ("Start your first workout"), History = "No workouts yet. Log one on the Log tab and it will appear here.", Progress = "Log a workout to load the bar." (never a fake data point), Body = "Log a weigh-in to start the second chart.", Coach = "Log 3 workouts and the coach will have something to say." + working routine builder, Friends = "A leaderboard of one. Invite someone to chase." + INVITE primary. Empty glyph: 64px ring card with a 26×7 ember bar.
- **06 Home (Log, idle)** — check-in row (`HOW LOADED?` + Fresh/Normal/Drained 30px chips, selected = text fill; one tap, never modal, skipped = Normal silently) → hunt card: kicker `TONIGHT · PUSH DAY`, `BEAT {lastVolume}` hero, coach brief sentence + chip, START THE HUNT (ember 56px) → bench-rank card (rank name in brassSoft num 21/22 + brass progress bar + `E1RM 170 · 10 TO STEEL I` meta) → three stat tiles (STREAK / THIS WEEK / SESSIONS) → duel card (two labeled bars: you = ember, opponent = brass) → plan list rows (index mono, name, `N SETS`). Rank ladder (bench e1RM lbs): IRON I 120 · IRON II 150 · STEEL I 180 · STEEL II 210 · CHROME 240.
- **07 Live workout** — momentum bar (6px: session normal-set volume vs last same-routine total; ≥100% flips to brass + label RECORD PACE) → status strip: elapsed mono · TELL THE COACH · FINISH → exercise header (title 26 + meta `SET n / m · LAST 120×8 · ▲ +5`) → full-bleed stepper zones: −/+ side buttons 82px, LBS value mega 84, REPS 56, rows separated by hairlines → chip `+{w×r} LBS TO THE BAR` → fixed BANK IT commit bar (70px ember, above tab bar) with live label `BANK IT · 125 × 8`. Ghost values are coach-seeded: +5 where all working sets hit ≥8 reps last time (chip `▲ +5`), else hold (`→ hold`); under-plan commit (reps < plan−1) recalcs remaining sets in that lift once, −5, chip `↓ −5` (never touches committed rows, never fires twice). Repeat-set commit stays 1 tap (GATE U2).
- **08 Rest canvas** — full-screen ground takeover on commit: kicker `REST — THE COACH IS THINKING` → 250px SVG ring, ember arc **fills as rest elapses** (the ring fills, it does not drain — DESIGN.md rule), mega countdown inside → `NEXT — {LIFT}` + next set figure 38 + its reasoning chip + momentum chip (`N LBS LEFT TO BEAT LAST PUSH` / brass `RECORD PACE`) → `TAP TO GO EARLY`. Tap anywhere dismisses. Passive, silent, no inputs; vanishes on interaction (BEATING_HEVY §E1 rules).
- **09 Tell the coach** (sheet, mid-workout only) — dim scrim + bottom sheet: kicker, three chips (`Too heavy` → ease 10 lbs remaining / `Shoulder feels off` → ease 15 + not-medical-advice line / `Short on time` → trim last set of each remaining lift) + free-text row. Output is ONLY a proposed edit: sentence + chip + ACCEPT / KEEP AS PLANNED. No thread, no history; surface absent outside an active workout. Free text goes through the model with the bounded system prompt in `design/screens_core.jsx` (`TellCoach`) — production routes it through a `coach-ask`-style Edge Function returning the same JSON `{action, amount, line, chip}`.
- **10 PR moment** — full-screen ember flash (300ms fade): kicker `ALL-TIME RECORD` (or `RANK UP`), e1RM figure mega 130 in emInk, `BENCH E1RM · WAS 170` kicker, brass rank pill on rank-up, `TAP TO CONTINUE`. Fires only when a committed set's Epley e1RM (`w × (1 + r/30)`) beats the stored best; PR baseline updates in-session so it cannot fire twice for one climb.
- **11 Finish** — kicker `TARGET BEATEN` (brass) / `SESSION LOGGED` → volume hero 66 → hairline rows SETS / MINUTES / STREAK (`39 WK — HELD`) → verdict sentence + chip (`volume 7,120 lbs · ▲ 9% vs last push`) → BACK TO HOME.
- **12 History** — COACH'S FIND card (max one per week, dismissible, never repeats once dismissed; real computed fact + chip) → LAST 10 WEEKS grid (7-row × 10-col, 12px cells radius 3, ember = trained day) → session rows: title, `date · N SETS · M MIN` meta, `N PRS` chip when records fell, volume num right.
- **13 Progress** — strength list rows: 36px letter tile (sur2, radius 10), lift short-name, forecast line nano 9 in brassSoft (`180 BY SEP 26 · ON PACE`) **only with ≥8 sessions of data**, else faint `FORECAST AT 8 SESSIONS · NOW n`; right e1RM num + delta (`▲ 8` soft / `→` faint). Chart card: bench e1RM sparkline (2px ember polyline, 1px baseline, dashed quarter-gridline, 3.5px end dot) + **dashed ember projection segment** to the forecast point; legend `— — PROJECTION`. Forecast = linear fit over last 8 sessions extended 6 weeks; rendered with a date, never a promise. Plateau card (`COACH'S FIX`, one max, PREVIEW CHANGE / LATER) only when the 6-session slope ≤ 0 — with current data it correctly does not render; the honest fallback line + chip shows instead.
- **14 Body** — weigh-in card (figure input + LOG WEIGH-IN; sparkline from 2+ entries; empty copy per LAUNCH) → protein week (7 tap-to-add 40g bars vs TARGET 160 G; ember when met; protein is the ONLY nutrition number) → measurements rows (Waist/Chest/Arm, inline ADD → input + SAVE) → cross-signal coach line + chip once 2+ weigh-ins exist → nano wearable footer.
- **15 Coach** — mode selector: STRENGTH (active = `0 0 0 2px em` ring + ACTIVE), HYPERTROPHY (normal card), MEET PREP (transparent, 1.5px dashed brass border + SET MEET DATE until dated); switching is a lens — zero edits to routines or history → WEEK REVIEW · MON card (sentence + chip + APPLY TO WEEK / ADJUST) → COACH'S NOTES (3px ember inline-start border, mono index, bold finding, chip each) → ASK THE COACH: four preset question chips (deterministic, SQL-computable answers) + free text via bounded model call (grounded to a stats block; off-topic returns the fixed refusal "I only read your training log. Ask me about your lifts."); answer = one sentence + chip card → footer nano `AI-GENERATED · NOT MEDICAL ADVICE · 3 REGENERATES LEFT THIS WEEK`.
- **16 Friends** — weekly leaderboard rows (rank index, name — self in soft + 600, `N SESSIONS` meta, volume num); duel card (opt-in, fair-matched, sessions-count target, two bars, loss copy = win copy with names swapped); invite row (`wazn.app/join/ameen` + COPY).
- **17 Settings** (via header avatar; no tab) — account card (name, `GOOGLE + CODE · JOINED …` meta) → THE COACH: Full / Quiet / Off segmented (ember active) with one-line description; **wired**: Quiet keeps ghost intelligence but silences every card/line/toast; Off renders the pure logger (plans repeat last session verbatim, no chips) → DATA THE COACH MAY READ: check-in / wearable (disabled `NOT CONNECTED`) / body weight / protein toggles (42×24, ember on) + `REVOKING A SOURCE NEVER DELETES ITS HISTORY` → DATA: Import from Hevy, Export my data (CSV), onboarding link → PREFERENCES: unit (kg stored, lbs display — Ameen's history is lbs), language (Arabic after design lock; RTL planned), rest timer AUTO → SIGN OUT.

## Interactions & State

- Workout state machine: `idle → live → done`; active workout + values persist (prototype: localStorage `wazn5_workout`; production: the existing checkpoint store + offline queue — an offline session must survive app kill, per LAUNCH §4).
- Rest: 90s default in the prototype; production is effort-aware (2–4 min by %e1RM, 90s warm-ups), manual override wins and is remembered per exercise. Timer silent at end.
- Coach reactions fire on **notable sets only**: PR (full-screen), heaviest-in-4-sessions (toast), under-plan recalc (toast), exercise complete (toast: `Bench done. Top set 125×8.` + chip). Toasts: sur2 card, 2px ember top border, auto-hide 5s, tap to dismiss, suppressed during rest and entirely in Quiet/Off.
- Voice rules for every AI line: one sentence, present tense, number in the chip not the prose, no exclamation marks, no emoji, no "great job", no "missed/failed/only".
- The deterministic engine is `design/coach2.js` (plan seeding, recalc, PR detection, forecasts, verdicts, rank ladder, week review, notes, preset answers). Port these rules into `src/lib/coach*.ts` / SQL where equivalents exist. The model only phrases; every number comes from computed stats.

## Do-not-regress list (the app is live — these are shipped behaviors)

1. Auth: all four paths in `AuthScreen.tsx` (Google PKCE, email/username+password, code, code-based recovery), Gmail dot-normalisation, username alias via `auth-alias`, no-oracle responses. Restyle only.
2. Offline: write queue, checkpoint, airplane-mode session end-to-end (LAUNCH §4), `Offline · N sets saved on this device` line.
3. GATE U2: repeat-set commit stays 1 tap. Set entry, commit control, and timer geometry never adapt.
4. RLS/social invariants and the invite flow; in-progress workouts never visible to others.
5. Logical properties only; every numeral tabular; no third hue beyond ember + scoped brass; no drop shadows; no red; silent rest timer; no spinner/modal/paywall on the logging path.
6. Coach volume Off must render a coherent pure logger; every AI surface has its degraded render; nothing auto-applies without a press (Accept / Save / commit).
7. kg stored, lbs display-only (unit context).

## Assets

- Fonts: Saira Semi Condensed (Google Fonts, 500/600/700) — new; Hanken Grotesk + IBM Plex Mono self-hosted already in repo (`public/fonts/`). Self-host Saira the same way (Egyptian-mobile-data rule). Sora remains only if the wordmark needs it during transition; the v5 wordmark is set in Saira 700.
- No images required; exercise thumbnails (`public/exercises/`, grayscale) may be added to picker/detail rows per existing patterns.
- `design/data.js` — Ameen's parsed history; reference for shapes, not a production asset.

## Files

- `design/Wazn v5.html` — the six-tab app (open at 430px; state persists in localStorage)
- `design/Onboarding.html` — auth → code → welcome → import → day-one empty states
- `design/ui.jsx` — THE token source: palette, ramp, primitives (Kick, Chip, Card, Btn, Fill, Spark, Ring, TabBar)
- `design/coach2.js` — deterministic coach engine + every copy string the AI surfaces use
- `design/screens_core.jsx` — home/live/rest/PR/finish/tell-the-coach (incl. the bounded model prompts)
- `design/screens_tabs.jsx` — history/progress/body/coach/friends/settings
- `design/data.js` — real-history dataset the prototypes run on
- `fonts/` — self-hosted Hanken Grotesk + IBM Plex Mono (the HTML also pulls Saira from Google Fonts)
- `STARTING_PROMPT.md` — paste into Claude Code to begin

## Suggested build order

P0 tokens + type ramp swap, tab bar, Home hunt card, Live zones + BANK IT, rest canvas ring (all restyles of shipped logic) → P1 PR moment, toasts, finish verdict, momentum bar, History/Progress/Body/Coach/Friends/Settings restyles + coach-volume wiring → P2 onboarding restyle, Hevy import surface, rank ladder + duels (new schema), Ask-the-coach Edge Function → P3 forecasts in SQL, week review generation, Arabic RTL pass. Definition of done: LAUNCH.md passes end to end on a second account, plus the acceptance list in STARTING_PROMPT.md.
