/**
 * The design tokens, in one place, as plain TypeScript.
 *
 * ── TWO SYSTEMS LIVE HERE, AND ONLY ONE OF THEM IS BEING BUILT ──────────────
 * `palette` / `type` / `fontFamily` are the CURRENT system, taken from the
 * prototype Ameen supplied on 2026-08-20 (`Wazn Prototype.html`, four screens:
 * Home, Workout, Rest, Finish). Paper ground, Sora display, pill controls,
 * real shadows, and the plate glyph used as the letter `a`. Ameen's call the
 * same day: **it replaces v5 "Momentum"**. The native app reads these.
 *
 * `legacyPalette` / `legacyType` are v5 Momentum. Nothing new may read them.
 * They survive for exactly one reason: `src/index.css` is still the dying Vite
 * PWA's stylesheet, `scripts/check_tokens.ts` still checks the two agree, and
 * repainting an app that Stage 4A deletes is the definition of rented work.
 * When `src/index.css` goes at phase A4, so do they.
 *
 * A colour that appears in both is not shared — it is a coincidence of two
 * systems liking the same ember.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * The app now renders through two stacks that cannot share a stylesheet. The
 * web PWA is Tailwind v4, whose tokens live in `index.css`'s `@theme` block;
 * the Expo app is NativeWind v4, which needs a JavaScript `tailwind.config.js`
 * and a Tailwind 3.4 that will not co-exist with v4 in one `package.json`.
 *
 * Two stacks with two hand-maintained copies of the same palette is a
 * guaranteed drift. So the palette lives HERE, in a module both can read:
 * `mobile/tailwind.config.js` builds its theme from it directly, and
 * `scripts/check_tokens.mjs` parses `src/index.css` and fails the build when
 * the CSS and this file disagree. Neither side is allowed to be the odd one
 * out — the checker does not care which is "right", only that they match.
 *
 * ── WHERE THE NUMBERS COME FROM ─────────────────────────────────────────────
 * Read out of the prototype's own markup, not eyeballed from a screenshot: the
 * bundle was unpacked and every `font:`, `background:`, `border-radius:` and
 * `box-shadow:` counted. `docs/design/prototype/` holds the extracted source.
 * Where this file and that source differ, the source is normative and this
 * file is the bug.
 *
 * Nothing in here imports anything. No React, no browser, no Vite. That is
 * deliberate: it is the one module both a Metro bundle and a Vite bundle have
 * to be able to read without adapters.
 */

/* ── Colour ────────────────────────────────────────────────────────────────
   The iron ground: one warm near-black, one accent, and brass as a
   deliberately scoped second hue for earned states.

   This is the DARK palette only. The web app also ships a paper theme
   (`html[data-theme='paper']` in `index.css`), whose accent ramp is mirrored
   by role rather than by lightness — `accentSoft` means "small accent text
   readable on THIS ground", which is `#f4a68c` on iron and `#9a3012` on
   paper. The native app ships iron alone for now; when it grows a second
   theme this becomes a record per ground, not a second flat object.

   THE RULE THAT KEEPS GETTING RE-DERIVED: `accent` (#e8491d) is 4.99:1 on
   this ground — chrome and large text only. Small accent text uses
   `accentSoft` (#f4a68c), which is 9.87:1. `tokens.test.ts` asserts both, so
   the figure stops living in a comment that goes stale. */
