> **SUPERSEDED 2026-08-19 for every screen. Still canonical for the logo.**
> The screen specs below are superseded by `docs/design/v5-momentum`; its
> `P0-PLAN.md` and `P0-GATE.md` are the live build order. What this bundle got
> right is the brand: the gripped plate, the vermilion accent `#E8491D`, and the
> plate geometry are still the source of truth, and `scripts/build_logo.py`
> (lines 61 and 238) reads `Wazn Brand - Logo.dc.html` for exactly that.
> **The bundle therefore cannot be moved, renamed, or deleted.**
>
> **Do not build screens from this file.** Specifically wrong now:
>
> - **Overview:** "replaces the current 5-tab layout with a single home feed."
>   The five-tab bar was retired 2026-08-13 and a **six-tab bar came back
>   2026-08-14**, confirmed by Ameen: Log, History, Progress, Body, Coach,
>   Friends. The doors behind the cards were kept alongside it.
> - **About the Design Files:** the target is not a "React + TypeScript PWA,
>   Supabase, **Capacitor** wrapper." Capacitor was **rejected 2026-08-16**
>   (`DECISIONS.md`, entry "2026-08-16 (Expo)") on App Store Guideline 4.2,
>   keyboard and haptic ergonomics for a one-handed logger, and background rest
>   timers. The target is **one Expo Router + NativeWind codebase** shipping
>   iOS, Android and web, `WAZN_PLAN.md` Stage 4A.
> - **Fidelity:** "recreate pixel-perfectly" no longer holds. v5 "Momentum" is
>   the current visual direction, and it is implemented inside the Stage 4A
>   port rather than layered on afterwards.
> - **Typography:** **Sora** is not the display face. It is **Saira Semi
>   Condensed** (`src/index.css:194`, `src/lib/tokens.ts:90`). Condensed is
>   load-bearing: the mega figure is 84px and only fits a phone because the
>   face is narrow.
> - **Suggested build order:** the P0 to P3 roadmap in
>   `Wazn UX Audit and Roadmap.dc.html` is replaced by
>   `docs/design/v5-momentum/P0-PLAN.md` and `P0-GATE.md`.
>
> Current state: `WAZN_PLAN.md` section 7.0. Current plan: `WAZN_PLAN.md`
> Stage 4A.

# Handoff: Wazn App Redesign — "The Plate"

## Overview
Full UX/UI redesign of the Wazn workout tracker (repo: `ameenahassan421/Wazn`). Replaces the current 5-tab layout with a single home feed + one Start action, weaves the AI coach into every moment of the workout loop (brief → live set advice → rest companion → finish debrief), and introduces a new global brand identity: lowercase "wazn" wordmark with the **a drawn as a vermilion weight plate**. Covers 18 screens, an interactive prototype of the core logging loop, a brand sheet, and a severity-ranked UX audit with a P0–P3 roadmap.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy directly. The task is to **recreate these designs in the Wazn codebase's existing environment** (as of 2026-08-19: one Expo Router plus NativeWind codebase, Supabase; **not** a PWA and **not** a Capacitor wrapper, both superseded, see `WAZN_PLAN.md` Stage 4A) using its established patterns: the offline write queue, workout checkpoint, coach.ts pipeline, LoadHelper, i18n/logical-properties groundwork, etc. Open each `.dc.html` file in a browser to see the rendered design (keep `support.js` and `public/` alongside them).

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and copy are final. Recreate pixel-perfectly. The interactive prototype (`Wazn Prototype.dc.html`) additionally specifies real behavior: state transitions, timers, and the plate-calculator algorithm.

## Design Tokens

### Colors
- **Bone** `#F7F3EC` — app background, text on dark/vermilion
- **Ink** `#16130E` — primary text, dark surfaces (rest screen, "up next" card), focus states
- **Vermilion** `#E8491D` — THE accent. The plate, the single primary action, live states, PRs. Rule: if two things on one screen are vermilion, one is wrong
- White `#FFFFFF` — cards
- Card hairline: `rgba(22,19,14,.06)` as `box-shadow: 0 0 0 1px` (not border)
- Muted text `#8A8378`; body-secondary `#4F4A41`; muted-on-dark `#9D968A`; secondary-on-dark `#D6D1C6`; canvas (board bg) `#E9E4D8`; heatmap empty `#F0ECE2`; destructive text `#B8402A`; vermilion tint bg `rgba(232,73,29,.09)`
- Dark-surface hairline/fill: `rgba(247,243,236,.06–.14)`

