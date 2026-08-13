# Rebuild stage: adopting the prototype's world

Authorized by Ameen 2026-08-12 ("GO"), with loop-through execution: each
phase is reported with screenshots when it lands, and work continues without
blocking on approval. Ameen can stop or redirect at any report. Destructive
changes (database, auth) still stop and ask; nothing in this stage should
need one.

Decision context: DECISIONS.md 2026-08-12 ("Direction decided"). The world
is the prototype's, dark-first. Ember replaces amber as the single accent.
The وزن mark stays canonical with its iron recolored; the Latin lockup faces
the interface. Coach is template statistics, never an LLM on the logging
path.

What "adopt dark-first" means against the existing v2 token system: the
ground ramp (ink, surface, raised, line) is already the warm near-black the
world wants and is deeper than the prototype's, which is better on OLED. It
stays. The identity carries in the accent hue, the typography, and the
interaction upgrades.

## Phases

**R1: Tokens, type, logo.**
Ember ramp (9 steps, hue held at ~14) replaces the amber ramp under the same
token names, so every consumer moves at once. Contrast note that changes
usage: ember-500 on ink is ~4.7:1 (chrome and large text), not amber's ~9:1;
small accent text moves to ember-300. Typography: Sora (display, titles,
figures: the numerals voice) and Hanken Grotesk (body, labels) replace Plex
Sans; IBM Plex Mono keeps the meta voice, same as the prototype. Both new
faces self-hosted as latin variable woff2 in public/fonts, precached like
everything else; Google Fonts stays out of the app. Logo iron recolors amber
to ember via scripts/build_logo.py; manifest theme_color, share-card canvas,
chart hues, and every hardcoded amber hex follow. PRODUCT.md's design
constraint block updates to match.
Gate: every screen screenshot-verified in EN and AR; full CI wall green.

**R2: The logging screen in the new world.**
Rest presented as the inline chip pattern from the prototype (the full-page
timer becomes the expansion); the workout board, set rows, steppers, and
overview re-dressed in the new type scale; inline PR moment kept at commit.
No schema changes. Gate: the 30-second one-hand log is measurably unharmed;
screenshots EN/AR.

**R3: Home, History, Progress, and coach statistics.**
Remaining screens re-dressed. The coach block ships as template-driven lines
computed from existing RPCs (previous_session, exercise_1rm_history): last
session delta, ramp suggestion, PR proximity. Strings live in the i18n
catalogue, EN and AR. No model calls anywhere. Gate: screenshots EN/AR, wall
green.

**R4: The paper theme, as the DEFAULT (Ameen, 2026-08-12).**
Ameen reversed the dark-first call when he saw it: the app opens in the
paper world he designed, and dark becomes the toggle (user_preferences
already stores locale and unit; theme joins them, localStorage-first like
locale so the migration can land later). Gate: both themes pass the same
screenshot pass; contrast holds AA in both; the accent-step rule flips with
the theme (dark ember for small text on paper).

**THE EXACT-MATCH MANDATE (Ameen, 2026-08-12, supersedes R5/R6 as written):**
"I need a full implementation of that design. Meaning that you refactor
everything and make it look exactly like the design." The prototype at
/prototype (public/prototype.html) is the pixel spec. The app's engines
(deadline rest timer, write queue, offline ladder, RPCs) stay; every
visible surface rebuilds to the design. Consequence, logged in
DECISIONS.md: the old no-shadow/no-pill rules are superseded by the
design's own language: pill buttons (radius 99), cards at 18-20px radius,
the design's card shadow and the ember CTA shadow, the plate-glyph
iconography.

Shared token additions for both phases: --radius-xl: 20px, --radius-pill:
99px, --shadow-card (0 1px 2px + hairline), --shadow-cta (0 10px 26px
ember at 35%), the glyph component (ring/dot/plate marker set drawn once).

**R5: Workout experience parity with the prototype (Ameen, 2026-08-12).**
Exact spec per surface, referenced against /prototype:

- Exercise card: 44px thumb radius 12, name Sora 17/-.02em, "set N of M ·
  equipment" mono 12 muted, ghost line "last {day} 60×5 · 60×5 · 60×4"
  mono 12, logged rows as donut + set number + "62.5 kg × 5" mono 14 with
  the inline PR tag kept.
- Stepper panels: two white/surface cards, mono 11 uppercase labels
  (WEIGHT · KG / REPS), 48px step buttons flanking the Sora 29 value,
  direct typing preserved.
- Coach line: plate glyph + Hanken 13/1.5 body-dim, between steppers and
  plate card; template statistics only.
- Plate card: "ON THE BAR · PER SIDE" mono 11 uppercase + Sora 15 math +
  the barbell SVG end-on; this is LoadHelper's data surfaced as the
  prototype's card (bar picker and ramp stay one tap deeper).
- Session queue card: SESSION · N TO GO, current row donut + live a/b
  sets, done rows check dot, upcoming hollow rings + scheme, rows jump.
