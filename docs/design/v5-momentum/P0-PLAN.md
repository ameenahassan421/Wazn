# v5 "Momentum": P0 implementation plan

> Note on punctuation: this document follows Ameen's no-dash rule in its own
> prose. Copy strings quoted in backticks reproduce the handoff **verbatim**,
> including its dashes, because the fidelity contract requires exact copy.

Status: **all three open questions answered by Ameen 2026-08-15 (§8). Holding for
his go on the plan as a whole. No code written yet.**
Written 2026-08-15 against `main` @ `8641384`, after reading the full handoff and
measuring both HTML references in a browser at 430px.

P0 per README §Suggested build order:

> tokens + type ramp swap, tab bar, Home hunt card, Live zones + BANK IT, rest
> canvas ring (all restyles of shipped logic)

Delivered as **five PRs**, each reviewable against the reference side by side.

---

## 0. What I measured, so the plan is grounded and not recited

Served the bundle over HTTP (Babel needs it: `file://` blocks the `.jsx`
fetches) and read computed values off the live prototype at a 430px viewport.

| Thing             | Measured                                                                                                                                                    | Source                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| BANK IT bar       | height 70, width 430, `bottom: 58` (sits on the tab bar), Saira 700 / 23px, `letter-spacing: 0.46px` (= 0.02em), bg `rgb(232,73,29)`, colour `rgb(28,14,8)` | `Wazn v5.html` live              |
| Stepper side zone | 82 wide by 107.5 tall                                                                                                                                       | same                             |
| mega step         | 84px, line-height 84px, weight 700, Saira, `tabular-nums`                                                                                                   | same                             |
| Tab bar           | 58px plus a 1px top hairline = 59, bg `rgb(11,9,6)`, which is neither `bg` nor `sur`                                                                        | `ui.jsx` `TabBar`                |
| Rest ring         | fills from 0 as rest elapses (`pct = 1 - rest/restMax`), 250px, 6px stroke                                                                                  | `screens_core.jsx` `RestOverlay` |

Reference server (leave running while reviewing):

```bash
cd docs/design/v5-momentum && python3 -m http.server 8791 --bind 127.0.0.1
```

---

## 1. Repo facts that change the shape of P0

Read these before the file map. Three of them contradict the README.

1. **The codebase has five tabs, not six.** README §Overview says the redesign
   "keeps the six-tab IA the codebase already has". `TabBar.tsx` ships
   `log | history | progress | coach | friends`. **Body is a net-new screen and a
   net-new tab**, not a restyle. Same for **Settings** (screen 17): there is no
   settings screen, and the unit toggle, locale toggle and Sign out live in the
   header and in Friends → You.
2. **`main` is already dark.** README §Color says v5 "replaces the current
   paper-default". It does not. `src/index.css` is dark only (`color-scheme:
dark`), amber `#f0b429`. The paper-first work is unmerged on
   `claude/r4-paper-first` (18 commits) and `claude/r5-exact-workout` (17).
   v5 supersedes both. **Recommendation: close those branches, do not merge.**
3. **The live loop is a board, not a linear queue.** The prototype walks one set
   at a time (`curSet()` finds the first not-done set). The shipped app renders
   `WorkoutOverview`, every exercise with its ghost rows, and a repeat set is
   committed by tapping its row (`commitGhost`), which **is** GATE U2's one tap.
   This is the plan's one real fork. See §3.
4. `src/lib/i18n.test.ts:121` enforces **exact EN/AR key parity**. Every copy
   string in this handoff needs an Arabic draft in the same PR or CI fails. `t()`
   falls back EN then raw key, so a draft is safe, and you are a native speaker,
   so that review is yours directly rather than an external dependency.
5. `scripts/check_coverage_floor.mjs` fails on any new `src/lib/*.ts` with
   neither a test file nor a written exemption. Six new lib modules below, so:
   six new test files.
