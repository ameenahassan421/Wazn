---
name: Wazn
description: A strength log with the weight of iron — chalk on paper, ember on ink.
colors:
  ember: '#e8491d'
  ember-deep: '#9a3012'
  ember-ink: '#1c0e08'
  chalk-ground: '#f7f3ec'
  chalk-surface: '#ffffff'
  chalk-raised: '#efe9dd'
  chalk-hairline: '#e6e0d4'
  graphite: '#16130e'
  graphite-muted: '#6b6559'
  iron-ground: '#0c0b0a'
  iron-surface: '#161513'
  iron-raised: '#1f1d1a'
  iron-hairline: '#2a2825'
  chalk-text: '#ecebe8'
  chalk-muted: '#8d8983'
typography:
  display:
    fontFamily: 'Sora, ui-sans-serif, system-ui, sans-serif'
    fontSize: '44px'
    fontWeight: 600
    lineHeight: 1.05
  input:
    fontFamily: 'Sora, ui-sans-serif, system-ui, sans-serif'
    fontSize: '30px'
    fontWeight: 500
    lineHeight: 1.1
    fontFeature: 'tnum 1'
  figure:
    fontFamily: 'Sora, ui-sans-serif, system-ui, sans-serif'
    fontSize: '24px'
    fontWeight: 500
    lineHeight: 1.15
    fontFeature: 'tnum 1'
  title:
    fontFamily: 'Sora, ui-sans-serif, system-ui, sans-serif'
    fontSize: '19px'
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: 'Hanken Grotesk, ui-sans-serif, system-ui, sans-serif'
    fontSize: '15px'
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: 'Hanken Grotesk, ui-sans-serif, system-ui, sans-serif'
    fontSize: '13px'
    fontWeight: 400
    lineHeight: 1.4
  kicker:
    fontFamily: 'IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace'
    fontSize: '11px'
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: '0.14em'
  micro:
    fontFamily: 'Hanken Grotesk, ui-sans-serif, system-ui, sans-serif'
    fontSize: '11px'
    fontWeight: 500
    lineHeight: 1.2
rounded:
  sm: '4px'
  chip: '5px'
  tag: '6px'
  md: '8px'
  thumb: '12px'
  lg: '14px'
  panel: '18px'
  xl: '20px'
  pill: '999px'
spacing:
  gutter: '18px'
  stack: '12px'
  tight: '6px'
  touch: '48px'
  container: '430px'
components:
  button-hero:
    backgroundColor: '{colors.ember}'
    textColor: '{colors.ember-ink}'
    rounded: '{rounded.md}'
    height: '60px'
    typography: '{typography.title}'
  button-primary:
    textColor: '{colors.ember}'
    rounded: '{rounded.md}'
    height: '48px'
    padding: '0 16px'
  button-secondary:
    textColor: '{colors.graphite}'
    rounded: '{rounded.md}'
    height: '48px'
    padding: '0 16px'
  button-quiet:
    textColor: 'color-mix(in srgb, #16130e 55%, transparent)'
    rounded: '{rounded.md}'
    height: '48px'
    padding: '0 16px'
  surface-card:
    backgroundColor: '{colors.chalk-surface}'
    rounded: '{rounded.xl}'
  surface-panel:
    backgroundColor: '{colors.chalk-surface}'
    rounded: '{rounded.panel}'
  input-figure:
    textColor: '{colors.graphite}'
    typography: '{typography.input}'
    height: '44px'
    width: '100%'
  chip-data:
    textColor: '{colors.ember-deep}'
    rounded: '{rounded.sm}'
    padding: '3px 7px'
    typography: '{typography.kicker}'
  tag-pr:
    textColor: '{colors.ember-ink}'
    rounded: '{rounded.sm}'
    padding: '0 6px'
    height: '22px'
    typography: '{typography.kicker}'
---

# Design System: Wazn

## Overview

**Creative North Star: "Loaded Ink"**

Loaded Ink is the conviction that a word can have mass — not describe mass,
have it. The mark, the numerals and the surfaces are all treated the way a
lifter treats iron: as objects with a centre of gravity and a load path.
Everything either bears on the horizontal axis or hangs from it. Nothing
floats, and nothing is decorative. The philosophy is written out in full in
`docs/design-philosophy.md`; this file is where it becomes tokens.