export const legacyPalette = {
  /** App ground. Warm near-black: a cool ground fights a warm accent. */
  ink: '#0f0d0a',
  /** Cards. */
  surface: '#181510',
  /** Raised, pressed, and the unfilled half of every track. */
  raised: '#211d15',
  /** The hairline ring — `0 0 0 1px`, never a border. */
  line: 'rgba(236, 231, 220, 0.08)',
  /** The border that is DRAWN: inputs, outline buttons. A different job. */
  line2: 'rgba(236, 231, 220, 0.16)',
  text: '#ece7dc',
  muted: '#9a927f',
  /** Meta and disabled. Below `muted`, above the ground. */
  faint: '#615b4d',
  /** THE accent: the one action, live states, PR, momentum fill. */
  accent: '#e8491d',
  /** Text on ember fills. */
  accentInk: '#1c0e08',
  /** Small accent text on dark — the contrast-safe tier. */
  accentSoft: '#f4a68c',
  /** Data-chip tint. */
  chipBg: 'rgba(232, 73, 29, 0.15)',
  /** Earned metal ONLY: rank, duel opponent, record pace, target beaten. */
  brass: '#b08d3e',
  brassSoft: '#d9bc7a',
  brassBg: 'rgba(176, 141, 62, 0.18)',
  /**
   * The tab bar's ground, and the only surface in the app darker than `ink`.
   * The chrome recedes BELOW the content rather than lifting off it, which is
   * the opposite of what a raised surface does — so it cannot be `surface`.
   */
  tabbar: '#0b0906',
} as const

export type LegacyPaletteKey = keyof typeof legacyPalette

/* ── Type ──────────────────────────────────────────────────────────────────
   Three faces and ten steps. Weight and leading travel WITH each step so a
   size cannot be used at the wrong weight by accident.

   The ramp is a floor, not a ceiling: the reference renders 26 distinct sizes
   and declares 10. What is enforced is that no size is anonymous — every one
   is a named step or one of the three idioms the reference itself repeats.
   `scripts/check_type_ramp.mjs` fails the build on anything else. */
export const legacyFontFamily = {
  display: 'Saira Semi Condensed',
  body: 'Hanken Grotesk',
  mono: 'IBM Plex Mono',
} as const

export type FontRole = keyof typeof legacyFontFamily

export type TypeStep = {
  family: FontRole
  size: number
  weight: 400 | 500 | 600 | 700 | 800
  /** Unitless multiplier, as CSS `line-height` and RN's ratio both want. */
  lineHeight: number
  /** In `em`, so both stacks can scale it by `size`. */
  letterSpacing?: number
  uppercase?: boolean
  /** `font-variant-numeric: tabular-nums`. Every figure a lifter reads. */
  tabular?: boolean
}

export const legacyType = {
  /** The live weight zone. Reps sit at 56 — an override, not a step. */
  mega: {
    family: 'display',
    size: 84,
    weight: 700,
    lineHeight: 1,
    letterSpacing: -0.01,
    tabular: true,
  },
  /** The BEAT figure, the finish total (66 there). */
  hero: {
    family: 'display',
    size: 50,
    weight: 700,
    lineHeight: 0.98,
    letterSpacing: -0.01,
    uppercase: true,
    tabular: true,
  },
  /** Weigh-in figure, rest's "next set" (38–42 there). */
  fig: { family: 'display', size: 30, weight: 700, lineHeight: 1.05, tabular: true },
  /** Stat tiles, e1RM list, session volume. */
  num: { family: 'display', size: 21, weight: 600, lineHeight: 1.1, tabular: true },
  /** Card titles and buttons. Exercise headers run 24–26. */
  title: {
    family: 'display',
    size: 17,
    weight: 600,
    lineHeight: 1.2,
    letterSpacing: 0.01,
    uppercase: true,
  },
  /** Coach sentences and prose. */
  body: { family: 'body', size: 14, weight: 400, lineHeight: 1.5 },
  /** Rows, inputs, chips-as-buttons. */
  label: { family: 'body', size: 13, weight: 400, lineHeight: 1.4 },
  /** Section and zone labels. Distinct from `nano` by size AND tracking —
      10 at 0.14em against 9 at 0.1em — so the two are not interchangeable. */
  kick: {
    family: 'mono',
    size: 10,
    weight: 500,
    lineHeight: 1.2,
    letterSpacing: 0.14,
    uppercase: true,
  },
  /** Data chips, timestamps, previous-set strings. */
  meta: { family: 'mono', size: 11, weight: 500, lineHeight: 1.2, tabular: true },
  /** Tab labels, disclaimers, footnotes. Never a figure a lifter reads. */
  nano: {
    family: 'mono',
    size: 9,
    weight: 500,
    lineHeight: 1.1,
    letterSpacing: 0.1,
    uppercase: true,
  },
} as const satisfies Record<string, TypeStep>

