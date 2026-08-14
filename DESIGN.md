---
name: Wazn
description: A strength log with the weight of iron — chalk on paper, ember on ink.
colors:
  ember: '#e8491d'
  ember-deep: '#9a3012'
  ember-ink: '#1c0e08'
  ember-stamp: '#401407'
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
  mono-meta:
    fontFamily: 'IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace'
    fontSize: '11px'
    lineHeight: 1.2
    fontFeature: 'tnum 1'
  stamp:
    fontFamily: 'IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace'
    fontSize: '11px'
    fontWeight: 600
    letterSpacing: '0.08em'
  field-figure:
    fontFamily: 'Sora, ui-sans-serif, system-ui, sans-serif'
    fontSize: '29px'
    fontWeight: 700
    letterSpacing: '-0.02em'
    fontFeature: 'tnum 1'
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
  button-primary:
    textColor: '{colors.ember}'
    rounded: '{rounded.md}'
  button-secondary:
    textColor: '{colors.graphite}'
    rounded: '{rounded.md}'
  button-quiet:
    textColor: 'color-mix(in srgb, #16130e 55%, transparent)'
    rounded: '{rounded.md}'
  surface-card:
    backgroundColor: '{colors.chalk-surface}'
    rounded: '{rounded.xl}'
  surface-panel:
    backgroundColor: '{colors.chalk-surface}'
    rounded: '{rounded.panel}'
  input-figure:
    textColor: '{colors.graphite}'
    typography: '{typography.field-figure}'
    height: '44px'
    width: '100%'
  chip-data:
    textColor: '{colors.ember-deep}'
    rounded: '{rounded.chip}'
    padding: '3px 7px'
    typography: '{typography.mono-meta}'
  tag-pr:
    textColor: '{colors.ember-stamp}'
    rounded: '{rounded.chip}'
    padding: '0 6px'
    typography: '{typography.stamp}'
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
whatever lighting the gym has. So the figures are enormous and tabular, touch
targets are held to 48px, and the chrome gets out of the way: no
tab bar, no spinner on the hot path, no celebration screen. Motion is a plate
landing, not a page turning — four durations in the whole app, two easings,
and nothing on the logging path over 200ms.

**Key Characteristics:**

- Two grounds from one token set — paper by default, iron on request, never a
  third
- One accent, ember `#e8491d`, and it is the only colour in the app
- Numbers are the interface: Sora, tabular, 24px or above for anything read at
  a glance (two logged exceptions, see Typography)
- Depth is an edge and a fill, not a drop shadow
- One texture — the knurl — confined to thin bands and the PR badge
- Logical properties only, because the Arabic flip is a planned flip, not a
  rewrite

## Colors

A two-material palette: warm off-white chalk and warm near-black iron, lit by
exactly one hue.

### Primary

- **Ember** (`#e8491d`): The material of the iron, never decoration. It marks
  the one action a screen exists for, the record, the live rest ring, and the
  data a coach's note was drawn from. Nothing else in the app carries hue.
- **Ember Deep** (`#9a3012`): Not a shade choice — a contrast requirement. Every
  small accent string (chips, labels, meta, error text) uses this tier, and it
  is the only accent value that clears 4.5:1 on every surface in both themes:
  6.77:1 on the chalk ground, 7.49:1 on chalk surface, and (as `#f4a68c`)
  9.28–10.00:1 on iron.
- **Ember Ink** (`#1c0e08`): The near-black that sits _on_ a filled ember
  surface — the hero button's label. 4.84:1 against the ember fill.
- **Ember Stamp** (`#401407`): The PR badge's lettering. A different value from
  Ember Ink because it sits on the darker ember-800 fill rather than on
  ember-500, and it is `accent-100` — so it swaps with the theme while Ember
  Ink does not.

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
statically references. The shipped failure was a **custom-property name**
assembled at runtime — `var(--color-accent-${step})` composed inside a
component — not a Tailwind class: the token was never statically referenced, so
it was never emitted, and the `var()` resolved to nothing. `accent-400` and
`accent-700` were absent from the built CSS, and two rep-range bars holding 31
and 11 sets rendered as empty tracks. No error, no warning, no failing check.
Accent steps used dynamically are now static classes
(`.rep-fill-1`…`.rep-fill-5`).

A runtime-assembled _class_ name (`` `bg-accent-${step}` ``) fails too, for the
adjacent reason that Tailwind's scanner never sees the string. Both end the
same way — an element that draws nothing — which is why the rule is stated
against runtime assembly of either kind.

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