Two materials, and only two: **chalk and iron.** Chalk is the human trace —
the off-white ground of the default paper theme, the written word, the hand.
Iron is the machine — the warm near-black of the dark theme, and the single
ember accent that is the material of the bar itself. Every surface in the app
is one or the other. The system ships both grounds from one token set: the
same semantic names (`ink`, `surface`, `text`, `muted`) resolve to paper by
default and to iron under `[data-theme='dark']`, and the ember ramp is
_mirrored_ between them so each step keeps its role rather than its lightness.

Density is the other half of the personality. This is a screen read at arm's
length by someone with chalked hands, one thumb free, between sets, under
whatever lighting the gym has. So the figures are enormous and tabular, the
touch targets never go under 48px, and the chrome gets out of the way: no
tab bar, no spinner on the hot path, no celebration screen. Motion is a plate
landing, not a page turning — four durations in the whole app, two easings,
and nothing on the logging path over 200ms.

**Key Characteristics:**

- Two grounds from one token set — paper by default, iron on request, never a
  third
- One accent, ember `#e8491d`, and it is the only colour in the app
- Numbers are the interface: Sora, tabular, never below 24px
- Depth is an edge and a fill, not a drop shadow
- One texture — the knurl — confined to thin bands and the PR badge
- Logical properties only, because the Arabic flip is a planned flip, not a
  rewrite

## Colors

A two-material palette: warm off-white chalk and warm near-black iron, lit by
exactly one hue.

### Primary

- **Ember** (`#e8491d`): The material of the iron, never decoration. It marks
  the one action a screen exists for, the record, the live rest bar, and the
  data a coach's note was drawn from. Nothing else in the app carries hue.
- **Ember Deep** (`#9a3012`): Not a shade choice — a contrast requirement. Every
  small accent string (chips, labels, meta, error text) uses this tier, and it
  is the only accent value that clears 4.5:1 on every surface in both themes:
  6.77:1 on the chalk ground, 7.49:1 on chalk surface, and (as `#f4a68c`)
  9.28–10.00:1 on iron.
- **Ember Ink** (`#1c0e08`): The near-black that sits _on_ a filled ember
  surface — the hero button's label, the PR badge's stamp.

### Neutral — the chalk ground (default theme)

- **Chalk Ground** (`#f7f3ec`): The page. Warm, not white; a paper sheet under
  gym light.
- **Chalk Surface** (`#ffffff`): Cards and panels — the objects lying on the
  page.
