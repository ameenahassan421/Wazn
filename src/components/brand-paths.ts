/**
 * The Plate — canonical brand geometry, v3.
 *
 * Hand-transcribed from the design handoff's brand sheet,
 * `docs/design/v3-plate/Wazn Brand - Logo.dc.html`, which is the source of
 * truth for these curves. Unlike `wordmark-paths.ts` — Arabic letterforms
 * converted from a font this app does not ship — these are drawn shapes with
 * no typeface behind them, so they are written out rather than generated.
 *
 * Two shapes, and they are not interchangeable:
 *
 *  - WORDMARK_PLATE stands in for the "a" in `wazn`. It carries a bar stub on
 *    its inline end, which is what makes it read as a letter sitting on a bar
 *    rather than as a loose ring.
 *  - MARK_PLATE is the mark alone — the app icon. Two grip slots, no stub,
 *    because nothing holds it up at that size and the grips are what say
 *    "plate" without a word next to them.
 *
 * The Arabic وزن barbell mark is NOT replaced by either of these. It leads in
 * the Arabic locale, on the splash and in About: the handoff calls it the
 * soul, and it stays in `wordmark-paths.ts`.
 */

/** Ring and hole of the wordmark's plate, on a 100 grid. Needs `evenodd`. */
export const WORDMARK_PLATE_D =
  'M46 4 a46 46 0 1 0 0 92 a46 46 0 1 0 0 -92 Z ' +
  'M46 30 a16 16 0 1 1 0 32 a16 16 0 1 1 0 -32 Z'

/** The bar the wordmark's plate is loaded onto, same 100 grid. */
export const WORDMARK_BAR_D =
  'M93 4 a7 7 0 0 1 7 7 v78 a7 7 0 0 1 -14 0 v-78 a7 7 0 0 1 7 -7 Z'

/**
 * The mark alone — ring, hole and two grip slots on a 96 grid. One path,
 * `evenodd`, so it stamps as a single silhouette at any size.
 */
export const MARK_PLATE_D =
  'M48 4 a44 44 0 1 0 0 88 a44 44 0 1 0 0 -88 Z ' +
  'M48 33 a15 15 0 1 1 0 30 a15 15 0 1 1 0 -30 Z ' +
  'M17 43 h6 a5 5 0 0 1 5 5 a5 5 0 0 1 -5 5 h-6 a5 5 0 0 1 -5 -5 a5 5 0 0 1 5 -5 Z ' +
  'M73 43 h6 a5 5 0 0 1 5 5 a5 5 0 0 1 -5 5 h-6 a5 5 0 0 1 -5 -5 a5 5 0 0 1 5 -5 Z'

/**
 * How the plate sits in the word, as ratios of the type size.
 *
 * Taken from the brand sheet's hero, which sets `wazn` at 128px: a 67px
 * plate nudged 16px below the baseline with 2px of air either side, and 6px
 * between the plate group and the letters. The handoff describes the plate as
 * "optically ~52% of cap height" — 67/128 is where that lands, and the offset
 * is what stops a circle from floating in the middle of lowercase letters.
 */
export const WORDMARK_METRICS = {
  /** Plate diameter ÷ type size. */
  plate: 67 / 128,
  /** How far below the text's own box the plate drops ÷ type size. */
  drop: 16 / 128,
  /** Air either side of the plate ÷ type size. */
  gap: 2 / 128,
  /** Space between the letter groups and the plate ÷ type size. */
  letterGap: 6 / 128,
  /** The wordmark's tracking, from the brand sheet. */
  tracking: '-0.05em',
} as const
