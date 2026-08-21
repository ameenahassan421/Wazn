import Svg, { Circle, Path } from 'react-native-svg'

import { palette } from '@wazn/domain'

/**
 * The plate — a weight plate seen face-on, with a counter for the sleeve.
 *
 * ── FOUR CUTS OF ONE MARK ───────────────────────────────────────────────────
 * The prototype draws the plate at four levels of detail and uses each one in
 * exactly one register. They are not interchangeable, which is why this is a
 * variant rather than four components someone could pick the wrong one of:
 *
 *   plain  the plate alone. The CTA's icon, a logged set's bullet.
 *   hub    plain, with an ember hub. The COACH avatar and every coach line.
 *   full   plain, with the two sleeve collars. Earned states only — the PR
 *          card. Same relationship brass had to v5: a mark you have to win.
 *   mark   the LETTER. Wider viewBox, a bar down the right edge, and the only
 *          variant that is not round — it is the `a` in `wazn`, so it carries
 *          the bar the other three leave to context.
 *
 * ── WHY SVG AND NOT A PNG ───────────────────────────────────────────────────
 * It renders from 14px (inside the wordmark) to 44px (the PR card) in the same
 * screen. A raster at 14 is mush and a raster at 44 is four assets. The paths
 * are the prototype's own, copied rather than retraced.
 */

export type PlateVariant = 'plain' | 'hub' | 'full' | 'mark'

/** The disc, with the sleeve hole knocked out by `evenodd`. */
const DISC =
  'M48 4 a44 44 0 1 0 0 88 a44 44 0 1 0 0 -88 Z ' +
  'M48 33 a15 15 0 1 1 0 30 a15 15 0 1 1 0 -30 Z'

/** The two collars, added only by `full`. */
const COLLARS =
  'M17 43 h6 a5 5 0 0 1 5 5 a5 5 0 0 1 -5 5 h-6 a5 5 0 0 1 -5 -5 a5 5 0 0 1 5 -5 Z ' +
  'M73 43 h6 a5 5 0 0 1 5 5 a5 5 0 0 1 -5 5 h-6 a5 5 0 0 1 -5 -5 a5 5 0 0 1 5 -5 Z'

/** The letterform: a slightly fuller disc on a 100-unit box, plus the bar. */
const MARK_DISC =
  'M46 4 a46 46 0 1 0 0 92 a46 46 0 1 0 0 -92 Z ' +
  'M46 30 a16 16 0 1 1 0 32 a16 16 0 1 1 0 -32 Z'
const MARK_BAR = 'M93 4 a7 7 0 0 1 7 7 v78 a7 7 0 0 1 -14 0 v-78 a7 7 0 0 1 7 -7 Z'

export function Plate({
  size = 20,
  variant = 'plain',
  /** The plate's own colour. The hub is always `accent` — see below. */
  color = palette.accent,
}: {
  size?: number
  variant?: PlateVariant
  color?: string
}) {
  if (variant === 'mark') {
    return (
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Path fill={color} fillRule="evenodd" d={MARK_DISC} />
        <Path fill={color} d={MARK_BAR} />
      </Svg>
    )
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96">
      <Path
        fill={color}
        fillRule="evenodd"
        d={variant === 'full' ? `${DISC} ${COLLARS}` : DISC}
      />
      {/* The hub is ember whatever the plate is, because the plate is usually
          `ink` when it has one. A hub in the plate's own colour would be
          invisible — it is the one part that must contrast with the disc. */}
      {variant === 'hub' ? (
        <Circle cx={48} cy={48} r={9} fill={palette.accent} />
      ) : null}
    </Svg>
  )
}
