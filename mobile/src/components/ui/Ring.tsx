import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'

import { motion } from '@wazn/domain'

import { usePalette } from '@/hooks/use-theme'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/**
 * The rest ring — screen 08, and the app's one piece of identity that is not
 * type or colour.
 *
 * ── IT FILLS. IT DOES NOT DRAIN. ────────────────────────────────────────────
 * Empty when rest starts, whole when rest ends. This has been argued the other
 * way twice and lost both times: the brand sheet states it as identity — "the
 * rest timer *is* the plate — it fills as you recover" — and the handoff's
 * behaviour spec gives the same expression. A bar draining away is a deadline;
 * a plate filling up is recovery. The app is about the second thing.
 *
 * ── WHY LINEAR ──────────────────────────────────────────────────────────────
 * `Easing.linear` over exactly one second, retriggered on each tick of the
 * timer. Anything eased would make the ring move fastest in the middle of each
 * second and crawl at the boundaries, which is a clock that lies. This is the
 * one animation in the app that is deliberately not on the house curve.
 *
 * The engine is untouched: the ring is told a fraction, it does not own a
 * timer. `use-rest-timer` remains the single deadline-based source of truth.
 */

export function Ring({
  /** 0 at the start of the rest, 1 at the end. */
  progress,
  size = 250,
  stroke = 9,
  onInk,
  children,
}: {
  progress: number
  size?: number
  stroke?: number
  /** Drawn on the ink ground. The track has to come from the `onInk` family
   *  or it renders as a near-white band: `paper` on `ink` is a 16:1 step, and
   *  the track is meant to be the QUIET half of the ring. */
  onInk?: boolean
  children?: React.ReactNode
}) {
  const palette = usePalette()
  const r = (size - stroke * 2) / 2
  const circumference = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(1, progress))

  // The dash offset counts DOWN as the ring fills: a full offset hides the
  // whole arc, zero shows all of it.
  const offset = useSharedValue(circumference * (1 - clamped))

  useEffect(() => {
    offset.value = withTiming(circumference * (1 - clamped), {
      duration: motion.ring,
      easing: Easing.linear,
    })
  }, [clamped, circumference, offset])

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }))

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* The track. `raised` rather than `line`: at 9px wide a 0.08 alpha
            hairline colour disappears, and the ring needs a visible whole for
            the filled part to be read as a fraction of something. */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={onInk === true ? palette.onInkTrack : palette.paper}
          strokeWidth={stroke}
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={palette.accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          // Start at twelve o'clock rather than three.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>{children}</View>
    </View>
  )
}