The **Used** column is not decoration. It is a count of how many times each
step is referenced in `src/components`, `src/screens` and `src/App.tsx` —
measured 2026-08-14 — and it is the most important fact in this section.

| Step        | Spec                                  | Used | Purpose                                                             |
| ----------- | ------------------------------------- | ---- | ------------------------------------------------------------------- |
| **Display** | Sora 600 / 44px / 1.05                | 0    | Intended for the finish total; that heading is hand-set at 34px.    |
| **Input**   | Sora 500 / 30px / 1.1 / tnum          | 0    | Intended for weight and reps; those are hand-set at 29px bold.      |
| **Figure**  | Sora 500 / 24px / 1.15 / tnum         | 4    | Volume, estimated 1RM, streak counts. The one step with traction.   |
| **Title**   | Sora 600 / 19px / 1.25                | 1    | Exercise names, screen headings, card titles.                       |
| **Body**    | Hanken Grotesk 400 / 15px / 1.45      | 0    | Prose and coach sentences — written as `text-[15px]` instead.       |
| **Label**   | Hanken Grotesk 400 / 13px / 1.4       | 0    | Button text is `btn-base`'s own 500 / 1.2, not this.                |
| **Kicker**  | Plex Mono 500 / 11px / 0.14em / upper | —    | A utility, not a size step. Section labels, field labels, `ON BAR`. |
| **Micro**   | Hanken Grotesk 500 / 11px             | 0    | Written as `text-[11px]` instead — 58 times.                        |

**Five references, total.** The ramp is not drifting; it is very nearly unused,
and the section below says what to do about that.

**Sora does not reach the screen through this ramp.** The unlayered rule binds
`--font-display` to `.text-display`/`.text-input`/`.text-figure`/`.text-title`,
but since only two of those are used at all, Sora arrives almost entirely via
the explicit `font-display` class — **31 uses**, against 25 for `font-mono`.
The family and the size are chosen separately in practice, which is exactly
what the combined tokens were designed to prevent.

### Named Rules

**The Figure Floor Rule.** No number a lifter reads at a glance goes below the
`figure` tier (24px), and the scale binds size, weight and leading into one
token so a size cannot be used at the wrong weight by accident. **Two standing
exceptions**, both deliberate: the multi-set previous-session string renders at
20px (logged in DECISIONS.md), and the mono meta figures on a set row — set
number, est. 1RM — are 11px in Plex Mono. Those are read _beside_ a number, not
_as_ the number.

**The Arabic Opt-Out Rule.** Plex Mono has no Arabic, and the platform
monospace fallback draws Arabic as disconnected letters with gaps between them.
So **any mono class that can hold a translated word** carries an RTL
counterpart dropping to the sans stack and resetting tracking and casing:
`kicker`, `meta-mono` and `chip-data` have one. `tag-pr` does **not**, and that
is correct rather than an oversight — its content is the fixed Latin literal
`PR`, which renders the same in both directions. The test is what the element
can contain, not whether it is mono.

**The Unlayered Voice Rule.** The Sora assignment rides on the size utilities
via an unlayered rule at the end of the stylesheet, so no component names the
family; author CSS outside a layer outranks every cascade layer.

That mechanism is real, but **do not extend it to the native-control reset,
whose own comment claims it applies there.** That reset now sits inside
`@layer base` (`src/index.css`), and under Tailwind v4's
`theme, base, components, utilities` order, `base` loses to `utilities`. The
comment describes the world before the block was wrapped and was never updated.
Keep the longhands anyway — `font: inherit` resetting weight is still true, and
the reason it once pinned every button in the app to 400 is worth not
re-testing — but the "outranks the utility" half no longer holds.

**The Ramp-Is-The-Target Rule.** The scale above is where new work goes, not a
description of where the app currently is. Measured on 2026-08-14, `src/` holds
**189 literal `text-[Npx]` uses against 5 uses of the named steps** — and the
split within those 189 matters, because the two halves are different problems:

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

The header is a sticky band carrying a gradient. It is the app's **primary**
gradient but not its only one — the sticky Start cluster on the Log screen
fades to the ground with `linear-gradient(180deg, transparent, var(--color-ink)
45%)`. Both exist for the same reason: to separate a pinned layer from
scrolling content without a border cutting a hard line across the screen.
Those two, and no others.

Pinned clusters (the log CTA, the rest chip) sit flush to the bottom edge; the
sticky arithmetic only holds when `marginBottom = bottom − trailingSpace`, or
the cluster drifts as the list grows.