6. The ESLint RTL guard only inspects `className` **string literals**. It does
   not see template literals or inline styles, and the prototype's idiom is
   inline styles. So the guard will not catch a physical property ported by
   accident. §7 says how I catch it instead.

---

## 2. Assets

Saira Semi Condensed is **not in the bundle**. The HTML pulls it from Google
Fonts. README §Assets requires self-hosting (the Egyptian-mobile-data rule).
Verified reachable from this session:
`css2?family=Saira+Semi+Condensed:wght@500;600;700` returns three **static**
latin cuts, with no variable file for this family.

| File                                                         | Action                                     | Size             |
| ------------------------------------------------------------ | ------------------------------------------ | ---------------- |
| `public/fonts/saira-semicondensed-{500,600,700}-latin.woff2` | fetch latin subset only, commit            | about 13 KB each |
| `public/fonts/hanken-grotesk-latin.woff2`                    | copy from `docs/design/v5-momentum/fonts/` | 34 KB            |
| `public/fonts/ibm-plex-mono-{500,600}-latin.woff2`           | keep, unchanged                            | 30 KB            |
| `public/fonts/ibm-plex-sans-latin.woff2`                     | **delete**, Hanken replaces it             | minus 45 KB      |

Net font weight: 75 KB becomes about **103 KB**. Deliberate, plus 28 KB, and I
will state it in the PR. Neither Saira nor Hanken covers Arabic. Arabic already
falls back to system fonts today, so this is unchanged, not a new gap.

---

## 3. RESOLVED: the rest-canvas z-order

> **Ameen, 2026-08-15: option B.** The rest canvas fills the screen at
> `z-index: 29`, below the BANK IT bar at 31. Tapping the canvas dismisses it,
> and tapping BANK IT dismisses and commits in the same tap, so GATE U2's one
> tap holds. Reference pixels are identical. The one-line deviation goes in
> `DECISIONS.md` when PR 5 lands, citing README §08 against §Do-not-regress #3.
> The reasoning below is kept as the record of why, since a future session will
> read `z-index: 29` against a prototype that says 57 and need to know it was
> deliberate.

**The handoff contradicts itself, and the two readings are different products.**

README §07 and §08 specify a linear live loop and a **full-screen rest takeover
on commit** (`inset: 0`, `z-index: 57`, over the BANK IT bar at `z-index: 31`).
I confirmed in the running prototype that it covers the commit control. README
§Do-not-regress #3 says: _"GATE U2: repeat-set commit stays 1 tap. Set entry,
commit control, and timer geometry never adapt."_

Both cannot be literally true. With the prototype's rest overlay, set 2 onward
costs **tap to dismiss, then tap BANK IT: 2 taps**. Today it is 1.

Three ways out. B was chosen.

|                                                                | What ships                                                                                                                                                        | GATE U2                                                                                 | Fidelity                                                            |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **A. Prototype exactly**                                       | Linear queue, full-screen rest over everything, tap to dismiss                                                                                                    | Broken as written (2 taps), unless "commit is 1 tap" is read as the commit action alone | 100%                                                                |
| **B. Full-screen rest, commit bar stays on top** (recommended) | Rest canvas fills the screen with its `z-index` **below** the BANK IT bar. Tap the canvas to dismiss, or tap BANK IT, which dismisses and commits in the same tap | Held: 1 tap                                                                             | About 98%. Identical pixels, one z-index differs from the prototype |
| **C. Keep the board**                                          | Rest canvas full-screen, but the underlying live screen stays `WorkoutOverview`                                                                                   | Held                                                                                    | Diverges most: the live screen is not the reference screen          |

B is the only option where the pixels match the reference and the gate the app is
built around survives. It puts the momentum chip and the next-set figure in view
_while the thumb is already on the commit control_, which is the surface's whole
argument. It also means the live screen stays the prototype's linear queue rather
than the board, so `WorkoutOverview` is restyled and not replaced.

