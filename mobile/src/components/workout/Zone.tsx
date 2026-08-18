import { Pressable, View } from 'react-native'

import { palette, space } from '@wazn/domain'

import { Txt, Kick } from '@/design/Txt'
import { TYPE } from '@/design/type'
import { tick } from '@/services/haptics'

/**
 * A stepper zone — the row you actually lift against.
 *
 * ── WHY THE SIDES ARE 82px AND FULL HEIGHT ──────────────────────────────────
 * This is the one control in the app used while holding a loaded bar, looking
 * at a rack rather than a screen, with one hand. The handoff gives the minus
 * and plus zones 82px of width across the WHOLE row rather than drawing two
 * buttons, and that is the difference between a control you aim at and one you
 * slap. At 390px that leaves 226px for the figure, which is what lets the
 * weight sit at `mega`.
 *
 * ── THE FIGURE IS NOT A TEXT INPUT ──────────────────────────────────────────
 * Tapping it opens a keypad, and the keypad is the slow path — it exists for
 * the one-off correction, not the loop. The steppers are the loop. Nothing
 * here may cost more than a press.
 */
export function Zone({
  label,
  value,
  onStep,
  onPressValue,
  step,
  size = 'mega',
  suffix,
}: {
  label: string
  /** Already in the reader's unit — this component does no conversion. */
  value: string
  onStep: (direction: 1 | -1) => void
  /** The slow path: open a keypad. */
  onPressValue?: () => void
  /** What one press changes, for the accessibility label only. */
  step: string
  /** Weight sits at `mega` (84). Reps sits at `hero` — the handoff says 56,
   *  which is not a step; `hero` is 50 and is the nearest named one, and the
   *  ramp is a floor rather than a licence to invent a size. */
  size?: 'mega' | 'hero'
  suffix?: string
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: palette.line,
      }}
    >
      <Side direction={-1} onStep={onStep} label={`${label}: down ${step}`} />

      <Pressable
        onPress={onPressValue}
        disabled={onPressValue === undefined}
        accessibilityRole={onPressValue === undefined ? 'text' : 'button'}
        accessibilityLabel={`${label} ${value}${suffix ?? ''}`}
        style={{ flex: 1, alignItems: 'center', paddingVertical: 6 }}
      >
        <Kick>{label}</Kick>
        <Txt
          step={size}
          ltr
          // `adjustsFontSizeToFit` rather than a smaller step: a four-digit
          // weight in lbs only just fits at 84px even in a condensed face.
          // Shrinking to fit keeps 1000 legible without making every ordinary
          // number smaller.
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{ marginTop: -2 }}
        >
          {value}
          {suffix !== undefined && (
            <Txt step="num" ink="muted" ltr>
              {' '}
              {suffix}
            </Txt>
          )}
        </Txt>
      </Pressable>

      <Side direction={1} onStep={onStep} label={`${label}: up ${step}`} />
    </View>
  )
}

function Side({
  direction,
  onStep,
  label,
}: {
  direction: 1 | -1
  onStep: (d: 1 | -1) => void
  label: string
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        tick()
        onStep(direction)
      }}
      style={({ pressed }) => ({
        width: space.stepperZone,
        alignSelf: 'stretch',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 96,
        backgroundColor: pressed ? palette.raised : 'transparent',
      })}
    >
      <Txt
        step="fig"
        ink="muted"
        ltr
        style={{ fontFamily: TYPE.fig.fontFamily, lineHeight: 34 }}
      >
        {direction === 1 ? '+' : '−'}
      </Txt>
    </Pressable>
  )
}
