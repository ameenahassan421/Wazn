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
          An Arabic locale must not reorder those, and `numberOfLines={1}` is
          the nowrap the web chip gets from `white-space`. */}
      <Txt step="meta" ink="accentSoft" ltr numberOfLines={1}>
        {children}
      </Txt>
    </View>
  )
}

/**
 * One coach sentence and its one chip.
 *
 * The chip is required, and the sentence renders BELOW it rather than beside
 * it: at 430px a chip inline with 14px prose either wraps mid-number or
 * squeezes the sentence to three words a line. Stacking keeps the figure whole
 * and keeps the sentence readable, which is the order of priority the voice
 * rules imply — the number is the claim, the sentence is the phrasing.
 */
export function CoachLine({ line, chip }: { line: string; chip: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Chip>{chip}</Chip>
      <Txt step="body" ink="muted">
        {line}
      </Txt>
    </View>
  )
}
