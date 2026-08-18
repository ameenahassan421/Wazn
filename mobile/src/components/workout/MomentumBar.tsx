import { View } from 'react-native'

import { Txt } from '@/design/Txt'
import { Fill } from '@/components/ui/Fill'

/**
 * The momentum bar — session working volume against the last session's total.
 *
 * ── THE BRASS FLIP IS THE EVENT ─────────────────────────────────────────────
 * At 100% the fill turns brass and the label becomes RECORD PACE. That is the
 * single most important state change on this screen: it is the moment a lifter
 * mid-workout learns today is going to count. It is a colour change and a word,
 * and nothing else — no flash, no bounce, no toast. The bar arriving at the end
 * of its track IS the celebration, and anything louder would be a modal on the
 * logging path.
 *
 * With no previous session there is no target, so the bar does not render at
 * all. A progress bar against an invented denominator is worse than no bar.
 */
export function MomentumBar({
  volumeKg,
  targetKg,
  unitLabel,
  formatVolume,
}: {
  volumeKg: number
  targetKg: number | null
  unitLabel: string
  /** Injected so this component never learns about units. */
  formatVolume: (kg: number) => string
}) {
  if (targetKg === null || targetKg <= 0) return null

  const pct = (volumeKg / targetKg) * 100
  const beaten = pct >= 100
  const leftKg = Math.max(0, targetKg - volumeKg)

  return (
    <View style={{ gap: 7 }}>
      <Fill pct={pct} brass={beaten} height={6} />
      <Txt step="meta" ink={beaten ? 'brassSoft' : 'muted'} ltr>
        {beaten
          ? 'RECORD PACE'
          : `${formatVolume(leftKg)} ${unitLabel} LEFT TO BEAT LAST SESSION`}
      </Txt>
    </View>
  )
}
