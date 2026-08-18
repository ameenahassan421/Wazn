import { Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { palette, space } from '@wazn/domain'

import { Txt } from '@/design/Txt'
import { banked } from '@/services/haptics'

/**
 * BANK IT — the commit bar.
 *
 * ── ONE TAP, AND THE LABEL IS THE RECEIPT ───────────────────────────────────
 * The label carries the values live: `BANK IT · 125 × 8`. That is not
 * decoration — it is the only confirmation the flow has. There is no "are you
 * sure", because a set logged wrong costs one undo and a dialog costs every
 * set thereafter.
 *
 * GATE U2 is the constraint this component exists under: a repeat set is one
 * press. So it fires straight through — no sheet, no toast, no navigation.
 *
 * ── FULL BLEED, ZERO RADIUS ─────────────────────────────────────────────────
 * 70px against the bottom edge with square corners. A rounded, inset button
 * reads as one of several choices; a bar spanning the whole edge reads as THE
 * action, and it is the easiest thing on the screen to hit without looking.
 */
export function CommitBar({
  label,
  onCommit,
  disabled,
}: {
  label: string
  onCommit: () => void
  disabled?: boolean
}) {
  const insets = useSafeAreaInsets()

  return (
    <View
      style={{
        position: 'absolute',
        start: 0,
        end: 0,
        bottom: 0,
        backgroundColor: palette.ink,
        paddingBottom: insets.bottom,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={() => {
          // The haptic fires BEFORE the state change. It confirms the press
          // landed, and a lifter mid-set feels it before they can look —
          // which is the whole argument for building this native.
          banked()
          onCommit()
        }}
        style={({ pressed }) => ({
          height: space.commitBar,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.accent,
          opacity: disabled === true ? 0.45 : pressed ? 0.82 : 1,
        })}
      >
        <Txt step="title" ink="accentInk" ltr>
          {label}
        </Txt>
      </Pressable>
    </View>
  )
}
