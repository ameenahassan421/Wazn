import { useState, type ReactNode } from 'react'
import { Pressable, View, type ViewStyle } from 'react-native'

import { elevation, palette, radius, space } from '@wazn/domain'

import { Txt } from '@/design/Txt'
import { tick } from '@/services/haptics'

/**
 * The five button kinds this system draws, and nothing else.
 *
 * ── EVERY BUTTON IS A PILL, AND THE LABEL IS A SENTENCE ─────────────────────
 * `borderRadius: pill` on all five, and the label takes the `cta` step, which
 * is Sora 700 at 16 in SENTENCE case. Both are departures from v5, which drew
 * 12px rectangles labelled in uppercase. "Start workout", never "START
 * WORKOUT" — the prototype does not shout, and an uppercase label here reads
 * as a different app.
 *
 * ── PRESS FEEDBACK, AND WHY IT IS NOT `style={({pressed}) => ...}` ──────────
 * The pressed flag comes from `onPressIn`/`onPressOut` state and NOT from
 * Pressable's `style` callback, which is the idiomatic React Native form and
 * is SILENTLY DROPPED here. NativeWind 4.2.6 applies `cssInterop` to
 * `Pressable` to give it `className`; a function `style` does not survive
 * that, and RN renders the button with no background, no height, no padding
 * and no `flexDirection` — an invisible control that still takes taps.
 *
 * Found on 2026-08-20 from a simulator screenshot: SIGN IN was a gap in the
 * layout and CONTINUE WITH GOOGLE was two lines of near-black text on a
 * near-black ground. `tsc`, eslint and `expo export` were all green, because
 * nothing about it is a type error. `eslint.config.js` now has a rule so the
 * next one is a build failure instead of a screenshot.
 *
 * ── THE 48px FLOOR ──────────────────────────────────────────────────────────
 * `hitSlop` brings a `small` button (40px) up to the touch floor without
 * making it look 48 tall. That is the honest way to satisfy §2.4: the target
 * is 48, the ink is 40.
 */

export type BtnKind =
  /** THE action on a screen. Ember fill, ember glow, one per view. */
  | 'hero'
  /** The affirmative that is not the hero — "Done". Ink fill, cream label. */
  | 'ink'
  /** A real alternative — "Share card", "Finish". White, ringed. */
  | 'line'
  /** A way out — "skip rest". No box at all. */
  | 'ghost'

const KINDS: Record<
  BtnKind,
  { bg: string; ink: Parameters<typeof Txt>[0]['ink']; ring?: string; glow?: boolean }
> = {
  hero: { bg: palette.accent, ink: 'onInk', glow: true },
  ink: { bg: palette.ink, ink: 'onInk' },
  line: { bg: palette.card, ink: 'ink', ring: palette.ringStrong },
  ghost: { bg: 'transparent', ink: 'muted' },
}

/*
 * There was an `onInk` kind here, documented as "the only kind for the rest
 * canvas", and the rest canvas never used it: it hand-rolls `QuietAction`
 * instead. That is the right call and not an oversight — the canvas is the one
 * inverted context in the app and its controls take their metrics from the
 * prototype's own drawing rather than from this ramp. Removed rather than
 * forced, because a variant nobody selects is a claim about the design that
 * the design disagrees with.
 */

export function Btn({
  kind = 'line',
  label,
  onPress,
  small,
  disabled,
  full,
  leading,
  style,
}: {
  kind?: BtnKind
  label: string
  onPress: () => void
  small?: boolean
  disabled?: boolean
  /** Stretch to the container. The hero CTA always does. */
  full?: boolean
  /**
   * A glyph before the label, at the base row gap of 11. In this system it is
   * almost always `<Plate size={20} color={palette.onInk} />` — the CTA on
   * Home and the commit button mid-workout both carry one.
   */
  leading?: ReactNode
  style?: ViewStyle
}) {
  const k = KINDS[kind]
  const height = small === true ? 40 : 52
  const [pressed, setPressed] = useState(false)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      hitSlop={Math.max(0, (space.touch - height) / 2)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        tick()
        onPress()
      }}
      style={[
        {
          height,
          borderRadius: radius.pill,
          paddingHorizontal: small === true ? 16 : 20,
          flexDirection: 'row',
          gap: 11,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed && kind === 'hero' ? palette.accentPress : k.bg,
          alignSelf: full === true ? 'stretch' : 'flex-start',
          opacity: disabled === true ? 0.45 : pressed ? 0.9 : 1,
        },
        k.ring !== undefined ? { borderWidth: 1, borderColor: k.ring } : null,
        // The ember glow, and the only place in the app it is allowed. It is
        // what makes one button the button; a second one would make neither.
        k.glow === true && disabled !== true
          ? {
              shadowColor: palette.accent,
              shadowOpacity: 0.35,
              shadowOffset: { width: 0, height: elevation.cta.y },
              shadowRadius: elevation.cta.blur / 2,
              elevation: 8,
            }
          : null,
        style ?? null,
      ]}
    >
      {leading}
      <Txt step="cta" ink={k.ink}>
        {label}
      </Txt>
    </Pressable>
  )
}

/**
 * The hero CTA at its own height.
 *
 * 58 standing still, 60 mid-workout. Not a rounding: the taller one is the
 * button pressed with the back of a wrist between sets, and the prototype
 * draws exactly that difference between Home and the workout screen.
 */
export function HeroBtn(
  props: Omit<Parameters<typeof Btn>[0], 'kind' | 'small' | 'full'>,
) {
  return (
    <Btn
      {...props}
      kind="hero"
      full
      style={[{ height: space.cta }, props.style] as never}
    />
  )
}

/**
 * A chip that is a button — the coach's presets, a check-in answer.
 *
 * Selected is an INK fill, not a tint: ember belongs to the one action on the
 * screen, and a selected chip is a state, not an action.
 */
export function ChipBtn({
  label,
  selected,
  onPress,
}: {
  label: string
  selected?: boolean
  onPress: () => void
}) {
  const [pressed, setPressed] = useState(false)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: selected === true }}
      hitSlop={9}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        tick()
        onPress()
      }}
      style={{
        height: 34,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: selected === true ? palette.ink : palette.card,
        borderWidth: 1,
        borderColor: selected === true ? palette.ink : palette.ringStrong,
        opacity: pressed ? 0.9 : 1,
      }}
    >
      <Txt step="pill" ink={selected === true ? 'onInk' : 'ink'}>
        {label}
      </Txt>
    </Pressable>
  )
}

/** A row of chips that wraps. The gap is the prototype's 10. */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{children}</View>
  )
}
