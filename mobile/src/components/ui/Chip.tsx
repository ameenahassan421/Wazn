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
 * ── BRASS ───────────────────────────────────────────────────────────────────
 * The scoped second hue, and only for the four earned states: rank, duel
 * opponent, record pace, target beaten. The handoff asks that any third use be
 * flagged in review — so treat a `brass` chip on ordinary chrome as a defect.
 */

export function Chip({ brass, children }: { brass?: boolean; children: string }) {
  return (
    <View
      style={{
        backgroundColor: brass === true ? palette.brassBg : palette.chipBg,
        borderRadius: radius.chip,
        paddingVertical: 3,
        paddingHorizontal: 8,
        alignSelf: 'flex-start',
      }}
    >
      {/* `ltr` because a chip is always a figure — `125 × 8`, `▲ 9%`, a date.
          An Arabic locale must not reorder those, and `numberOfLines={1}` is
          the nowrap the web chip gets from `white-space`. */}
      <Txt
        step="meta"
        ink={brass === true ? 'brassSoft' : 'accentSoft'}
        ltr
        numberOfLines={1}
      >
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
export function CoachLine({
  line,
  chip,
  brass,
}: {
  line: string
  chip: string
  brass?: boolean
}) {
  return (
    <View style={{ gap: 8 }}>
      <Chip brass={brass}>{chip}</Chip>
      <Txt step="body" ink="muted">
        {line}
      </Txt>
    </View>
  )
}
