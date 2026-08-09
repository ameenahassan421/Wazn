/**
 * The app's one line-chart grammar: dashed quarter gridlines, a 1px baseline,
 * an 8%-opacity accent area under a 2px accent line, and a dot on the latest
 * point.
 *
 * Extracted from the Progress screen's volume trend when U4 needed the same
 * shape per exercise. A second copy would have been a second set of gridline
 * counts and radii to keep in sync, which is how two surfaces answering the
 * same question start disagreeing.
 *
 * Deliberately owns no heading, no footer and no range chips: the caller
 * knows what the series means and how to format its numbers. This draws.
 */
export function SeriesChart({
  values,
  ariaLabel,
  height = 96,
  baseline = 'zero',
}: {
  /** In series order, oldest first. Fewer than two points draws no line. */
  values: number[]
  ariaLabel: string
  height?: number
  /**
   * Where the vertical axis starts.
   *
   * `zero` for a quantity you accumulated — volume moved in a week is a real
   * amount and the area under it means something.
   *
   * `data` for a level you are trying to move: an estimated 1RM sits at 98 to
   * 118 kg, so against a zero axis nine months of progress is a flat line
   * across the top and the chart answers "is this progressing?" with "no".
   * The area fill is dropped in this mode on purpose — an area implies
   * magnitude measured from zero, and there is no zero here to measure from.
   */
  baseline?: 'zero' | 'data'
}) {
  const W = 320
  const H = height
  const PAD = 6
  const hi = Math.max(...values, 0)
  const lo = Math.min(...values, hi)
  // A flat series still needs a denominator, and a series of zeroes must not
  // divide by zero.
  const floor = baseline === 'data' ? (hi === lo ? lo - 1 : lo) : 0
  const ceiling = Math.max(
    floor + 1,
    baseline === 'data' ? (hi === lo ? hi + 1 : hi) : hi,
  )
  // Inset by the marker radius at both ends. Plotting the last point at x=W
  // put half the dot outside the viewBox and it rendered clipped down the
  // right edge — on the volume trend too, since the day it was written.
  const DOT = 3.5
  const x0 = DOT
  const x1 = W - DOT
  const step = values.length > 1 ? (x1 - x0) / (values.length - 1) : 0
  const plotted = values.map((value, i) => ({
    x: values.length > 1 ? x0 + i * step : W / 2,
    y: H - PAD - ((value - floor) / (ceiling - floor)) * (H - PAD * 2),
  }))
  const line = plotted.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')
  const area = `${line} L${x1} ${H} L${x0} ${H} Z`
  const last = plotted.at(-1)
  const filled = baseline === 'zero' && plotted.length > 1

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block w-full"
      style={{ aspectRatio: `${W} / ${H}` }}
      role="img"
      aria-label={ariaLabel}
    >
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1="0"
          x2={W}
          y1={H * f}
          y2={H * f}
          stroke="var(--divider)"
          strokeWidth="1"
          strokeDasharray="2 4"
        />
      ))}
      <line x1="0" x2={W} y1={H} y2={H} stroke="var(--divider)" strokeWidth="1" />
      {filled && <path d={area} fill="var(--color-accent)" opacity="0.08" />}
      {plotted.length > 1 && (
        <path
          d={line}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {last && <circle cx={last.x} cy={last.y} r="3.5" fill="var(--color-accent)" />}
    </svg>
  )
}