export type LegacyTypeStepName = keyof typeof legacyType

/* ── THE CURRENT SYSTEM ────────────────────────────────────────────────────
   Paper, not iron. The ground is warm off-white, cards are pure white lifted
   by a hairline ring and a 1px shadow, and the ONE dark surface is the rest
   canvas — which inverts to `ink` for the length of a rest and back again.
   That inversion is the whole reason `ink` is both "the colour text is set
   in" and "the colour a screen can be made of"; it is one value doing two
   jobs on purpose, so the `on*` roles below exist to say which job.

   CONTRAST, MEASURED, NOT ASSUMED (`tokens.test.ts` pins all of these):

     ink       on paper   16.70:1   ✓
     body      on paper    7.95:1   ✓
     muted     on paper    3.39:1   ✗ below AA for small text
     accent    on paper    3.51:1   ✗ below AA for small text
     accentSoft on paper   6.77:1   ✓

   The two failures are the prototype's own values and are kept, because the
   prototype is the spec and changing a designer's greys behind their back is
   not a fix. They are recorded in WAZN_PLAN 7.0 with the candidate
   replacements, for Ameen to rule on. `accentSoft` exists so that any small
   ember text this app adds ITSELF has a compliant option — the prototype sets
   the "12 wk" chip and the NEW PR kicker in raw `accent`. */
export const palette = {
  /** Behind the device on a wide web viewport. Native never shows it. */
  page: '#e9e4d8',
  /** The app ground. */
  paper: '#f7f3ec',
  /** Cards, and the only pure white in the system. */
  card: '#ffffff',
  /**
   * Text on paper — and the GROUND of the rest canvas and the Up Next card.
   * One value, two jobs; see the note above.
   */
  ink: '#16130e',
  /** Prose. A step off `ink` so a paragraph does not shout like a heading. */
  body: '#4f4a41',
  /** Labels, meta, anything secondary. 3.39:1 — see the note above. */
  muted: '#8a8378',
  /** THE accent: the one action per screen, the live ring, PR, the plate. */
  accent: '#e8491d',
  /** Pressed and hover. */
  accentPress: '#b83915',
  /** Small ember text that has to pass AA. The prototype does not use it. */
  accentSoft: '#9a3012',
  /** The wash behind an ember chip or the PR card. */
  accentWash: 'rgba(232, 73, 29, 0.09)',
  /** Text and glyphs ON ember, and on `ink`. Same value as `paper`. */
  onInk: '#f7f3ec',
  /** Prose on `ink`. */
  onInkBody: '#d6d1c6',
  /** Labels on `ink`. */
  onInkMuted: '#9d968a',
  /** Chrome on `ink` — the status row, the "logged ✓" line. */
  onInkFaint: '#7a7469',
  /** A raised surface ON the ink ground: the rest coach card, the ±30s pills. */
  onInkSurface: 'rgba(247, 243, 236, 0.06)',
  /** The same, one step up: the ±30s buttons. */
  onInkRaised: 'rgba(247, 243, 236, 0.1)',
  /** The rest ring's unfilled track. */
  onInkTrack: 'rgba(247, 243, 236, 0.12)',
  /** The hairline ring around every card on paper. */
  ring: 'rgba(22, 19, 14, 0.06)',
  /** The ring when it is doing a BUTTON's job, not a card's. */
  ringStrong: 'rgba(22, 19, 14, 0.1)',
} as const