- CTA: ember pill h-60 with glyph + "Log set N — W × R" composed label.
- Rest: chip above the CTA (flip ground, 28px ring, mm:ss Sora 17, +30s,
  skip), tap expands to the full dark rest screen (240px ring drawing
  down, Sora 54 countdown, REST · OF total, ±30s pills, coach card, next
  row) as a layer over the workout screen; engine untouched.
  Gate: side-by-side frames against /prototype read as the same product, in
  paper, dark, EN, AR.

**R6: Home and finish ceremony parity.**

- Home: date/week/progress line Hanken 13 muted, "{Plan} day," + name
  Sora 34/1.12, coach card (glyph + COACH kicker + body), the flip-ground
  "Up next" card (kicker, plan name Sora 22, meta line), routines and
  recap kept below, Start pill h-58 with glyph fixed at the thumb.
- Finish: kicker date · workout N, "In the books." Sora 34, three stat
  panels (duration/volume/sets, Sora 22 values), one PR card per exercise
  (barbell-plate glyph, NEW PR kicker, name — best set, est 1RM line),
  debrief card (glyph + Hanken 14/1.6), per-exercise breakdown card with
  warm-up rows muted and PR tags, Share card + Done as paired pills.
  Gate: same side-by-side standard.

## Not doing in this stage

Warm-up ramps as data (needs routine schema thought, its own decision),
Apple/Google auth, payments, social, anything Stage 4B. The prototype page
at /prototype stays as-is as the reference artifact.

## Status