**Touch targets are 48px minimum — as a rule with four known violations, not
as a description.** `btn-base` sets no height and the caller does, so the floor
is only ever as good as the call site. Measured 2026-08-14, these ship below
it: `CoachBrief` ×2 and `CoachScreen` at `h-9` (36px), `FriendsScreen` at
`h-10` (40px). Do not treat those as precedent — they are the backlog. New
controls take 48.

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

- **`--ring-hairline`** (`0 0 0 1px var(--color-line), var(--top-light)`): The
  default. Every surface that is not a card or a panel. The second half is a
  **token, not a literal, and it is theme-specific** — `inset 0 1px 0
rgba(255,255,255,0.6)` on paper against `rgba(236,235,232,0.045)` on iron.
  A bright inset light that reads as milled metal on paper reads as a seam of
  glare on near-black, which is why the dark value is an order of magnitude
  fainter. Never inline the paper literal.
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
declaration. The gap between writing and shipping is the point: the bad
reference was authored in one release and only reached screens in the next, and
every panel that shipped in it drew no edge at all. A shadow composed from an
undefined variable does not degrade to a weaker shadow; it vanishes, silently,
and no check catches it.

**The One Ring Rule.** Rings are never stacked. A surface carries exactly one
of the four shadows above.

## Shapes

Corners are generous and graded by the object's job, not by its size. Controls
are pills or 8px rectangles; **panels** (the things you operate — the weight
field, the plate card) are 18px; **cards** (the things you read from) are
20px; chips and tags take the two smallest steps, 5px and 6px. A component
picks the step that matches what it _is_. Thumbnails are nominally 12px
(`--radius-thumb`), but only one of six call sites asks for it — `ExerciseThumb`
picks its own radius by size, so the token describes an intent the component
does not consult.

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

Rules between list rows **fade out at both ends** (`rule-fade`), so a long list
reads as one continuous column rather than a stack of boxes. `rule-solid` is
its plain counterpart — the intent was "separators inside a control", but both
call sites (the Friends leaderboard, the Coach plan list) in fact use it
between `<li>` rows, where the list is short enough that a fading rule would
read as an error. Treat it as "short list" rather than "inside a control".

Cards are not given borders when an edge will do.

**The Knurl.** The one texture in the system: cross-hatched ember at ±45°, a
1px line on a 5px period — the grip cut into a bar. It appears only on thin
bands and on the PR badge, because knurling exists where a hand grips; spread
across a surface it stops referring to anything and becomes wallpaper. Its
opacity is a variable so a 4px rule and a 22px badge each sit at the right
weight.

**One texture per surface.** A surface that already carries a shadow does not
also get the knurl.

## Components

**Read this before any value below.** In this system a "component" is a CSS
utility that sets **appearance only** — background, colour, radius, border,
weight, leading. **Size is nearly always the caller's**: `btn-base` declares no
height and no padding at all, `surface-card` and `surface-panel` declare no
padding, `tag-pr` declares no height. Every measurement here is therefore
either a value the utility genuinely sets, or a labelled observation about what
callers actually do. The two are not interchangeable, and earlier drafts of
this file stated caller compositions as tokens — which is the easiest way to
write a design system that lies. Where callers disagree, the disagreement is
recorded rather than averaged.

### Buttons

- **Shape:** Softly squared (8px, `--radius-md`), inline-flex with a 6px gap
  for an optional icon. **Height and padding are the caller's** and they do not
  agree — `px-2.5`, `px-3`, `px-4` all ship. The 48px floor is a rule, not a
  property of the utility (see Layout).
- **The border is always in the box.** `btn-base` sets `border: 1px solid
transparent`; the variants only change `border-color`. So ghost, quiet and
  hero each still occupy that 1px, which is why swapping a variant never shifts
  a row by a pixel. Don't "remove" the border to save space — there is none to
  save.
- **Hero** (`btn-hero`): Solid ember with `ember-ink` text at 600, plus a warm
  inset light along the top edge. **One per screen**, on the single action that
  screen exists for. Note the utility's 8px radius is routinely overridden at
  the call site — the hot-path commit button in `SetEntry` is a `--radius-pill`
  at 60px, and hero labels ship at 16/17/18px rather than any ramp step.
- **Primary** (`btn-primary`): Outlined 1.5px in ember on a 10% ember tint,
  ember text. The default emphasis tier.