A second, smaller fork in the same family, resolved with it: the current
`RestCanvas` only appears after **2 seconds of no touch** (`use-idle.ts`) and
never covers the log control, which is E1's shipped contract. The v5 canvas
appears **immediately on commit**. B keeps the immediate appearance (fidelity)
and keeps the control reachable (the gate). The `useIdle` gate retires.
`use-idle.ts` stays, since it has other callers, but the canvas stops calling it.

---

## 4. PR map: each P0 item to the exact files

### PR 1 · `v5/p0-tokens` · fonts, palette, type ramp

The foundation. No screen changes its layout, every screen changes colour and
face. Reviewable as "does anything look broken".

**Touched**

- `src/index.css`, the whole token layer:
  - `@font-face` times six: Saira 500/600/700, Hanken (variable 100 to 900),
    Mono 500/600. Drop Plex Sans.
  - `@theme` palette. **Re-point existing token names, do not rename**, so 30k
    lines of `text-muted` / `bg-surface` / `text-accent` keep working and the
    diff stays readable:
    `--color-ink` `#0f0d0a`, `--color-surface` `#181510`,
    `--color-raised` `#211d15`, `--color-line` `rgba(236,231,220,0.08)`,
    `--color-text` `#ece7dc`, `--color-muted` `#9a927f`,
    `--color-accent` `#e8491d`, `--color-accent-ink` `#1c0e08`.
  - New names with no incumbent: `--color-line-2` `rgba(236,231,220,0.16)`,
    `--color-faint` `#615b4d`, `--color-soft` `#f4a68c`,
    `--color-chip-bg` `rgba(232,73,29,0.15)`, `--color-brass` `#b08d3e`,
    `--color-brass-soft` `#d9bc7a`, `--color-brass-bg` `rgba(176,141,62,0.18)`.
  - `--color-accent-100` through `900`: **re-derived as an ember ramp** at the
    same nine perceptual lightness steps. Not in the bundle, since v5 has no
    tonal ramp, but `rep-fill-1` through `5`, `tag-pr`, `tag-accent` and the
    chart depth all reference them statically, and Tailwind v4 drops
    unreferenced `@theme` tokens (the comment at `index.css:196` is that scar).
    Flagged as an assumption per fidelity rule 2: **nearest sibling**, ember at
    amber's lightness.
  - Type ramp: the ten v5 steps as
    `--text-mega|hero|fig|num|title|body|label|kick|meta|nano`, each carrying its
    own weight, leading, tracking, transform and `font-variant-numeric` exactly
    as `ui.jsx` `T` declares them.
  - The seven legacy steps (`display|input|figure|title|body|label|micro`) stay
    **only until the last P1 PR**, when the final screen is ported. They are the
    scaffold that stops the app exploding while screens land one PR at a time.
    Deleting them is an explicit acceptance item on that PR, so the DoD's "only
    the ramp's steps exist" ends up verified rather than assumed.
  - Radii: `--radius-card: 16px`, `--radius-ctl: 12px`, `--radius-chip: 6px`,
    `--radius-pill: 999px`. The old `sm/md/lg` retire with the legacy type steps.
  - `--ring-hairline: 0 0 0 1px var(--color-line)`, and **drop `--top-light`**.
    README §Shape: "Elevation is the hairline ring, no drop shadows anywhere",
    and the inset top-light is a second shadow. This also deletes `btn-hero`'s
    `inset 0 1px 0 rgba(255,255,255,.25)`.
  - `chip-data` rewritten to the chip grammar: Mono 11, `soft` on `chipBg`,
    radius 6, padding `3px 8px`, `nowrap`.
  - Motion: add `--motion-bar: 500ms` with `cubic-bezier(.2,.8,.2,1)`,
    `--motion-overlay: 220ms`, `--motion-ring: 1000ms` linear. Keep the four
    existing tiers and the whole `prefers-reduced-motion` block.
  - `knurl`, and `tag-pr`'s knurl: **kept**, recoloured to ember. Not in v5, but
    it is the app's one texture and `docs/design-philosophy.md` owns it. Flagged
    as an assumption. Say the word and it goes.
