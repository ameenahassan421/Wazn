import { View } from 'react-native'

import { palette } from '@wazn/domain'

import { Txt } from '@/design/Txt'
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
 * ── THE THREE NUMBERS THAT MAKE IT READ AS A WORD ───────────────────────────
 * The plate is 14 to the type's 26 — a little over half — and it sits 3px BELOW
 * the baseline the letters sit on, because a circle centred on an x-height
 * reads as floating. The 1px gaps either side are the whole of the kerning: at
 * `-0.05em` the two halves are already tight enough that a 2px gap opens a
 * hole. Every one of those is the prototype's; none is a preference.
 *
 * ── WHY IT IS NOT `step="mark"` ALONE ───────────────────────────────────────
 * The ramp gives the two Latin halves their size and weight, and that is all a
 * ramp can do here. A wordmark is a fixed relationship between letterforms, a
 * glyph and a colour; the last two are not sizes and cannot live on a step.
 */
export function Wordmark({
  size = 26,
  /** The two Latin halves. The plate is always ember. */
  color = palette.ink,
}: {
  size?: number
  color?: string
}) {
  const half = { fontSize: size, lineHeight: size, letterSpacing: size * -0.05 }
  return (
    <View
      accessibilityRole="header"
      accessibilityLabel="Wazn"
      // `ltr`: `wazn` is a name, and an Arabic layout must not reverse it.
      style={{ flexDirection: 'row', alignItems: 'center', direction: 'ltr' }}
    >
      <Txt step="mark" style={[half, { color }]}>
        w
      </Txt>
      <View style={{ marginHorizontal: 1, top: size * 0.115 }}>
        <Plate size={size * 0.54} variant="mark" />
      </View>
      <Txt step="mark" style={[half, { color }]}>
        zn
      </Txt>
    </View>
  )
}
