import { View, type ViewProps, type ViewStyle } from 'react-native'

import { palette, radius, space } from '@wazn/domain'

/**
 * A card, and the hairline that separates it from the ground.
 *
 * ── ELEVATION IS AN EDGE, NOT A SHADOW ──────────────────────────────────────
 * The web app draws this as `box-shadow: 0 0 0 1px line` — a ring, which sits
 * OUTSIDE the box and costs no layout. React Native has no such thing:
 * `shadowColor`/`elevation` are real drop shadows, which §2.4 forbids
 * outright, and there is no spread-only shadow to borrow.
 *
 * So on native the ring becomes a 1px border. That is not a downgrade dressed
 * up — a border is inside the box, so it eats a pixel of padding on each side,
 * and the padding below is stated as the design's 16 with the border drawn on
 * top of the ground rather than 15 plus a border. At `rgba(236,231,220,0.08)`
 * on `#181510` the difference is invisible and the geometry stays honest.
 *
 * `hairlineWidth` is deliberately NOT used. It is 0.33px on a 3× screen, which
 * is what you want for a table rule and not what you want for the one thing
 * separating a card from a near-black ground.
 */

export type CardProps = ViewProps & {
  /** The raised tier — menus, pressed states, the unfilled half of a track. */
  raised?: boolean
  /** Drop the padding, for cards that are full-bleed inside. */
  bare?: boolean
  style?: ViewStyle | ViewStyle[]
}

export function Card({ raised, bare, style, ...rest }: CardProps) {
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: raised === true ? palette.raised : palette.surface,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: palette.line,
          padding: bare === true ? 0 : space.cardPad,
        },
        style ?? null,
      ]}
    />
  )
}

/**
 * The hairline on its own — a rule between rows inside a card.
 *
 * Full-bleed by default: a divider inset from both edges reads as a gap in
 * the content, while one that runs edge to edge reads as a boundary. The
 * `inset` prop exists for the list idiom where the leading element (a tile, an
 * index) is meant to sit above the rule rather than beside it.
 */
export function Rule({ inset = 0 }: { inset?: number }) {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: palette.line,
        marginStart: inset,
      }}
    />
  )
}