export type PaletteKey = keyof typeof palette

/* ── Type ──────────────────────────────────────────────────────────────────
   Sora for display and every figure, Hanken Grotesk for prose, IBM Plex Mono
   for the machine voice. The prototype renders 25 distinct sizes; these are
   the 18 named steps they collapse to, and the collapses are all under 1px
   except two noted at their step. */
export const fontFamily = {
  /** Display and every figure. Geometric, tight-tracked, heavy at the top. */
  display: 'Sora',
  body: 'Hanken Grotesk',
  /** The meta voice: figures in rows, timestamps, machine labels. */
  mono: 'IBM Plex Mono',
} as const

export const type = {
  /** The rest countdown, and nothing else. */
  mega: {
    family: 'display',
    size: 54,
    weight: 800,
    lineHeight: 1,
    letterSpacing: -0.03,
    tabular: true,
  },
  /** The one sentence a screen opens with: "Push day," / "In the books." */
  hero: {
    family: 'display',
    size: 34,
    weight: 800,
    lineHeight: 1.12,
    letterSpacing: -0.03,
  },
  /** The wordmark's two Latin halves. Not a heading — see `Wordmark`. */
  mark: {
    family: 'display',
    size: 26,
    weight: 800,
    lineHeight: 1,
    letterSpacing: -0.05,
  },
  /** The stepper figures, weight and reps. */
  fig: {
    family: 'display',
    size: 29,
    weight: 700,
    lineHeight: 1.05,
    letterSpacing: -0.02,
    tabular: true,
  },
  /** Stat tiles, and the routine name on the Up Next card. */
  num: {
    family: 'display',
    size: 22,
    weight: 700,
    lineHeight: 1.15,
    letterSpacing: -0.02,
    tabular: true,
  },
  /** The `+` and `−` of a stepper. A glyph, which is why it is 600 not 700. */
  glyph: { family: 'display', size: 22, weight: 600, lineHeight: 1 },
  /** An exercise name, a PR line. */
  title: {
    family: 'display',
    size: 17,
    weight: 700,
    lineHeight: 1.2,
    letterSpacing: -0.02,
  },
  /** Button labels, and the screen title in a workout header. SENTENCE case:
      the prototype's CTAs read "Start workout", never "START WORKOUT". */
  cta: {
    family: 'display',
    size: 16,
    weight: 700,
    lineHeight: 1.2,
    letterSpacing: -0.02,
  },
  /** The secondary pair of buttons, and the plate maths line. */
  strong: {
    family: 'display',
    size: 15,
    weight: 700,
    lineHeight: 1.2,
    letterSpacing: -0.01,
  },
  /** A chip that is a button — "Finish", "12 wk". */
  pill: {
    family: 'display',
    size: 13,
    weight: 700,
    lineHeight: 1.2,
    letterSpacing: -0.01,
  },
  /** COACH · UP NEXT · NEW PR. Display, not mono — this system's kicker is
      set in the display face, which is where it differs most from v5's. */
  kick: {
    family: 'display',
    size: 12,
    weight: 700,
    lineHeight: 1.2,
    letterSpacing: 0.08,
    uppercase: true,
  },
  /** Coach sentences and prose. */
  body: { family: 'body', size: 14, weight: 500, lineHeight: 1.6 },
  /** A secondary action that is not a button — "skip rest", "± 30s". */
  action: { family: 'body', size: 14, weight: 600, lineHeight: 1.2 },
  /** The date line, the routine meta. Collapses the prototype's 13/400. */
  label: { family: 'body', size: 13, weight: 500, lineHeight: 1.5 },
  /** A stat tile's sub-label. The one fractional size, and it is the
      prototype's own. */
  caption: { family: 'body', size: 11.5, weight: 500, lineHeight: 1.3 },
  /** The live set rows — the figures a lifter reads mid-set, so the largest
      the mono voice goes. */
  dataLg: { family: 'mono', size: 14, weight: 500, lineHeight: 1.4, tabular: true },
  /** Status row, the finish set list, the "next up" strip. */
  data: { family: 'mono', size: 13, weight: 500, lineHeight: 1.4, tabular: true },
  /** "set 3 of 4 · barbell", elapsed time. */
  meta: { family: 'mono', size: 12, weight: 500, lineHeight: 1.3, tabular: true },
  /** WEIGHT · KG, REST · OF 2:00. The tracked machine label. */
  nano: {
    family: 'mono',
    size: 11,
    weight: 500,
    lineHeight: 1.2,
    letterSpacing: 0.1,
    uppercase: true,
  },
} as const satisfies Record<string, TypeStep>

