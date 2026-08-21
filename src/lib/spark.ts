/**
 * Where the dots go on a small line chart.
 *
 * ── WHY THE MATHS IS HERE AND THE SVG IS NOT ────────────────────────────────
 * Two stacks draw this — the native `Spark` and whatever Progress ends up
 * using on web — and neither should own the scaling. What can be got wrong
 * here is arithmetic, and arithmetic is testable: a flat series dividing by
 * zero, a single reading, a chart drawn from zero when the data lives between
 * 80 and 83.
 *
 * ── IT NORMALISES TO min..max, NOT TO 0..max ────────────────────────────────
 * That is the difference between this and the web's volume bars, which scale
 * from zero because a bar's length IS its value. A LINE is about change: body
 * weight between 80.4 and 82.9 plotted from zero is a flat line four pixels
 * from the top, which is a true chart of nothing. `min` and `max` come back
 * with the points so a caller can label the band it is actually showing —
 * without that label the shape would be a lie by omission.
 */

export interface SparkPoint {
  x: number
  y: number
}

export interface SparkGeometry {
  /** In draw order, oldest first. */
  points: SparkPoint[]
  /** The lowest and highest values in the series, for the axis labels. */
  min: number
  max: number
  /** The y of the midpoint between them — the dashed reference line. */
  midY: number
  /** True when every reading is identical, so the caller can say so rather
   *  than drawing a flat line and letting it read as "no change measured". */
  flat: boolean
}

export function sparkGeometry(
  values: number[],
  {
    width,
    height,
    /** Keeps the stroke and the end dot inside the box. */
    pad = 4,
  }: { width: number; height: number; pad?: number },
): SparkGeometry | null {
  const clean = values.filter((v) => Number.isFinite(v))
  if (clean.length === 0) return null

  const min = Math.min(...clean)
  const max = Math.max(...clean)
  const span = max - min
  const top = pad
  const bottom = height - pad
  const usable = Math.max(0, bottom - top)

  /**
   * A flat series sits on the MIDDLE, not the top or the bottom.
   *
   * `span` is 0 when every reading is the same — one weigh-in repeated, or a
   * single point. Dividing by it is the obvious bug; the less obvious one is
   * "fix" it with `span || 1`, which is what the v5 reference does and which
   * silently pins a flat series to the bottom of the box. A lifter whose
   * weight has not moved should see a line through the middle.
   */
  const y = (v: number): number =>
    span === 0 ? top + usable / 2 : bottom - ((v - min) / span) * usable

  // A single point has no width to spread over, so it goes in the centre
  // rather than at x = pad, where it reads as the start of a line that is
  // missing.
  const x = (i: number): number =>
    clean.length === 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (clean.length - 1)

  return {
    points: clean.map((v, i) => ({ x: x(i), y: y(v) })),
    min,
    max,
    midY: top + usable / 2,
    flat: span === 0,
  }
}
