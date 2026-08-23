import { View } from 'react-native'

import { Txt } from '@/design/Txt'
import { usePalette } from '@/hooks/use-theme'
import { Plate } from './Plate'

/**
 * `w`, the plate, `zn`.
 *
 * ── THE MARK IS NOT A STRING ────────────────────────────────────────────────
 * The `a` is not a letter `a` coloured ember, which is what v5 did and what
 * this component did until 2026-08-20. It is the plate glyph, set between two
 * halves of Sora 800 at 26 with `-0.05em` tracking pulling them onto it.
 * Ameen: "same as prototype", after two rounds of being told the logo was
 * wrong while every automated check was green.
 *
 * ── THE PLATE IS A LOWERCASE LETTER, NOT A CIRCLE NUDGED DOWNWARDS ──────────
 * The prototype writes this as `width: 14` and `top: 3px` against 26px type,
 * which reads like two arbitrary nudges and is not. Work them through the line
 * box: `26px/1` with Sora's metrics puts the baseline at 23.0 from the row top
 * and the x-height at 9.2. A 14px plate centred in a 26px row starts at 6, and
 * `top: 3` moves it to 9 — top 9.0 against an x-height of 9.2, bottom 23.0 on
 * the baseline. The plate occupies the x-height box EXACTLY. It is set as a
 * letter with no ascender and no descender, which is what `a` is.
 *
 * So this aligns to the baseline and states the x-height, rather than porting
 * the 3px as a ratio of font size. That is what this component did until
 * Ameen asked "the a is a little bit lower, is that on purpose?" on
 * 2026-08-20 — it was not: React Native does not compute a text box the way
 * CSS does, the ratio drifted, and the plate hung below the baseline. A
 * proportion copied out of a browser is a guess about two layout engines
 * agreeing. `alignItems: 'baseline'` is not: Yoga gives a non-text child its
 * bottom edge as its baseline, so the plate sits ON the line by construction
 * at any size.
 *
 * The 1px gaps either side are the whole of the kerning, and they ARE the
 * prototype's: at `-0.05em` the two halves are already tight enough that a 2px
 * gap opens a hole.
 *
 * ── WHY IT IS NOT `step="mark"` ALONE ───────────────────────────────────────
 * The ramp gives the two Latin halves their size and weight, and that is all a
 * ramp can do here. A wordmark is a fixed relationship between letterforms, a
 * glyph and a colour; the last two are not sizes and cannot live on a step.
 */
/**
 * Sora's x-height as a fraction of the em, which is the plate's size.
 * 0.538 is the prototype's own ratio (14 against 26) and it agrees with the
 * face's `sxHeight`; if the display face ever changes, this changes with it.
 */
const X_HEIGHT = 0.538

export function Wordmark({
  size = 26,
  /** The two Latin halves. The plate is always ember. */
  color,
}: {
  size?: number
  color?: string
}) {
  const palette = usePalette()
  /* Body, not a default parameter: a default parameter cannot read a hook.
     Same change as `Plate`'s. */
  const ink = color ?? palette.ink
  const half = { fontSize: size, lineHeight: size, letterSpacing: size * -0.05 }
  return (
    <View
      accessibilityRole="header"
      accessibilityLabel="Wazn"
      // `ltr`: `wazn` is a name, and an Arabic layout must not reverse it.
      style={{ flexDirection: 'row', alignItems: 'baseline', direction: 'ltr' }}
    >
      <Txt step="mark" style={[half, { color: ink }]}>
        w
      </Txt>
      <View style={{ marginHorizontal: 1 }}>
        <Plate size={size * X_HEIGHT} variant="mark" />
      </View>
      <Txt step="mark" style={[half, { color: ink }]}>
        zn
      </Txt>
    </View>
  )
}
