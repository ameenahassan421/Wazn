import { View } from 'react-native'

import { palette, radius } from '@wazn/domain'

import { Txt } from '@/design/Txt'

/**
 * The data chip — the app's single most load-bearing piece of grammar.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 * "Every AI sentence renders with exactly one chip. No chip, no claim — an AI
 * line without its number must not render." (handoff §The data-chip grammar,
 * marked app-wide and non-negotiable.)
 *
 * That is not a styling rule, it is the app's honesty mechanism: the chip is
 * where the model's sentence gets pinned to a computed number the reader can
 * check against their own Progress screen. A coach line with no chip is a
 * claim with no evidence, and the reason `CoachLine` below takes the chip as a
 * REQUIRED prop rather than an optional one is that "optional" is how it goes
 * missing.
 *
 *
 * ── `brass` IS GONE, AND SO IS ITS PROP (2026-08-21) ────────────────────────
 * v5 reserved a second hue for earned states. The prototype that replaced it
 * has none — its earned signal is the `full` plate variant — so the colour
 * sweep collapsed every `palette.brass*` onto `accent`, which left this
 * component branching between two IDENTICAL values on a boolean nobody passed.
 * A flag that selects between the same thing twice is a claim the code does
 * not honour. If Ameen rules that the tier comes back, it comes back as a real
 * token with a real branch (WAZN_PLAN 7.0).
 */

export function Chip({ children }: { children: string }) {
  return (
    <View
      style={{
        backgroundColor: palette.accentWash,
        borderRadius: radius.chip,
        paddingVertical: 3,
        paddingHorizontal: 8,
        alignSelf: 'flex-start',
      }}
    >
      {/* `ltr` because a chip is always a figure — `125 × 8`, `▲ 9%`, a date.
          An Arabic locale must not reorder those.

          It WRAPS, and it used to carry `numberOfLines={1}` as "the nowrap the
          web chip gets from `white-space`". That was written when every chip
          in the app was `125 × 8` and it was fine right up until the Coach tab
          rendered real ones: `back 0, chest 0, shoulders 0 - target…` on a
          390px phone, three of four notes truncated, the ellipsis eating the
          exact figure the sentence beside it is a claim about.

          A truncated chip is worse than a wrapped one by the doctrine at the
          top of this file. "No chip, no claim" exists so the reader can check
          the number against their own Progress screen; a number cut off mid-
          word cannot be checked, so an ellipsis here is a claim with its
          evidence torn off. Two lines are not pretty. Lying is worse. */}
      <Txt step="meta" ink="accentSoft" ltr>
        {children}
      </Txt>
    </View>
  )
}

/*
 * `CoachLine` was here — a chip-above-sentence stack, exported and rendered by
 * nothing. Both surfaces that show a coach sentence (Home and Finish) lay it
 * out by hand, because the prototype draws a PLATE beside the line rather than
 * a chip above it. Removed 2026-08-21; the layout that ships is the one in
 * those two screens.
 */