- R1: built 2026-08-12, PR open. Ember ramp under the old token names with the small-text rule enforced (accent-300 for anything 14px and under), Sora/Hanken/Plex Mono triad wired through the size tokens with zero component changes, logo iron and share card and SEO pages and privacy page recolored, PRODUCT.md and CLAUDE.md updated. Verified: 38-shot EN gallery both widths, AR pre-auth spot check, wall green except the known lazy-screen Node 26 case.
- R2: built 2026-08-12, PR open. Reduced on evidence: the incumbent rest bar already implements the chip pattern's intent with better mechanics than the prototype (deadline-based, composited drain, never blocks the board), so it was kept, not rebuilt; deviation logged in DECISIONS.md. The phase's real content was the numerals voice: 17 arm's-length figures set in raw pixel sizes (set inputs, ghost rows, rest countdown, edit dialog, records) now carry Sora via font-display. Active-flow gallery verified.
- R3: built 2026-08-12, PR open. The re-dress was already carried by R1/R2 tokens; the phase became the Arabic pass the wall cannot see. The shot harness grew an AR sweep (five tabs plus the live board, by Arabic accessible names), which caught and fixed: two hardcoded English strings on the workout board (superset round, add set), an untranslated aria-label, a scrambled bidi meta line and set counter, the coach data chip rendering RTL, English "today"-class day words everywhere (formatRelativeDay is now locale-aware with a when.* key family), and untranslated muscle-group names on Progress (muscle.* key family plus muscleLabel helper). Coach statistics already shipped as a template surface and stand.
- R4: shipped 2026-08-12 (PR #75). Paper is the default; dark is the toggle.
- R5a: the rest chip and the expanded rest view. Plate glyph set and the
  design's surface tokens entered the system.
- R5b: the stepper panels.
- R5c: built 2026-08-13. The rest of the workout surface — exercise card
  (44px thumb at radius 12, Sora 17 name, "set N of M · equipment", the
  ghost line demoted to one mono row, logged rows as donut + mono 14
  figures), the plate card promoted out of the LoadHelper disclosure with
  a new `describeBarMath` formatter, the session queue, the composed CTA
  pill, and the pinned commit cluster the design's structure requires.
  Found and fixed on the way: `--shadow-card` was written against an
  undefined `--line`, so every panel R5b shipped drew no edge at all;
  three kickers had lost the RTL reset; the weight panel's label wrapped;
  equipment names rendered in English under Arabic (new `equipment.*`
  family and `equipmentLabel`); nine hardcoded English strings inside the
  load disclosure. The shot harness could not reach the focused view at
  all — it photographed the overview and called the gate met — so it grew
  an entry sweep (card, commit cluster, plate card open) in EN, AR and
  dark. Verified: 38 shots, full wall green.
- R6a: built 2026-08-13. The home surface — streak meta line, Sora 34 hero,
  the coach card re-dressed with its plate mark, the flip-ground Up next card,
  and Start as a pill fixed at the thumb. The design's greeting needed a name
  the app has never collected and a duration estimate nothing computes; both
  adapted rather than faked, logged in DECISIONS.md. The flip ground becomes
  tokens derived from the ramp, so it needs no dark override.
- R6b: built 2026-08-13. The finish ceremony — kicker with the counted
  ordinal, "In the books.", three stat panels, an ember-tint card per record
  with the set behind it, the debrief as a card, the full breakdown with
  warm-ups muted, and Share/Done as paired pills. The finish screen had never
  been photographed by any run; it is now, in EN, AR and dark.
- R6c: built 2026-08-13. The coach's own voice in Arabic. `briefSkeleton`,
  `briefChip`, `debriefSkeleton`, `debriefChip` and all four rest-canvas cards
  composed English template literals; they take a locale now. Plus the two
  systemic Arabic rules the shot pass surfaced — `meta-mono` for mono lines
  carrying translated words, and "a figure never leads a translated sentence".
  The model-generated line stays English: that is a prompt question for the
  Edge Function, not an i18n one.

## Consequences ledger (Ameen, 2026-08-12: "make best of two worlds,

## plan the consequences, account for them, solve them")

Each row: what the exact-match refactor would break or risk, and the
resolution that keeps both worlds.

1. Shadows and pills vs the old §2.4. Superseded deliberately, as tokens
   (--shadow-card, --shadow-cta, --radius-pill), not ad hoc. The hairline
   ring stays for every surface the design does not draw with a shadow.
2. Ember text on solid ember controls. The design's white-on-ember is
   3.7:1, under AA. The app keeps ink-on-ember (~4.9:1) in both themes.
   This is the one place "exact" yields, and it yields to legibility law.
3. The prototype's sub-48px chip controls. Raised to 48px minimum; the
   chip runs a few pixels taller than the design. Thumb law wins.
4. Full-screen rest as an interruption risk. It is entry-by-tap only,
   never automatic; the chip is the default; back gesture, chevron, next
   row, and rest-end all collapse it; the board never unmounts under it.
   The deadline engine and the canvas rules are untouched.
5. Space cost of the plate card and queue on 390px. The logging column
   scrolls; the commit cluster is pinned; nothing reachable only by luck.
   **This row was a claim, not a fact, until R5c.** The focused view had no
   pinning at all — the overview's sticky rest bar was overview-only — so
   every surface R5 promoted pushed the commit button further below the
   fold. R5c gives the focused view the design's own structure: a scrolling
   column above a pinned cluster (rest chip, CTA, next), on the same
   sticky recipe and the same tab-bar clearance as the overview's bar.
6. Budget-Android performance. Ring updates are composited transforms on
   1s ticks that already existed; shadows are static; no new render loops;
   the font bill was paid in R1 (+23KB).
7. Tests pinned to the old DOM. Component tests are updated with the
   surfaces, keeping behavioral assertions (what commits, what starts
   rest) over structural ones.
8. RTL and Arabic. Every new surface uses logical properties, dir
   isolates on numerals, and gates on the AR gallery sweep.
9. The prototype's phone frame and fake 9:41 status bar are prototype
   affordances, not product UI. Not ported. Documented exception to
   "exactly".
10. Coach lines in the logging flow. Template statistics from data the
    app already has; never a model call on the logging path (standing
    scope rule). The AI coach surfaces stay where they are.
11. Cross-device theme memory waits on migration 0025 being applied to
    production, which is Ameen's explicit go; localStorage carries it
    until then.
12. The knurl stays the system's only texture; card shadows do not stack
    with it on the same surface.
13. The logged-set rows drop from 24px figures to the design's mono 14.
    That 24px was itself a logged raise, made under §2.4 when the row was
    the only figure on the screen. It no longer is: the Sora 29 stepper
    directly below carries the arm's-length job, and the design reads
    these rows back as the ledger of what landed. The raise is reversed
    on the reasoning that produced it, not against it.
14. The design's CTA becomes "Finish workout" on the last finished lift.
    Not ported. Finishing is irreversible and the app guards it with a
    two-tap confirm in the chrome; a one-tap finish in the commit cluster,
    where the thumb is already landing every 90 seconds, would trade that
    guard away. "Next: {name}" — reversible — does ship.
15. "Complete" is softer here than in the design. `planned` is derived
    (routine target → last session's working count → one), so a freestyle
    lift reads complete the moment it matches last week. Logging therefore
    stays the primary action at all times, and the card carries its own
    finished sentence ("3 of 3 done") so it can never read "set 3 of 3"
    over a button offering set 4.
16. Kickers use the app's `kicker` utility (mono 11, 0.14em) rather than
    the design's 0.1em. The utility carries the rule Arabic needs —
    tracking and uppercase reset under `[dir='rtl']`, because tracking out
    a connected script breaks its joins. R5a/R5b hand-rolled the recipe in
    Tailwind classes and lost that reset; the AR gallery caught it.
17. The design's home greeting names the lifter. This app has never
    collected a name — `profiles.display_name` is unwritten since 0001 —
    and a username greeting is worse than none, so the hero names the day.
    Its "~55 min" is dropped for the same class of reason: no source.
18. The finish duration reads in minutes, not the design's M:SS, and the
    coach's brief and debrief stay dismissible surfaces rather than fixed
    ones. Both are the app's existing decisions, kept.
19. The model-written coach sentence is still English under Arabic. Its
    language is a prompt question for the `coach-brief` Edge Function, not
    a catalogue question; the deterministic skeleton beneath it, which is
    what shows offline and before the model answers, is now translated.
20. The expanded rest ring DRAINS; the design's fills. The design is
    self-consistent — both its rings fill — and this app is not: its chip
    has drained since before R5, the motion system names the utility
    `timer-drain`, and R5's own spec asks for a ring "drawing down". Two
    rings for one timer disagreeing about which way time runs is worse
    than either convention, so both drain.