- `src/components/Wordmark.tsx`, `src/components/wordmark-paths.ts`: **not
  touched in this PR.** The wordmark swap lands in PR 2 with the header band that
  carries it. See §5.
- `public/fonts/*` per §2.
- `index.html`: preload the two faces first paint needs (Saira 700, Hanken).

**Acceptance**: `npm run dev`, every screen renders in ember on iron. No amber
`#f0b429` remains outside a comment. The ten ramp steps exist as tokens. Lint,
typecheck, tests, build green.

---

### PR 2 · `v5/p0-chrome` · tab bar and header band

**Touched**

- `src/components/TabBar.tsx`: 58px, `background: #0b0906`, 1px `line` top
  border, equal flex children, labels at the `nano` step, active state is `soft`
  text plus a 2px ember rail across `insetInlineStart: 20%` and
  `insetInlineEnd: 20%` of the top edge. **Icons removed**, since v5 has none.
  `IconBarbell`, `IconHistory`, `IconTrend`, `IconStar` and `IconPeople` lose
  their last caller here (they stay in `icons.tsx`, used elsewhere).
  Five tabs, not six: **Body ships with the Body screen in P1**, because a tab
  that opens nothing is worse than a missing tab.
- `src/components/Wordmark.tsx`: **rewritten to the v5 Latin mark** per Ameen's
  2026-08-15 decision. Lowercase `wazn` in Saira 700 with the `a` in ember,
  `dir="ltr"` so it never mirrors, at the reference's 21px in the header.
  Keeps its `className` prop and swaps `height` for `size`, since the mark is now
  set type rather than a sized SVG.
  **`src/components/wordmark-paths.ts` stays.** It is not orphaned:
  `src/lib/share-card.ts:11` draws the وزن mark into the 4:5 share image via
  `Path2D`, and `scripts/build_logo.py` generates that module together with the
  PWA icons. So the decision retires the mark from **the interface only**, and
  three surfaces keep it: the share card, the app icon, and the favicon. That
  puts two marks in circulation at once, which is a real consequence rather than
  a detail, and it is called out in §5.
  This reverses a standing brand decision, so it goes in `DECISIONS.md` in this
  PR alongside the README §Assets line that requires it, and
  `docs/design-philosophy.md` gets a line recording that the interface mark and
  the asset mark are now different objects.
- `src/components/AuthScreen.tsx:327` renders `<Wordmark height={56}>` and the
  reference auth screen uses **34**. The prop rename touches this line in PR 2 so
  the build stays green; the 56 to 34 change and the rest of the auth restyle
  belong to P1's onboarding PR, where they can be measured against
  `Onboarding.html` in one pass.