### Typography
- **Sora** (700/800) — headlines, numbers, buttons. Display: 34px/1.12, letter-spacing -.03em. Card titles: 15.5–17px, -.02em. Buttons: 15–16px/700
- **Hanken Grotesk** (400–700) — body/UI. Body: 14–14.5px/1.55–1.6
- **IBM Plex Mono** (500) — data, timestamps, set numbers, micro-labels. Labels: 11–12px, letter-spacing .1–.16em, uppercase. Numbers use `font-variant-numeric: tabular-nums`
- **IBM Plex Sans Arabic** — all Arabic UI text (screen 16)

### Spacing & shape
- Phone frame: 390×844, radius 40–44px
- Screen padding: 22px horizontal; cards: 16–18px padding, radius 18–20px; small tiles radius 16–18px
- Pill buttons: radius 99px; primary CTA height 56–60px; secondary 54–56px
- Card gap: 10–12px vertical
- Primary CTA shadow: `0 10px 26px rgba(232,73,29,.35)`
- Hit targets: minimum 44px (steppers are 44–46px squares, radius 12px)

## The Brand — "The Plate"
See `Wazn Brand - Logo.dc.html`.
- **Wordmark**: lowercase `w · plate-glyph · zn` in Sora 800, letter-spacing -.05em. The plate glyph (SVG: outer ring + inner hole + bar stub) replaces the "a", sits vermilion, optically ~52% of cap height, baseline-nudged down
- **Mark alone**: plate with two grip slots (SVG in the file) — app icon on vermilion (bone glyph), ink (vermilion glyph), or white (ink glyph)
- **In-app presence**: rest timer = plate ring filling; PR badge = plate + text in vermilion tint pill; coach avatar = ink plate with vermilion 9px core dot
- **Arabic soul**: the وزن-as-barbell wordmark (path data in `Wazn Redesign - Home.dc.html`, hidden block) leads in Arabic locale, splash, about

## Screens / Views
All in `Wazn App - Screens.dc.html` (labels 01–18); Home also standalone in `Wazn Redesign - Home.dc.html`.

