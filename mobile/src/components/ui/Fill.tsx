import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { fillEasing, motion, palette } from '@wazn/domain'

/**
 * The momentum bar, and every other bar in the app.
 *
 * ── WHAT IT MEANS ───────────────────────────────────────────────────────────
 * On the live screen this is session normal-set volume against the last
 * same-routine total. At 100% it flips to brass and the label becomes RECORD
 * PACE — which is the single most important state change in the app, because
 * it is the one that tells a lifter mid-workout that today is going to count.
 * The flip is a colour change and nothing else: no bounce, no flash. The bar
 * arriving at the end of its track IS the event.
 *
 * ── THE CURVE ───────────────────────────────────────────────────────────────
 * `cubic-bezier(.2,.8,.2,1)` over 500ms, from the handoff, and shared with the
 * web app through `fillEasing` in the token module rather than retyped. It
 * front-loads: the bar covers most of the distance immediately and settles.
 * A linear fill of the same duration reads as slower even though it is not.
 */

export function Fill({
  pct,
  brass,
  height = 6,
  animate = true,
}: {
  /** 0–100. Clamped, because a session can exceed its target and the bar
   *  cannot — the overflow is what the brass flip says instead. */
  pct: number
  brass?: boolean
  height?: number
  /** Off for bars that are read rather than watched — the protein week, the
   *  duel card. Animating a static chart on mount is decoration. */
  animate?: boolean
}) {
  const clamped = Math.max(0, Math.min(100, pct))
  const width = useSharedValue(animate ? 0 : clamped)

  useEffect(() => {
    width.value = animate
      ? withTiming(clamped, {
          duration: motion.fill,
          easing: Easing.bezier(...fillEasing),
        })
      : clamped
  }, [clamped, animate, width])

  const style = useAnimatedStyle(() => ({ width: `${width.value}%` }))

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
      style={{
        height,
        backgroundColor: palette.paper,
        borderRadius: 3,
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={[
          {
            height: '100%',
            backgroundColor: brass === true ? palette.accent : palette.accent,
          },
          style,
        ]}
      />
    </View>
  )
}