- `src/components/Header.tsx`: 56px band, wordmark at the inline start, right
  slot carrying the screen name at `nano` in `faint` (or `LIVE` in `soft` during
  a workout, per the reference's `Header right=`), and a 34px round avatar button
  at the inline end.
  **The avatar does not open Settings yet**, because that screen is P1. Until
  then it opens the existing overflow menu, and the locale and unit toggles
  **stay where they are**. Removing them before their destination exists would
  strip the only way to switch unit or language. Assumption, flagged, and the
  swap is an acceptance item on the P1 Settings PR.
- `src/App.tsx`: bottom padding retuned for a 58px tab bar plus a 70px commit
  bar. The gutter is already 18px and does not change.
- `src/components/Header.test.tsx` (116 lines) updated. There is no
  `TabBar.test.tsx` today.
- `src/lib/i18n.ts`: no new keys, the nav keys already exist.

**Acceptance**: side by side with the reference tab bar at 430px, rail inset 20%
at both edges, `aria-current` preserved, Header tests green.

---

### PR 3 · `v5/p0-home` · the hunt card

Screen 06, minus the two pieces that need schema.

**New**

- `src/components/v5/` primitives, one file, the `ui.jsx` set as typed React over
  Tailwind tokens: `Kick`, `Chip`, `Card`, `Btn` (hero/line/ghost/ink), `Fill`,
  `RowStat`. `Ring` lands in PR 5 and `Spark` in P1. Everything after this PR
  composes these instead of re-deriving inline styles.
- `src/components/CheckInRow.tsx`: `HOW LOADED?` plus Fresh/Normal/Drained 30px
  chips, selected state is the text fill. One tap, never a modal, and skipping it
  means Normal, silently.
- `src/components/HuntCard.tsx`: kicker `TONIGHT · {ROUTINE}`, `BEAT` plus the
  volume at `hero` with a 22px `LBS` rider, the coach sentence and its one chip,
  then `START THE HUNT` (ember, 56px, full width).
- `src/components/RankCard.tsx`: rank name at `num` in `brassSoft`, a brass
  `Fill`, and the meta line `E1RM 170 · 10 TO STEEL I`.
- `src/lib/rank.ts` plus `rank.test.ts`: the ladder verbatim from `coach2.js`,
  `IRON I 120 · IRON II 150 · STEEL I 180 · STEEL II 210 · CHROME 240` on bench
  e1RM in **lbs**, with `rankOf` and `nextRank`. Stored kg converts to display
  lbs through the existing unit context. The ladder's thresholds are lbs and
  stay lbs.
- `src/lib/checkin.ts` plus `checkin.test.ts`: the mood value, local only in this
  phase (`browserStorage()`, the pattern `rest-canvas.ts` already uses). The
  column is P2 with the rest of the new schema.
- `src/lib/target.ts` plus `target.test.ts`: the BEAT figure, meaning the last
  same-routine total working-set volume. Working sets only, warm-ups excluded,
  which is what `coach2.lastVolume()` does (`s.t === 'normal'`).

**Touched**

- `src/screens/LogScreen.tsx`, the `if (!workout)` branch at lines **2123 to
  2226**. Order becomes check-in row, hunt card, rank card, stat tiles, plan
  list. `CachedNote`, `SyncNote` and `ErrorNote` stay first and unchanged: U3b's
  trust notes outrank the coach, and the comment at line 2129 is load-bearing.
  `RoutineList` becomes the plan-list rows (index at `meta` in `faint`, name,
  `N SETS`) with its controls preserved. `InstallPrompt` keeps its slot.
  `StreakPlates` is superseded by the STREAK tile, so it is **deleted along with
  its knurl plates**. Flagged, because the tile is the reference's answer to the
  same question.
- `src/components/CoachBrief.tsx`: restyled, not rewritten. It already renders
  one sentence and one chip from SQL and returns `null` when it has nothing to
  say. It becomes the hunt card's body, and that "returns null" behaviour is what
  makes the card degrade correctly at coach volume Quiet or Off and on a new
  account.
- `src/lib/i18n.ts`: new EN keys verbatim from the bundle, plus AR drafts.

**Deferred, and why**

- **Duel card**: needs the duels schema (P2). Its slot renders nothing until
  then. Nothing fake, no placeholder.
- **`THIS WEEK 4 / 5`**: the `/5` is a weekly target the schema has no column
  for. Renders `{sessions}` alone this phase, and `4 / 5` once the target exists.

**Acceptance**: side by side at 430px. No AI sentence without its chip. Brass
only on the rank. A new account still renders one button, per LAUNCH §1.

---

### PR 4 · `v5/p0-live` · zones, BANK IT, momentum bar

The biggest PR. Built on §3's option B, so the live screen becomes the
reference's linear queue and `WorkoutOverview` is restyled rather than replaced.

**New**

- `src/lib/ghost.ts` plus `ghost.test.ts`: coach-seeded ghosts, `coach2.buildPlan`
  verbatim. Plus 5 when every working set of that lift hit **8 reps or more**
  last session and the first working set carried weight, otherwise hold. Chip
  `▲ +5` or `→ hold`. Warm-ups and bodyweight rows never get a chip. The plus 5
  is in **lbs**, and stored kg is never rounded (CLAUDE.md), so the increment
  applies in display units and converts once, exactly as `SetEntry.submit()`
  already does.
- `src/lib/recalc.ts` plus `recalc.test.ts`: the under-plan recalc. When a
  committed working set lands at `reps < plan - 1`, drop the **remaining
  uncommitted working sets of that lift only** by 5, chip `↓ −5`, and set a
  per-lift `recalced` latch so it can never fire twice. Committed rows are never
  touched. Three properties, three tests: never-committed, never-twice, per-lift.

**Touched**

- `src/components/SetEntry.tsx` (547 lines): the two labelled inputs become the
  full-bleed stepper zones. 82px minus and plus side buttons at full row height,
  hairline `borderInlineEnd` and `borderInlineStart`, a centred `Kick` at 9px,
  the value at `mega` 84 for LBS and 56 for REPS, rows separated by hairlines,
  and bodyweight rows showing REPS at 84. Then the `+{w×r} LBS TO THE BAR` chip.
  The commit button leaves the flow and becomes the fixed BANK IT bar.
  **Kept exactly as is**: the render-time draft seeding (`seededFor` and
  `draftUnit`, which is CLAUDE.md's state rule plus the effect that broke
  auto-fill once), the unit conversion, `logRampStep`, the set-type / RPE /
  superset row, and the warm-up mode's visible demotion.
- `src/components/BankItBar.tsx` (new): fixed, 70px, ember on `emInk`, Saira 700
  at 23px and `0.02em`, `bottom: 58px` plus safe-area, with the live label
  `BANK IT · 125 × 8`. Its own component because both the board and the focused
  view mount it, and its z-index is the §3 decision.
- `src/screens/LogScreen.tsx`: the momentum bar (6px `Fill`, session working-set
  volume over target, `SESSION VOLUME` becoming `RECORD PACE` in `brassSoft`
  with a brass fill at 100% or more, and `{v} / {target} LBS` at `meta`); the
  status strip (elapsed at `meta`, `TELL THE COACH`, `FINISH`), where **`TELL THE
COACH` renders inert in P0** because the sheet is P1; and the exercise header
  (`title` 24 to 26 plus the meta line `SET n / m · LAST 120×8 · ▲ +5`).
  The armed-Finish and armed-Discard pair stays two taps, unchanged.
- `src/lib/plan.ts` (313) plus `plan.test.ts` (319): `buildBlock` gains the ghost
  increment and the recalc latch. This is where GATE U2's one-tap commit is
  computed, so this diff gets the most careful reading in the PR.
- `src/lib/commit.ts` and `commit.test.ts`: `commitOutcome` gains the
  notable-set classification (PR, heaviest in 4 sessions, under-plan,
  exercise-complete) as **data only**. The toasts and the PR full-screen that
  consume it are P1. P0 computes and unit-tests them, so nothing model-shaped
  ships behind an unreviewed surface.
- `src/components/WorkoutOverview.tsx` (790) plus its test (424): restyled to the
  ramp, structurally **untouched**. It keeps its one-tap ghost commit, which is
  the other half of GATE U2, and it remains the surface that owns reorder,
  supersets, per-exercise notes and rest overrides. The reference has no home for
  those, and dropping them to match a prototype that never had them would be the
  reinterpretation fidelity rule 2 forbids in the other direction.
- `src/components/SetEntry.test.tsx` (382), `src/screens/LogScreen.test.tsx`,
  `e2e/smoke.spec.ts`, `e2e/offline.spec.ts`: updated to the new geometry.

**Acceptance**: repeat-set commit is **1 tap**, proven by a test that counts
taps rather than by inspection. Ghost chips render up, hold and down from
computed history. The recalc fires once and never on a committed row. The BANK IT
label live-updates. The momentum bar flips brass at 100%. The airplane-mode
session (LAUNCH §4) still passes end to end. Nothing on the path exceeds 200ms.

---

### PR 5 · `v5/p0-rest` · the rest canvas

**New**

- `Ring` in `src/components/v5/`: 250px, `sur2` track, ember arc,
  `strokeDasharray = C`, `strokeDashoffset = C × (1 - pct)`, `rotate(-90deg)`,
  `transition: stroke-dashoffset 1s linear`. **`pct = 1 - remaining/total`, so
  the ring FILLS as rest elapses**, which is the DoD line and DESIGN.md's rule,
  and the opposite of today's draining bar.

**Touched**

- `src/components/RestCanvas.tsx` (183): from an inline card to the full-screen
  ground takeover. The `REST — THE COACH IS THINKING` kicker (which becomes
  `REST` at Quiet), the ring with a mega-64 countdown inside, `NEXT — {LIFT}`
  plus the next-set figure at 38 plus its reasoning chip plus the momentum chip
  (`N LBS LEFT TO BEAT LAST PUSH`, or brass `RECORD PACE` at 100% or more), then
  `TAP TO GO EARLY`. Tap anywhere dismisses. No input, no question, silent.
  **Retired**: the `useIdle` 2-second gate, `REACH_SECONDS`, and the permanent
  dismissal with its undo. The v5 canvas is not dismissible forever, because it
  is the rest screen. That deletes a shipped affordance, so it goes in
  `DECISIONS.md` with the README §08 line that requires it.
- `src/lib/rest-canvas.ts` (290) plus `rest-canvas.test.ts` (406): `RestCard`
  changes shape from `{kicker, subject, value, note}` to the next-set payload.
  `pickRestCard`'s fact selection is superseded.
  `recordCoachView('rest_canvas')` and migration 0022's rows are kept, so the
  existing telemetry keeps answering the same question.
- `src/components/RestTimer.tsx`: `RestTimerBar` **keeps its slot**, because once
  the canvas is dismissed the board still needs a visible countdown, and a rest
  you cannot see is a rest that does not exist. Its drain stays the app's one
  `linear` motion. Note the deliberate asymmetry, which I will state in the PR:
  the canvas ring **fills** (README §08) while the bar **drains**
  (`RestTimer.tsx`). Two readouts of the same clock running opposite directions
  is the kind of thing that looks like a bug in a screenshot, so if you would
  rather the bar fill too, say so and it is a one-line change.
- `src/lib/use-rest-timer.ts` (121): exposes `total` alongside `remaining` so the
  ring can compute `pct`. Purely additive, and nothing about the timer's honesty
  across an app kill changes.
- `src/components/RestCanvas.test.tsx` (157): rewritten to the new surface.

**Acceptance**: full-screen. The ring **fills**. Next set, reasoning chip and
momentum chip all present. Dismisses on tap. **Silent** at zero (LAUNCH §4).
Never asks anything. The commit control stays reachable per the §3 decision.

---

## 5. Held back deliberately, with reasons

| Item                                         | Why not in P0                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wordmark: RESOLVED, and it lands in PR 2** | Ameen, 2026-08-15: adopt the v5 Latin `wazn`. It retires the وزن Loaded Ink mark from the **interface**. It does not retire it from the share card, the app icon or the favicon, all of which draw from `wordmark-paths.ts` and `scripts/build_logo.py`. Two marks now circulate, deliberately. Logged in `DECISIONS.md` and `docs/design-philosophy.md` in PR 2. |
| **Body tab and screen**                      | Net-new (§1.1). P1.                                                                                                                                                                                                                                                                                                                                               |
| **Settings screen**                          | Net-new. P1, and it is the destination the header's unit, locale and sign-out controls move to.                                                                                                                                                                                                                                                                   |
| **Duel card, rank persistence**              | New schema. P2.                                                                                                                                                                                                                                                                                                                                                   |
| **Toasts, PR full-screen, finish verdict**   | P1 per README order. P0 computes their inputs in `commit.ts` and tests them.                                                                                                                                                                                                                                                                                      |
| **Tell the coach sheet**                     | P1 or P2, with the Edge Function route. The status strip renders its slot without the sheet.                                                                                                                                                                                                                                                                      |
| **`LAUNCH.md` has no Body section**          | The DoD asks for "all six day-one empty states with LAUNCH.md copy verbatim". LAUNCH.md documents **five** tabs and has no Body copy. Body's empty line comes from the bundle (`Log a weigh-in to start the second chart.`) and I will **add it to LAUNCH.md** in the Body PR, so that DoD line becomes true instead of being quietly reinterpreted.              |

---

## 6. Ordering and gates

```
PR1 tokens ──► PR2 chrome ──► PR3 home
                        └───► PR4 live ──► PR5 rest
```

PR1 lands first and alone. §3 is answered, so nothing is blocked. Before PR1, one
housekeeping step per Ameen's 2026-08-15 call: close `claude/r4-paper-first` and
`claude/r5-exact-workout` unmerged, so no later session mistakes the paper
direction for live work. Each PR runs the full wall before push:

```bash
npm run lint && npm run format:check && npm run typecheck && npm run check:vercel && npm run check:coverage && npm test && npm run build
```

Plus what CI also runs and that list omits, per CLAUDE.md's own correction:
`check:migrations`, `check:sql`, `deno check` on the functions, and the
Playwright `smoke` job. There are no migrations in P0, so the SQL pair is a no-op
here. They start mattering at P2.

---

## 7. How each PR proves fidelity rather than claiming it

- **Screenshot pairs.** The reference at 430px beside the built app at 430px, in
  the PR body. §7.0's own lesson: three defects came out of one screenshot Ameen
  took while lint, typecheck, 818 tests, a build and Playwright were all green.
  The wall cannot see this class of defect, so the screenshot is not optional.
- **A token grep, not an eyeball**, for the DoD's "only the ramp's steps exist":
  a script that fails on any `text-[` or `font-size` literal outside the ramp.
- **A physical-property grep over inline styles too**, since the ESLint guard
  only reads `className` literals (§1.6) and the prototype's idiom is inline
  styles. Covers `left`, `right`, `marginLeft`, `paddingLeft`, `borderLeft` and
  friends across `src/`.
- **A chip-grammar test**: every component that renders an AI sentence renders
  exactly one `chip-data`, and renders nothing at all without one.
- **A tap-count test** on repeat-set commit, so GATE U2 is asserted in CI rather
  than remembered.
- **An RTL pass at each PR**, not deferred to P3: flip to `ar` and screenshot.
  The mirrored-weights defect (`icon-start` sitting on `↺ 100 × 8`) is exactly
  what shipping a stepper zone without looking would reproduce.

---

## 8. Decisions taken, 2026-08-15

| Question                       | Ameen's call                                                                                                          | Where it lands                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Rest-canvas z-order vs GATE U2 | **Option B.** Canvas at `z-index: 29`, below the BANK IT bar at 31. Tapping BANK IT dismisses and commits in one tap. | PR 4 and PR 5, logged in `DECISIONS.md`                        |
| Wordmark                       | **Adopt the v5 Latin `wazn`.** Interface only; the share card, app icon and favicon keep the وزن mark.                | PR 2, logged in `DECISIONS.md` and `docs/design-philosophy.md` |
| The paper-first branches       | **Close both unmerged.**                                                                                              | Before PR 1                                                    |

Two smaller assumptions raised in passing, neither of which blocks, and both
reversible with a word:

1. The canvas ring **fills** while the timer bar **drains** (PR 5). Faithful to
   the handoff, and visibly asymmetric.
2. `knurl` and the ember-recoloured `tag-pr` survive P0 (PR 1), because
   `docs/design-philosophy.md` owns the texture even though v5 does not mention
   it.

Nothing blocks. Everything in §4 is ready to execute.