- **01 Home** — status row; wordmark left, streak pill ("12 wk", vermilion tint) + avatar right; greeting block (muted date line + 34px display); Coach card (avatar, COACH label, 1–2 sentence brief with `<strong>` numbers, suggestion chips); dark "Up next" routine card; chips row routing to History/Progress/Coach; full-width vermilion "Start workout" CTA with plate glyph
- **02 Live workout** — back circle, title + `elapsed · exercise n of m`, white "Finish" pill; exercise card (46px grayscale thumbnail, name, `set n of 4 · barbell`, "last Fri 60×5 · 60×5 · 60×4" ghost line, logged sets listed with vermilion plate bullets); Weight/Reps stepper cards (− value +, 29–30px Sora value; weight steps 2.5, floor 20; reps step 1, floor 1); one coach line (plain, avatar + 13px text, no card); plate calculator card ("On the bar · per side", e.g. `20 + 1.25 = 62.5 total`, with bar/plates SVG); up-next strip with overlapping thumbnails; vermilion CTA "Log set 3 — 62.5 × 5"
- **03 Rest** — full dark (ink bg). Header + "skip rest"; 240–250px plate ring: track `rgba(247,243,236,.12)` w9 + vermilion progress arc (`stroke-dasharray 257.6`, dashoffset = 257.6 × remaining/total, rotate -90°, linecap round), center 54–56px countdown + `REST · OF 2:00`; − 30s / + 30s pills; coach card (`rgba(247,243,236,.06)`); bottom "next Bench — set 4 · 62.5 × 5" row
- **04 Add exercise** — title + ✕ circle; search field; muscle chips (active = ink pill, rest = white); "Recent" section with last-done stats (`Fri · 4×5 @ 60 kg`, PR in vermilion); "All exercises" rows: 44px grayscale thumbnail, name + equipment, muscle line, 34px vermilion "+" circle
- **05 Finish** — "Tuesday · workout 47" + "In the books." display; 3 stat tiles (duration / kg lifted / sets); PR card (vermilion tint bg, 44px gripped plate, "NEW PR" label, lift + est. 1RM delta); coach debrief card; full set list (mono, name left / `sets @ weight` right); "Share card" (white) + "Done" (ink) pills
- **06 History** — month heatmap card (7-col grid, 26px cells radius 8, vermilion at .5–1 opacity by volume, today = white cell with vermilion inset ring + dot; summary line below); session cards (name, `day · duration · volume`, PR pill, expanded top card shows exercise lines + "+ 4 more"); "Where August went" muscle-split bar (vermilion/ink/gray/beige segments + legend)
- **07 Progress** — lift chips (Bench/Squat/Deadlift/OHP); est. 1RM card: label, 36px value + "▲ 8.4 this year", SVG line chart (vermilion polyline w3, gridlines `#F0ECE2`, end dot, JAN–NOW axis); 3 tiles (best set / sessions / PRs-vermilion); coach insight card; PR log card (plate bullet, lift, `weight×reps · date`)
- **08 Coach chat** — header: back, avatar, "Coach", "● knows your 47 workouts" (vermilion); user bubbles ink right (radius 18/18/5/18), coach bubbles white left (18/18/18/5); inline action chips inside coach bubble ("Update routine" vermilion / "Not now" bone); suggestion chips row; input pill with vermilion mic icon
- **09 Onboarding** — plate mark, "Your training, on record.", email echo, 6-cell OTP row (58px cells, active = vermilion ring + caret), ink "Verify" CTA, "Resend code · 0:42"; bottom "Coming from Hevy?" import door card
- **10 Hevy import** — "Bring your history."; file card (`workouts.csv · Hevy export · 412 KB` + "change"); progress card: 149 workouts ✓ / 134 exercises matched ✓ / 3,197 sets at 80% (mini plate-ring), vermilion progress bar; coach reassurance line; disabled (45% opacity) "Finish import" CTA until done
- **11 Routines** — "+ New"; dark "Let me build your week" coach card with bone "Build" pill; folder label (`PPL · 4 DAYS / WEEK`); routine cards (name, `n exercises · last done`, 44px vermilion-tint play circle); Archive folder row; "Start empty workout" ghost pill at bottom
- **12 Exercise detail** — back + name + "edit"; 170px grayscale hero with muscle/equipment tag pills overlaid bottom-left; 3 tiles (est. 1RM / best set vermilion / sessions); "How to" card with numbered vermilion steps (3 steps); "Recent sessions" mono list; vermilion "Add to workout" CTA
- **13 Set options sheet** — bottom sheet over dimmed (`rgba(22,19,14,.45)`) workout, radius 28 top, drag handle; title `Set 3 · Bench Press` + weight line; set-type segmented row: Warm-up / **Working** (active ink) / Drop set / Failure; superset row (thumbnail, "Superset with Overhead Press", "alternate sets, one rest timer", vermilion toggle); per-exercise rest stepper (`− 2:00 +`); RPE 6–10 row (selected = vermilion); centered "Remove set" in `#B8402A`
- **14 Settings ("You")** — avatar + name + email/joined; grouped cards: Units kg/lb + Language EN/العربية segmented toggles, Default rest; Body weight row with sparkline (`78.4 kg · logged Mon`); Coach nudges toggle, Import from Hevy, Export my data (CSV); "Sign out"; footer `wazn 2.0 · وزن`
- **15 Lock screen live activity** — dark gradient; clock; live-activity card (`rgba(247,243,236,.08)` + blur): 56px plate ring w/ 0:45, "Rest — then the money set", `Bench · set 4 of 4 · 62.5 × 5`; compact streak widget card (3/4 this week · wk 12)
- **16 Arabic RTL Home** — `dir="rtl"`, IBM Plex Sans Arabic, وزن barbell wordmark leads. Same layout mirrored via logical properties (`margin-inline-start`, `inset-inline-end`); numerals stay Western
- **17 First-run empty Home** — "Day one / Welcome."; coach offers "Build my first routine" (ink chip) + "Import from Hevy" (ghost chip); dashed-border placeholder card ("Your week, your streak, and your PRs will live here"); "Start your first workout" CTA
- **18 Empty History** — 120px gripped plate at 14% opacity, "Your log starts today.", subline, vermilion "Start a workout" pill