- **Secondary** (`btn-secondary`): Divider-coloured border, normal text.
- **Ghost** (`btn-ghost`): Transparent border, ember text.
- **Quiet** (`btn-quiet`): Transparent border, text at 55%. Header chrome and
  tertiary escapes.
- **Press:** The only press effect in the app — dim to 0.85 and settle 1px
  down over 80ms. The give of a loaded bar, not a bounce.
- **Focus:** A 2px ember outline at 2px offset. The browser default is never
  left in place.

### Chips

- **`chip-data`:** Mono 11 in ember-deep on a 7% ember tint, tabular, 5px
  radius. **Not the kicker voice** — no tracking, no uppercase, no weight
  override; it is a line of figures, not a stamped label. It carries the exact
  numbers a coach's note was drawn from, which makes the claim checkable
  without trusting anything.
- **`tag-neutral` / `tag-accent`:** 6px radius, 11px, for set types and
  superset markers.
- **`tag-pr`:** The record stamp. Ember-800 fill with the knurl laid over it at
  low opacity; mono **600 at 0.08em, not uppercased** (it does not need to be —
  its content is the literal `PR`). 5px radius. Height is set by the caller and
  varies deliberately: 22px on a set row, 20px in History, 18px inline in the
  finish summary. The only place the texture appears outside a rule, because a
  record is the one thing worth marking as machined.

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

- **Text fields:** There is **no text-field utility** — every one is composed at
  the call site, and they do not all match. The shape to copy is `Welcome`'s:
  48px tall, `rounded-lg` (14px), 1px `line` border on the ground fill, 15px
  text, ember border on focus, muted placeholder. Treat that as the reference
  composition, not as a token that already exists.
- **Figure fields** (weight, reps): the signature input. A `surface-panel` holds
  a mono kicker label, then the value on its own full-width 44px line in **Sora
  700 at 29px, `-0.02em`**, tabular, centred, on a transparent background with
  no border — the number _is_ the field. That is hand-set, not the `input` ramp
  step: `--text-input` (500 / 30px) is consumed nowhere in `src/`. Steppers sit
  on a separate row below the value; they were originally inline beside it,
  which clipped `102.5` — 83.1px of glyph in a 62px box.
- **Native controls** inherit the app's family, size, leading, tracking and
  colour — but never `font: inherit`, which also resets weight.

### Navigation

- **Header:** A sticky band carrying a gradient, which separates chrome from
  content without a border cutting a hard line directly above the hot path.
  430px inner container, 18px gutter; back chevron at inline-start when a
  screen has a parent, avatar and overflow at inline-end.
- **The wordmark is `height={15.5}`, and that prop does not mean what it looks
  like.** It sets the **Latin** lockup's ink height. The Arabic mark is drawn at
  `height × SOUL_SCALE` with `SOUL_SCALE = 2.2`, so the same call renders a
  **34.1px** وزن barbell. Changing this number changes the two locales by
  different amounts; check both before touching it.
- **Chrome buttons are 48×48, but only two of three are `btn-quiet`.** Back and
  overflow are `btn-base btn-quiet h-12 w-12`; the avatar is a bare
  `flex h-12 w-12` — same target, no button styling, because its appearance is
  entirely the `Avatar` inside it.
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

`linear` is spent on one thing — the rest timer — across two call sites
(`RestTimer` and `RestExpanded`, the chip and the expanded view of the same
timer). It earns the exception because the timer is a readout of elapsed time
rather than a response to a tap, so its duration is the tick interval, not a
feel value.

**The timer is an SVG ring, and it _fills_ as rest elapses.** It does not
drain, and it is not a bar. That was reversed in DECISIONS.md on 2026-08-13,
and the `timer-drain` utility still in `src/index.css` is dead code left from
the earlier design — zero call sites. Don't build against it.

**The 200ms ceiling has one carve-out, by construction.** Nothing on the
logging path exceeds 200ms; the 1140ms celebration tier is reachable only
_after_ a set is committed, never between one set and the next. That is what
makes it affordable.

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
- **Don't** add a third gradient. Two exist — the header band and the Log
  screen's sticky Start cluster — and both separate a pinned layer from
  scrolling content. Don't put a drop shadow anywhere except the four named
  tokens.
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
- **Don't** write `font: inherit` on a native control; the shorthand silently
  resets weight, and it once pinned every button in the app to 400. (The
  stylesheet's comment adds that it "outranks the utility" — that half is
  stale: the block now sits in `@layer base`, which loses to utilities.)
- **Don't** add a screen without a door to it on the home screen.
