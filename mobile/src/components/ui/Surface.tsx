import { View, type ViewProps, type ViewStyle } from 'react-native'

import { elevation, palette, radius, space } from '@wazn/domain'

/**
 * A card, and the four grounds one can have.
 *
 * ── THE RING SAYS "SURFACE", THE SHADOW SAYS "ABOVE IT" ─────────────────────
 * v5 forbade shadows outright and drew every edge as a ring. This system uses
 * both, and the pair is load-bearing rather than decorative: on paper, a white
 * card with no shadow at all is nearly invisible (`#ffffff` on `#f7f3ec` is a
 * 5% step), so the 1px lift is what separates the card from the page and the
 * ring is what gives it an edge when the shadow is clipped by a screenshot or
 * a low-contrast display.
 *
 * Both are the prototype's own values, and the shadow is stated in RN's terms
 * because React Native has no `box-shadow` — a CSS string would have to be
 * re-parsed here, which is a second source of truth for one number.
 */

export type CardTone =
  /** The default. White, ringed, lifted 1px. */
  | 'card'
  /** Ink. The Up Next card — a card that is the NEXT thing, not this thing. */
  | 'ink'
  /** Ember wash. Earned only: the PR card. Never a container for prose. */
  | 'wash'

const TONES: Record<CardTone, { bg: string; ring?: string; lift?: boolean }> = {
  card: { bg: palette.card, ring: palette.ring, lift: true },
  ink: { bg: palette.ink },
  wash: { bg: palette.accentWash },
}

/*
 * An `onInk` tone was here for the rest canvas's coach card, and the canvas
 * builds that surface by hand. Same reasoning as `Btn`'s removed `onInk` kind:
 * the inverted context draws from the prototype, not from this ramp.
 */

export type CardProps = ViewProps & {
  tone?: CardTone
  /** The smaller radius — a stat tile, a stepper, the plate strip. */
  small?: boolean
  /** Drop the padding, for cards that are full-bleed inside. */
  bare?: boolean
  style?: ViewStyle | ViewStyle[]
}

export function Card({ tone = 'card', small, bare, style, ...rest }: CardProps) {
  const t = TONES[tone]
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: t.bg,
          borderRadius: small === true ? radius.cardSm : radius.card,
          padding: bare === true ? 0 : space.cardPad,
        },
        t.ring !== undefined ? { borderWidth: 1, borderColor: t.ring } : null,
        t.lift === true
          ? {
              shadowColor: palette.ink,
              shadowOpacity: 0.06,
              shadowOffset: { width: 0, height: elevation.card.y },
              shadowRadius: elevation.card.blur / 2,
              elevation: 1,
            }
          : null,
        style ?? null,
      ]}
    />
  )
}

/**
 * The hairline on its own — a rule between rows inside a card.
 *
 * Full-bleed by default: a divider inset from both edges reads as a gap in the
 * content, while one that runs edge to edge reads as a boundary. `inset` is
 * for the list idiom where a leading tile sits above the rule, not beside it.
 */
export function Rule({ inset = 0, onInk }: { inset?: number; onInk?: boolean }) {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: onInk === true ? palette.onInkTrack : palette.ring,
        marginStart: inset,
      }}
    />
  )
}
