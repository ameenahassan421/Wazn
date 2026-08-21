import { forwardRef, useRef } from 'react'
import { Pressable, TextInput, View, type TextInputProps } from 'react-native'

import { palette, radius, space } from '@wazn/domain'

import { Txt } from '@/design/Txt'
import { TYPE } from '@/design/type'

/**
 * A text field.
 *
 * ── 16px OR IOS ZOOMS ───────────────────────────────────────────────────────
 * The web app carries a `.field-text` idiom at 16px for exactly one reason:
 * Safari zooms the viewport when a focused input's text is smaller. That is a
 * browser behaviour and does not apply here — but the size is kept anyway,
 * because a 13px input on a phone held at arm's length in a gym is unreadable
 * whatever the platform, and having the two stacks agree is worth more than
 * saving three pixels.
 *
 * ── AUTOFILL IS A FEATURE, NOT A NUISANCE ───────────────────────────────────
 * `autoComplete` and `textContentType` are set on every field. Without them
 * iOS will not offer the keychain, and a password manager that does not fire
 * is the difference between signing in with a thumb and typing 24 characters
 * one-handed.
 */
export const Field = forwardRef<
  TextInput,
  TextInputProps & {
    label: string
    /**
     * Do not DRAW the label above the field.
     *
     * v5's auth screen puts the same words inside as a placeholder instead
     * (`Onboarding.html:35-36`) — a mono kicker over each of two stacked
     * inputs is a lot of chrome for `email` and `password`. The label is still
     * passed, still reaches VoiceOver through `accessibilityLabel`, and is
     * still the thing a test queries by; it just has no pixels.
     */
    hideLabel?: boolean
  }
>(function Field({ label, hideLabel, style, ...rest }, ref) {
  return (
    <View style={{ gap: hideLabel === true ? 0 : 7 }}>
      {hideLabel === true ? null : <Txt step="kick">{label.toUpperCase()}</Txt>}
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={palette.muted}
        // The ground, not a surface. v5 draws inputs as cut-outs with a
        // drawn `line2` border rather than as raised fields — the opposite
        // of the card language, on purpose: you type INTO the page.
        style={[
          {
            height: space.touch,
            paddingHorizontal: 14,
            borderRadius: radius.ctl,
            borderWidth: 1,
            borderColor: palette.ringStrong,
            backgroundColor: palette.paper,
            color: palette.ink,
            fontFamily: TYPE.body.fontFamily,
            fontSize: 16,
          },
          style,
        ]}
        {...rest}
      />
    </View>
  )
})

/**
 * The six-digit code, as six cells.
 *
 * ── ONE HIDDEN INPUT, SIX DRAWN BOXES ───────────────────────────────────────
 * Six real `TextInput`s is the obvious build and it is wrong: it needs
 * focus-juggling on every keystroke, it fights the OS one-time-code autofill
 * (which pastes six characters into one field), and backspace at the start of
 * a cell has no correct behaviour. So there is ONE transparent input holding
 * the whole string, and six Views that draw it.
 *
 * `autoComplete="one-time-code"` is what makes iOS offer the code straight
 * from the notification, which is the entire ergonomic argument for codes
 * over links on a phone.
 */
export function CodeInput({
  value,
  onChange,
  autoFocus,
}: {
  value: string
  onChange: (next: string) => void
  autoFocus?: boolean
}) {
  const input = useRef<TextInput>(null)
  const cells = [0, 1, 2, 3, 4, 5]

  return (
    <Pressable
      accessibilityRole="none"
      onPress={() => input.current?.focus()}
      style={{ flexDirection: 'row', gap: 8 }}
    >
      <TextInput
        ref={input}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        maxLength={6}
        accessibilityLabel="Six-digit code"
        // Covers the cells so a tap anywhere focuses it, and is invisible
        // rather than off-screen: an input positioned outside the viewport
        // makes some Android keyboards scroll to nowhere.
        style={{
          position: 'absolute',
          top: 0,
          start: 0,
          end: 0,
          height: space.otpCell,
          opacity: 0,
          color: 'transparent',
        }}
      />
      {cells.map((i) => {
        const filled = value.length > i
        return (
          <View
            key={i}
            style={{
              flex: 1,
              height: space.otpCell,
              borderRadius: radius.ctl,
              borderWidth: filled ? 1.5 : 1,
              borderColor: filled ? palette.accent : palette.ringStrong,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Txt step="fig" ltr>
              {value[i] ?? ''}
            </Txt>
          </View>
        )
      })}
    </Pressable>
  )
}
