import { useState, type ReactNode } from 'react'
import { Pressable, View, type ViewStyle } from 'react-native'

import { palette, radius, space } from '@wazn/domain'

import { Txt } from '@/design/Txt'
import { tick } from '@/services/haptics'

/**
 * The four button kinds the handoff draws, and nothing else.
 *
 * ── PRESS FEEDBACK, AND WHY IT IS NOT `style={({pressed}) => ...}` ──────────
 * `opacity` on press rather than a background swap. A background swap needs a
 * second colour per kind — four more tokens the design never named — and on a
 * near-black ground a 0.82 dim reads as the same physical press.
 *
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
 * `android_ripple` is deliberately absent. The ripple is Material's answer and
 * this is not a Material app; more to the point it renders in the platform
 * accent, which would put a fifth colour on screen.
 *
 * ── THE 48px FLOOR ──────────────────────────────────────────────────────────
 * `hitSlop` brings a `small` button (40px) up to the touch floor without
 * making it look 48 tall. That is the honest way to satisfy §2.4: the target
 * is 48, the ink is 40.
 */

export type BtnKind =
  /** THE action on a screen. Ember fill, one per view. */
  | 'hero'
  /** A real alternative. Outline, drawn in `line2`. */
  | 'line'
  /** A way out — dismiss, later, skip. No box at all. */
  | 'ghost'
  /** The inverse: text-coloured fill, ink-coloured label. Sign in, verify. */
  | 'ink'

const KINDS: Record<
  BtnKind,
  { bg: string; ink: Parameters<typeof Txt>[0]['ink']; border?: string }
> = {
  hero: { bg: palette.accent, ink: 'accentInk' },
  line: { bg: 'transparent', ink: 'text', border: palette.line2 },
  ghost: { bg: 'transparent', ink: 'muted' },
  ink: { bg: palette.text, ink: 'ink' },
}

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
   * A glyph before the label, at the base row gap of 8. Exactly one button in
   * v5 has one — the Google disc on screen 01 (`Onboarding.html:27`) — so this
   * is a slot rather than an icon system.
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
          borderRadius: radius.ctl,
          paddingHorizontal: small === true ? 14 : 20,
          flexDirection: 'row',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: k.bg,
          alignSelf: full === true ? 'stretch' : 'flex-start',
          // 45%, which is the opacity the handoff gives every disabled
          // control it draws (VERIFY before six digits, FINISH IMPORT before
          // the import completes).
          opacity: disabled === true ? 0.45 : pressed ? 0.82 : 1,
        },
        k.border !== undefined ? { borderWidth: 1, borderColor: k.border } : null,
        style ?? null,
      ]}
    >
      {leading}
      <Txt step="title" ink={k.ink}>
        {label}
      </Txt>
    </Pressable>
  )
}

/**
 * The hero CTA at its own height.
 *
 * 56px, not the 52 every other button gets — `START THE HUNT` and `Continue
 * with Google` are both drawn taller than the buttons around them, and the
 * extra four pixels are the whole of how the design says "this one".
 */
export function HeroBtn(
  props: Omit<Parameters<typeof Btn>[0], 'kind' | 'small' | 'full'>,
) {
  return (
    <Btn {...props} kind="hero" full style={[{ height: 56 }, props.style] as never} />
  )
}

/**
 * A chip that is a button — the check-in row's Fresh/Normal/Drained, the
 * Tell-the-coach presets, the preset questions on Coach.
 *
 * Selected is a TEXT FILL, not a tint: the handoff's check-in chips invert to
 * `text` on selection rather than taking an ember wash, which keeps ember for
 * the one action on the screen.
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
        height: 30,
        paddingHorizontal: 12,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: selected === true ? palette.text : 'transparent',
        borderWidth: 1,
        borderColor: selected === true ? palette.text : palette.line2,
        opacity: pressed ? 0.82 : 1,
      }}
    >
      <Txt step="label" ink={selected === true ? 'ink' : 'muted'}>
        {label}
      </Txt>
    </Pressable>
  )
}

/** A row of chips that wraps. The gap is the handoff's 8. */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
  )
}