export type TypeStepName = keyof typeof type

/* ── Elevation ─────────────────────────────────────────────────────────────
   v5 forbade shadows outright and drew every edge as a ring. This system uses
   both, and the distinction is load-bearing: the ring says "this is a
   surface", the shadow says "this is ABOVE the surface", and the ember glow
   says "this is the one thing to press". Three, and no fourth.

   Stated as numbers rather than a CSS string because React Native has no
   `box-shadow`: it wants `shadowColor` / `shadowOffset` / `shadowRadius`, and
   a string would have to be re-parsed on that side. */
export const elevation = {
  /** A card at rest: the ring, plus a 1px lift. */
  card: { color: 'rgba(22, 19, 14, 0.06)', y: 1, blur: 2 },
  /** The one action on the screen. Ember, and only ever under ember. */
  cta: { color: 'rgba(232, 73, 29, 0.35)', y: 10, blur: 26 },
} as const

/* ── Shape, spacing, motion ────────────────────────────────────────────── */

export const radius = {
  /** A card. */
  card: 20,
  /** The smaller card — a stat tile, the stepper, the plate strip. */
  cardSm: 18,
  /** A control inside a card: the stepper's ± keys, an input, a thumbnail. */
  ctl: 12,
  /** The rest canvas's "next up" strip, which is neither card nor control. */
  strip: 16,
  chip: 6,
  /** Every button in this system, and the avatar. */
  pill: 999,
} as const

export const space = {
  /** Screen gutter. 22 everywhere in the prototype, including auth. */
  gutter: 22,
  authGutter: 22,
  cardPad: 18,
  /** The hero CTA. 58 on Home, 60 mid-workout — the taller one is the
      button a lifter presses with the back of a wrist. */
  cta: 58,
  ctaLive: 60,
  /** A stepper's ± key, and the workout header's back button. */
  key: 46,
  back: 40,
  /** Touch floor, §2.4. Nothing pressable is smaller. */
  touch: 48,
  /** The tab bar's height, in ONE place. Three sticky clusters clear it. */
  tabBar: 58,
  /** The stepper's side zones — full-row, 82 wide. */
  stepperZone: 82,
  /** The commit bar. The handoff allows 70–76; the app uses the floor. */
  commitBar: 70,
  otpCell: 58,
} as const

/**
 * Durations, named for the question each one answers. Nothing on the logging
 * path exceeds 200ms — that is a plan gate, not a preference.
 */
export const motion = {
  /** "Did my finger land?" */
  press: 80,
  /** "Did my set save?" */
  instant: 90,
  /** "Where did I come from?" */
  transition: 160,
  /** "Did I beat it?" — the only one allowed past 200ms, and it is off-path. */
  celebration: 1140,
  /** The bar fill, and the one easing curve the handoff names. */
  fill: 500,
  /** The rest ring. Linear, because a clock that eases is a clock that lies. */
  ring: 1000,
} as const

/** `cubic-bezier(.2,.8,.2,1)` — the handoff's fill curve, as four numbers so
    Reanimated's `Easing.bezier` and CSS can both take it. */
export const fillEasing = [0.2, 0.8, 0.2, 1] as const
