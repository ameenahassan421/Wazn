import { View } from 'react-native'
import Svg, { Circle, Line, Polyline } from 'react-native-svg'

import { palette, sparkGeometry } from '@wazn/domain'

import { Txt } from '@/design/Txt'

/**
 * A small line chart: a series, a baseline, and the last reading.
 *
 * ── THE MATHS IS NOT HERE ───────────────────────────────────────────────────
 * `sparkGeometry` in `@wazn/domain` places the points, and it is tested there
 * — the flat series, the single reading, the min..max normalisation that stops
 * a body weight between 80 and 83 from being drawn as a flat line four pixels
 * from the top. This file turns those coordinates into SVG and nothing else.
 *
 * ── THE BAND IS LABELLED, WHICH IS NOT DECORATION ───────────────────────────
 * Normalising to min..max means the shape exaggerates: 0.4kg of drift fills
 * the box exactly as 40kg would. Printing `min` and `max` beside it is what
 * keeps that honest — without them the chart says "big change" whatever the
 * numbers are, which on a body-weight screen is the most alarming thing this
 * app could get wrong.
 *
 * ── AND IT SAYS WHEN IT HAS NOTHING TO SHOW ─────────────────────────────────
 * One reading is not a trend. `flat` comes back true for that and for a series
 * that has genuinely not moved, and the caller gets a sentence instead of a
 * horizontal line that reads as a measurement.
 */
export function Spark({
  values,
  width,
  height = 90,
  label,
  range,
  emptyLine,
}: {
  /** Oldest first. */
  values: number[]
  width: number
  height?: number
  /** Formats one end of the band. Usually a unit-aware weight. */
  label: (value: number) => string
  /** Joins the two ends into a sentence. The caller owns it because "to" is a
   *  word, and this component has no catalogue. */
  range: (low: string, high: string) => string
  /** Shown instead of the line when there is not enough to draw a trend. */
  emptyLine: string
}) {
  const geometry = sparkGeometry(values, { width, height })

  if (geometry === null || geometry.flat) {
    return (
      <Txt step="label" ink="muted">
        {emptyLine}
      </Txt>
    )
  }

  const points = geometry.points.map((p) => `${p.x},${p.y}`).join(' ')
  const last = geometry.points[geometry.points.length - 1]

  return (
    <View style={{ gap: 6 }}>
      <Svg width={width} height={height}>
        {/* The floor, and the dashed midline. Both in `ring`, because they are
            the paper the line is drawn ON, not data. */}
        <Line
          x1={4}
          y1={height - 4}
          x2={width - 4}
          y2={height - 4}
          stroke={palette.ring}
          strokeWidth={1}
        />
        <Line
          x1={4}
          y1={geometry.midY}
          x2={width - 4}
          y2={geometry.midY}
          stroke={palette.ring}
          strokeWidth={1}
          strokeDasharray="3 4"
        />
        <Polyline
          points={points}
          fill="none"
          stroke={palette.accent}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Where you are now. The only filled mark on the chart. */}
        <Circle cx={last.x} cy={last.y} r={3.5} fill={palette.accent} />
      </Svg>
      {/* ONE line, and it says "range".
          The first version put `min` at the left end and `max` at the right,
          which is where a reader's eye expects FIRST and LAST — so a series
          running 82.4 down to 81.2 was labelled "80.7 … 82.9" and read as
          rising. The numbers were correct and the chart lied. */}
      <Txt step="meta" ink="muted" ltr>
        {range(label(geometry.min), label(geometry.max))}
      </Txt>
    </View>
  )
}