## Interactions & Behavior (prototype: `Wazn Prototype.dc.html`)
Core loop state machine: `home → workout → rest → workout → … → finish → home`.
- **Start workout** → workout screen; elapsed timer ticks 1s (continues through rest)
- **Steppers**: weight ±2.5 kg (floor 20 = empty bar), reps ±1 (floor 1). CTA label live-updates: `Log set {n} — {weight} × {reps}`
- **Log set** → appends set; if sets < 4 → rest screen with timer at per-exercise default (120s); if 4th → finish screen
- **Rest**: counts down 1s; ring dashoffset animates (`transition: stroke-dashoffset 1s linear`); +30s (can extend total), −30s (floor 1s); skip rest or timer-end → back to workout; "next" row shows upcoming set
- **Plate calculator**: `perSide = (total − 20) / 2`, greedy over [25, 20, 15, 10, 5, 2.5, 1.25]; ≤ 0 → "empty bar = 20 total"
- **PR detection**: any set ≥ 62.5 kg (prototype stub — production: compare vs stored records); est. 1RM = Epley `w × (1 + r/30)`
- **Finish**: duration, volume (Σ w×r), set count, conditional PR card, coach debrief, set list; Done resets
- **Coach lines** are context-keyed per set number (e.g. set 3: "…this is the money set."); rest screen has its own line
- Tweakable props: `restSeconds` (30–300, step 15, default 120), `showCoach` (bool)
- Voice: terse gym partner. PRs get iron, not confetti. Coach never blocks logging — one line, above the CTA, always dismissible by ignoring it

## State Management
- Prototype state: `screen, weight, reps, sets[], restTotal, restLeft, elapsed` — maps to the codebase's existing workout checkpoint store
- Production needs: active workout (exercise index, sets per exercise), per-exercise rest defaults, set metadata (type: warmup/working/drop/failure; RPE; superset group id — schema already has `set_type`), PR records per lift, coach message queue keyed by moment (brief / set / rest / finish)
- Rest timer must survive app background/lock (live activity, screen 15)

## Assets
- `public/exercises/*.jpg` — 8 exercise thumbnails from the Wazn repo (`bench-press-barbell, deadlift-barbell, bicep-curl-dumbbell, chin-up, face-pull, full-squat, overhead-press-barbell, incline-bench-press-dumbbell`). Always rendered `filter: grayscale(1) contrast(1.05)`
- Plate mark + wordmark: inline SVG paths in `Wazn Brand - Logo.dc.html` (canonical)
- وزن barbell wordmark: SVG path in `Wazn Redesign - Home.dc.html` (hidden `display:none` block) and screen 16
- Fonts: Google Fonts — Sora, Hanken Grotesk, IBM Plex Mono, IBM Plex Sans Arabic

## Files
- `Wazn App - Screens.dc.html` — all 18 screens on one board (canonical spec)
- `Wazn Prototype.dc.html` — interactive core loop (canonical behavior)
- `Wazn Brand - Logo.dc.html` — brand sheet: wordmark, mark, app icons, in-app presence, color
- `Wazn Redesign - Home.dc.html` — standalone Home (imported by the board)
- `Wazn UX Audit and Roadmap.dc.html` — 10 severity-ranked findings + P0–P3 roadmap + success metrics (implementation order lives here)
- `support.js` — runtime for opening the `.dc.html` files in a browser (not for production)
- `public/exercises/` — thumbnails

## Suggested build order
Follow the roadmap in the audit file: **P0** surface existing code (CoachBrief on top, LoadHelper plate calc in set entry, PR moment, auto-rest, settings surface) → **P1** home feed + workout/rest/finish redesign + set types/supersets/RPE → **P2** brand rollout, routines, exercise detail, Hevy import flow → **P3** RTL flip, live activity, measurements.
