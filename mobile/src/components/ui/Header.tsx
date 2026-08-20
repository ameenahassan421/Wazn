import { Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'

import { palette, radius } from '@wazn/domain'

import { Txt } from '@/design/Txt'
import { Wordmark } from '@/components/ui/Wordmark'

/**
 * The wordmark and the avatar. 56px tall, and on every signed-in screen.
 *
 * ── THE MARK ────────────────────────────────────────────────────────────────
 * Lowercase `w a zn` with the `a` in ember, set in Saira 700 at 21. It lives
 * in `Wordmark` rather than here: this header rendered it with `step="num"`,
 * the FIGURES step, which is weight 600 and tabular. Close enough to look
 * right and not the mark. See that file.
 *
 * ── THE AVATAR IS THE DOOR TO SETTINGS ──────────────────────────────────────
 * Deliberately, and it is the only door: Settings is the rarest screen in the
 * app by design and the avatar is where a person looks for it. It gets no tab
 * for the same reason.
 */
export function Header({
  name,
  right,
}: {
  /** The signed-in username, for the monogram. Null before it has loaded — a
   *  dash, not a guess, and never the previous account's initial. */
  name?: string | null
  right?: React.ReactNode
}) {
  const router = useRouter()
  const initial = name != null && name.length > 0 ? name[0].toUpperCase() : '—'

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        height: 56,
      }}
    >
      <Wordmark />
      <View style={{ flex: 1 }} />
      {right}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="You, settings"
        hitSlop={7}
        onPress={() => router.push('/settings')}
        style={({ pressed }) => ({
          width: 34,
          height: 34,
          borderRadius: radius.pill,
          backgroundColor: palette.raised,
          borderWidth: 1,
          borderColor: palette.line,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.82 : 1,
        })}
      >
        <Txt step="label" ink="text">
          {initial}
        </Txt>
      </Pressable>
    </View>
  )
}
