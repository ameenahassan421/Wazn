/**
 * The v5 "Momentum" design tokens, in one place, as plain TypeScript.
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
 * `docs/design/v5-momentum/design/ui.jsx`, which the handoff README names as
 * "THE token source". Where this file and the handoff differ, the handoff is
 * normative (README §Fidelity) and this file is the bug.
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
export const palette = {
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

export type PaletteKey = keyof typeof palette

/* ── Type ──────────────────────────────────────────────────────────────────
   Three faces and ten steps. Weight and leading travel WITH each step so a
   size cannot be used at the wrong weight by accident.

   The ramp is a floor, not a ceiling: the reference renders 26 distinct sizes
   and declares 10. What is enforced is that no size is anonymous — every one
   is a named step or one of the three idioms the reference itself repeats.
   `scripts/check_type_ramp.mjs` fails the build on anything else. */
export const fontFamily = {
  /** Display and every figure. Condensed is load-bearing: mega is 84px and
      only fits a phone because the face is narrow. */
  display: 'Saira Semi Condensed',
  body: 'Hanken Grotesk',
  /** The meta voice: kickers, timestamps, chips. Machine-set, not spoken. */
  mono: 'IBM Plex Mono',
} as const

export type FontRole = keyof typeof fontFamily

export type TypeStep = {
  family: FontRole
  size: number
  weight: 400 | 500 | 600 | 700
  /** Unitless multiplier, as CSS `line-height` and RN's ratio both want. */
  lineHeight: number
  /** In `em`, so both stacks can scale it by `size`. */
  letterSpacing?: number
  uppercase?: boolean
  /** `font-variant-numeric: tabular-nums`. Every figure a lifter reads. */
  tabular?: boolean
}

export const type = {
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

export type TypeStepName = keyof typeof type

/* ── Shape, spacing, motion ────────────────────────────────────────────── */

export const radius = {
  card: 16,
  ctl: 12,
  chip: 6,
  pill: 999,
} as const

export const space = {
  /** Screen gutter. Auth screens use 22. */
  gutter: 18,
  authGutter: 22,
  cardPad: 16,
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