- **Chalk Raised** (`#efe9dd`): Menus and pressed states. (The header band is a
  separate token, `--header-tint: #efe9df` — one digit apart and deliberately
  not the same value. Don't collapse them.)
- **Chalk Hairline** (`#e6e0d4`): A drawn border, when something genuinely
  needs a line rather than an edge.
- **Graphite** (`#16130e`): Text. Warm near-black, never pure black.
- **Graphite Muted** (`#6b6559`): Meta, timestamps, secondary lines.

### Neutral — the iron ground (dark theme)

- **Iron Ground** (`#0c0b0a`): Near-black, warm as unlit iron. Readable under
  gym lighting without flashing white at someone mid-set.
- **Iron Surface** (`#161513`) / **Iron Raised** (`#1f1d1a`) / **Iron
  Hairline** (`#2a2825`): The same three tiers as chalk, one material down.
- **Chalk Text** (`#ecebe8`) / **Chalk Muted** (`#8d8983`): The written trace
  on iron.

### Named Rules

**The Two Materials Rule.** Chalk and iron, plus ember. A third hue is not a
design decision to be weighed; it is a defect. Charts, states, categories and
muscle groups all express difference through the ember ramp or the neutral
ramp, never through a second colour.

**The Mirrored Ramp Rule.** `accent-100` through `accent-900` swap ends between
the two themes so that each step keeps its _role_: `300` is always "small
accent text readable on this ground", `800`–`900` are always "tinted fill".
Never reach for a step by its lightness; reach for it by its job.

**The 500-Is-Chrome Rule.** `accent-500` is large text and chrome only. Small
accent text uses `accent-300`. A 500-on-ground body-copy use is a contrast
defect, not a taste question — and it is **worse on the default theme than the
rule's original wording admitted**. Measured 2026-08-14:

| ember-500 against | ratio      | verdict         |
| ----------------- | ---------- | --------------- |
| chalk ground      | **3.51:1** | large text only |
| chalk surface     | **3.89:1** | large text only |
| iron surface      | 4.69:1     | passes AA       |
| iron ground       | 5.06:1     | passes AA       |

The `~4.7:1` figure in `src/index.css` is the **iron-surface** number, written
when dark was the only theme. Paper became the default on 2026-08-12 and the
figure was never re-measured; on the theme the app now ships by default, ember
is a full step worse and clears only the 3:1 large-text bar. Treat 18.66px/700
or 24px as the floor for any ember string, on either ground.

**The Runtime-Token Rule.** Tailwind v4 drops any `@theme` token nothing
statically references, so a class name assembled at runtime
(`` `bg-accent-${step}` ``) compiles to nothing at all — no error, no warning,
an empty element on screen. Accent steps used dynamically are declared as
static classes (`.rep-fill-1`…`.rep-fill-5`). This has already caused two
shipped defects.

## Typography

**Display Font:** Sora (with `ui-sans-serif`, `system-ui`)
**Body Font:** Hanken Grotesk (with `ui-sans-serif`, `system-ui`)
**Label/Mono Font:** IBM Plex Mono (with `ui-monospace`, `SFMono-Regular`)

**Character:** Three faces with fixed, non-overlapping jobs. Sora is the
numerals voice — geometric, slightly condensed, and it carries everything a
lifter reads at arm's length. Hanken Grotesk speaks the prose. Plex Mono is
the _meta_ voice, not decoration: its wider figures and squarer terminals mark
kickers, timestamps and the PR badge as machine-set rather than spoken. All
three are self-hosted (99 KB total) because a render-blocking third-party
stylesheet costs a DNS lookup, a handshake and a round trip before first paint
on Egyptian mobile data — and fails silently offline.

### Hierarchy

- **Display** (Sora 600, 44px, 1.05): The finish ceremony's total, the one
  number that gets the whole screen.
- **Input** (Sora 500, 30px, 1.1, tabular): The weight and reps fields. The
  thing the thumb is aiming at.
- **Figure** (Sora 500, 24px, 1.15, tabular): Every other number a lifter
  reads — volume, estimated 1RM, streak counts.
- **Title** (Sora 600, 19px, 1.25): Exercise names, screen headings, card
  titles.
- **Body** (Hanken Grotesk 400, 15px, 1.45): Prose, coach sentences,
  explanatory copy.
- **Label** (Hanken Grotesk 400, 13px, 1.4): Button text, secondary controls.
- **Kicker** (Plex Mono 500, 11px, 0.14em, uppercase, muted): The stamped
  label under an object. Section headers, field labels, `ON BAR`.
- **Micro** (Hanken Grotesk 500, 11px): Set counts, inline units, the smallest
  legible tier.

### Named Rules

**The Figure Floor Rule.** No number a lifter reads goes below the `figure`
tier (24px). The scale binds size, weight and leading together in one token so
a size cannot be used at the wrong weight by accident.

**The Arabic Opt-Out Rule.** Plex Mono has no Arabic, and the platform
monospace fallback draws Arabic as disconnected letters with gaps between
them. Every mono class therefore has an RTL counterpart that drops to the sans
stack and resets tracking and casing — `kicker`, `meta-mono` and `chip-data`
all carry it. Any new mono class that can hold a translated word needs the
same escape hatch or it ships broken in Arabic.

**The Unlayered Voice Rule.** The Sora assignment rides on the size utilities
themselves via an unlayered rule after the utilities layer, so no component
names the family. Author CSS outside a layer outranks utilities — which is
also why the native-control reset lists longhands and never `font: inherit`
(the shorthand resets weight, and once pinned every button in the app to 400).

**The Ramp-Is-The-Target Rule.** The scale above is where new work goes, not a
description of where the app currently is. Measured on 2026-08-14, `src/` holds
**189 literal `text-[Npx]` uses against 31 uses of the named steps** — and the
split matters, because the two halves are different problems:

- **135 of the 189 are on-ramp values written the long way** — `text-[11px]`
  (58), `text-[13px]` (53), `text-[15px]` (22), `text-[19px]` (2). These render
  identically to `text-micro`, `text-label`, `text-body` and `text-title`. They
  are a naming inconsistency, safe to convert on sight, and converting them
  changes no pixels.
- **54 uses across 16 values are genuinely off-ramp**: 17px (15), 18px (7),
  12px (4), 26px (4), 16px (3), 22px (3), 14.5px (3), 10px (2), 14px (2), 29px
  (2), 34px (2), 11.5px (2), 12.5px (2), 20px (1), 27px (1), 54px (1). Most
  came from the exact-match mandate — `public/prototype.html` is the pixel
  spec, and matching it beat matching the ramp.

Do not "fix" the second group by rounding it onto the ramp. Those pixels were
chosen against a spec; changing them is a redesign, not a cleanup. Do use the
named step for anything new, and do prefer the token when touching one of the
135 for another reason.

## Layout

A single-column mobile app, capped at a **430px container** and centred, with
an **18px gutter** that every screen and every card edge honours. Vertical
rhythm runs on 12px between stacked blocks and 6px inside a control.

There is **no tab bar**. Five equal tabs for five unequal jobs was retired in
the v3 redesign. The home screen carries one Start action with a History
circle beside it; Progress and Coach are reached through the cards that hold
their content; Settings is behind the header avatar; Friends lives inside
Settings. A new screen needs a door on the home screen or it is unreachable —
`npm run shots` prints `no door to <screen>` when one is missing.

The header is a sticky band with the app's only gradient. Pinned clusters
(the log CTA, the rest bar) sit flush to the bottom edge; the sticky
arithmetic only holds when `marginBottom = bottom − trailingSpace`, or the
cluster drifts as the list grows.

**Touch targets are 48px minimum, everywhere, without exception.** That is the
one number in this file that has never moved.

## Elevation & Depth

**This system has no drop shadows in the classical sense, and the exception is
narrow and deliberate.** Depth is expressed by an edge and a fill: a card is
separated from the ground because it is a different material, not because it
appears to hover above one. The system this refines shipped an 18px and a 40px
blur; both were dropped.

What remains is a **hairline ring plus a 1px inset light along the top edge**.
It reads as a milled surface catching the room light rather than as an object
floating over the page.

The single concession is the surface language the prototype draws with: `card`
carries a 1px offset shadow so it lifts a millimetre off the page, and the
hero CTA carries an ember glow. Both are named tokens; neither is available
for general use.

### Shadow Vocabulary

- **`--ring-hairline`** (`0 0 0 1px var(--color-line), inset 0 1px 0 rgba(255,255,255,0.6)`):
  The default. Every surface that is not a card or a panel.
- **`--shadow-panel`** (`0 0 0 1px var(--surface-line)`): The object you
  _operate_ — edge only, flush to the page.
- **`--shadow-card`** (`0 1px 2px var(--surface-line), 0 0 0 1px var(--surface-line)`):
  The object you _read from_ — lifted one millimetre.
- **`--shadow-cta`** (`0 10px 26px rgba(232,73,29,0.35)`): The ember glow under
  the hero action. One per screen, or it is not a hero.

### Named Rules

**The Named-Token Rule.** `--surface-line` is a real token in both themes
because it was once written as `var(--line)`, which this stylesheet never
defined — and an undefined custom property invalidates the entire `box-shadow`
declaration. Every panel in that release drew no edge at all, silently. A
shadow composed from an undefined variable does not degrade; it vanishes.

**The One Ring Rule.** Rings are never stacked. A surface carries exactly one
of the four shadows above.

## Shapes

Corners are generous and graded by the object's job, not by its size. Controls
are pills or 8px rectangles; **panels** (the things you operate — the weight
field, the plate card) are 18px; **cards** (the things you read from) are
20px; thumbnails are 12px; chips and tags take the two smallest steps, 5px and
6px. A component picks the step that matches what it _is_.

The scale reaches components by two different routes, and the difference is a
trap rather than a detail:

| Step             | Value | How you reach it                                    |
| ---------------- | ----- | --------------------------------------------------- |
| `--radius-sm`    | 4px   | `rounded-sm`, or `var()`                            |
| chip             | 5px   | `chip-data`, `tag-pr` (literal, inside the utility) |
| tag              | 6px   | `tag-neutral`, `tag-accent` (literal)               |
| `--radius-md`    | 8px   | `rounded-md`, or `var()`                            |
| `--radius-thumb` | 12px  | `var()` only — **no utility exists**                |
| `--radius-lg`    | 14px  | `rounded-lg`, or `var()`                            |
| `--radius-panel` | 18px  | `surface-panel`, or `var()` — **no utility**        |
| `--radius-xl`    | 20px  | `surface-card`, `rounded-xl`, or `var()`            |
| `--radius-pill`  | 999px | `var()` only — **no utility**                       |

**The Shadowed Scale Rule.** The radius tokens are declared in `:root`, _not_
in `@theme`. Tailwind v4 still emits `.rounded-lg { border-radius:
var(--radius-lg) }`, and the project's `:root` block is parsed after
Tailwind's — so the project value wins and `rounded-lg` really is 14px, not
Tailwind's 8px. That is four overrides deep: `sm` 4, `md` 8, `lg` 14, `xl` 20.

**`2xl` is not overridden.** `rounded-2xl` therefore resolves to Tailwind's own
`1rem` — **16px, smaller than `rounded-xl`'s 20px.** The scale is
non-monotonic, and it will silently give you a _tighter_ corner than the step
below it. `ErrorBoundary` was the app's only `rounded-2xl` and was, for exactly
this reason, the only card in the app not shaped like a card. Never reach past
`xl`; if you need a larger corner, add the override rather than climbing the
Tailwind scale.

Rules between list rows **fade out at both ends** (`rule-fade`), so a long
list reads as one continuous column rather than a stack of boxes. Separators
_inside_ a control stay solid (`rule-solid`). Cards are not given borders when
an edge will do.

**The Knurl.** The one texture in the system: cross-hatched ember at ±45°, a
1px line on a 5px period — the grip cut into a bar. It appears only on thin
bands and on the PR badge, because knurling exists where a hand grips; spread
across a surface it stops referring to anything and becomes wallpaper. Its
opacity is a variable so a 4px rule and a 22px badge each sit at the right
weight.

**One texture per surface.** A surface that already carries a shadow does not
also get the knurl.

## Components

### Buttons

- **Shape:** Softly squared (8px, `--radius-md`), 1px border, inline-flex with
  a 6px gap for an optional icon. Height is set by the caller; the 48px floor
  always applies.
- **Hero** (`btn-hero`): Solid ember with `ember-ink` text at 600, plus a warm
  inset light along the top edge. **One per screen**, on the single action that
  screen exists for — "Log set 3", "Start workout". Typically 60px tall.
- **Primary** (`btn-primary`): Outlined 1.5px in ember on a 10% ember tint,
  ember text. The default emphasis tier.
- **Secondary** (`btn-secondary`): Divider-coloured border, normal text.
- **Ghost** (`btn-ghost`): No border, ember text.
- **Quiet** (`btn-quiet`): No border, text at 55% opacity. Header chrome and
  tertiary escapes.
- **Press:** The only press effect in the app — dim to 0.85 and settle 1px
  down over 80ms. The give of a loaded bar, not a bounce.
- **Focus:** A 2px ember outline at 2px offset. The browser default is never
  left in place.

### Chips

- **`chip-data`:** Mono 11 in ember-deep on a 7% ember tint, tabular. It
  carries the exact figures a coach's note was drawn from — which makes the
  claim checkable without trusting anything.
- **`tag-neutral` / `tag-accent`:** 6px radius, 11px, for set types and
  superset markers.
- **`tag-pr`:** The record stamp. Ember-800 fill with the knurl laid over it at
  low opacity, mono 600 at 0.08em. The only place the texture appears outside
  a rule, because a record is the one thing worth marking as machined.

### Cards / Containers

- **`surface-card`** — the object you read from: 20px radius, surface fill,
  `--shadow-card`.
- **`surface-panel`** — the object you operate: 18px radius, surface fill,
  `--shadow-panel` (edge only), flush to the page.
- **Neither utility sets padding**, and callers do not agree on one: `PlateCard`
  uses `px-4 py-3`, `SetEntry`'s figure panels `px-3.5 py-3`, its exercise card
  `px-[18px] py-3.5`. Match the neighbours of whatever you are building rather
  than expecting the utility to space it.
- Both are utilities rather than inline recipes because the same composition
  was hand-written in four places and the fifth would have drifted.

### Inputs / Fields

- **Text fields:** 48px tall, 14px radius, 1px `line` border on the ground
  fill, 15px text. Focus shifts the border to ember; the placeholder is muted.
- **Figure fields** (weight, reps): the signature input. A `surface-panel` holds
  a mono kicker label, then the value on its own full-width 44px line in Sora
  Bold at 29px, tabular, centred, on a transparent background with no border —
  the number _is_ the field. Steppers sit on a separate row below it. They were
  originally inline beside the value, which clipped `102.5` (83.1px of glyph in
  62px of box).
- **Native controls** inherit the app's family, size, leading, tracking and
  colour — but never `font: inherit`, which also resets weight.

### Navigation

- **Header:** A sticky band carrying the app's one gradient, which separates
  chrome from content without a border cutting a hard line directly above the
  hot path. 430px inner container, 18px gutter, 12px-tall wordmark at centre-
  start, back chevron at inline-start when a screen has a parent, avatar and
  overflow at inline-end. All chrome buttons are 48×48 `btn-quiet`.
- **Layers** (picker, set entry, exercise detail) slide in 12px from the inline
  _end_ over 160ms, so they read as arriving from where the tap sent you. The
  translate is logical, so the Arabic flip reverses it for free.

### Signature Component — the set row

The row a lifter's whole session is made of: a plate-ring glyph, the set
number, the weight × reps in tabular mono, an optional PR stamp, and the
estimated 1RM in muted micro. It arrives with `set-commit` — 90ms, rising 3px,
never sliding — because the question it answers is the most important one in
the app: _did that save?_ Ninety milliseconds is under the threshold where a
person waits for it, so the row is simply _there_, having arrived rather than
appeared.

A record row fills to 28% ember and settles to the 7% tint it keeps, over
1140ms. Ember, never confetti: a record is a fact about the row, so the
marking stays on the row.

### Motion

Four durations and two easings — the entire vocabulary. A raw millisecond
value in a component is the smell that something is being invented.

- **`--motion-press`** (80ms, ease-out): "did my finger land?"
- **`--motion-instant`** (90ms, ease-out): "did my set save?"
- **`--motion-transition`** (160ms, ease-out): "where did I come from?"
- **`--motion-celebration`** (1140ms, ease-out): "did I beat it?"

`linear` is used exactly once, for the rest timer's drain, because that bar is
a readout of elapsed time rather than a response to a tap — its duration is
the tick interval, not a feel value.

**The Reduced-Motion Rule.** `prefers-reduced-motion` collapses the four
tokens themselves _and_ applies a global blanket, so an inline style that
reads a token is stilled too. Every animation is `both`-filled, so collapsing
the duration keeps the end state: a record row stays tinted, a committed set
stays put.

## Do's and Don'ts

### Do:

- **Do** use logical properties exclusively — `ms-`, `ps-`, `start-`,
  `text-start`. ESLint fails the build on `ml-`, `pl-`, `left-`, `text-left`.
  The Arabic locale is a planned flip, not a rewrite.
- **Do** give every accent step used dynamically a static class. A class name
  assembled at runtime compiles to no CSS and fails no check.
- **Do** reach for `accent-300` for any accent text under the `figure` tier,
  and `accent-500` only for chrome and large text.
- **Do** pair every mono utility with an `[dir='rtl']` sans fallback if it can
  ever hold a translated word.
- **Do** keep exactly one `btn-hero` per screen. Its authority comes entirely
  from being the only filled thing on the ground.
- **Do** render numbers with `.tnum`, in Sora, at the `figure` tier or above.
- **Do** state elevation with one of the four named shadow tokens.

### Don't:

- **Don't** introduce a second hue. Not for a chart series, not for a success
  state, not for a muscle group. The ember ramp and the neutral ramp carry
  every distinction this app needs to draw.
- **Don't** compose a `box-shadow` from an undefined custom property. It does
  not degrade to a weaker shadow — the whole declaration is invalid and the
  edge vanishes silently.
- **Don't** spread the knurl across a surface, or add it to something that
  already carries a shadow. One texture per surface, thin bands and the PR
  badge only.
- **Don't** put a gradient anywhere except the header band, or a drop shadow
  anywhere except the four named tokens.
- **Don't** use emoji, decorative illustration, or a celebration screen. A PR
  gets an ember flash on its own row.
- **Don't** let anything on the logging path exceed 200ms, and don't put a
  spinner, modal or paywall on it at all.
- **Don't** take an interactive touch target below 48px. (Display rows may be
  shorter — a logged set row is `min-h-7`. The floor governs things a thumb
  aims at.)
- **Don't** reach for `rounded-2xl` or anything above it. Only `sm`/`md`/`lg`/
  `xl` are overridden, so `2xl` silently falls back to Tailwind's 16px and
  renders _tighter_ than `xl`.
- **Don't** assume a component renders standalone. Most call `useLocale`, so
  they need `LocaleProvider` around them — without it they throw or render
  empty, which is how a component looks fine in the app and blank in a preview.
- **Don't** write `font: inherit` on a native control; it silently resets
  weight and outranks the utility that asked for one.
- **Don't** add a screen without a door to it on the home screen.
