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
}: {
  /** The signed-in username, for the monogram. Null before it has loaded — a
   *  dash, not a guess, and never the previous account's initial. */
  name?: string | null
}) {
  const router = useRouter()
  const initial = name != null && name.length > 0 ? name[0].toUpperCase() : '—'

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingTop: 10,
        paddingBottom: 4,
      }}
    >
      <Wordmark size={26} />
      <View style={{ flex: 1 }} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="You, settings"
        hitSlop={7}
        onPress={() => router.push('/settings')}
        // A static object, not `({ pressed }) => ...`. The callback form is
        // banned by `eslint.config.js` — it was silently dropped by
        // NativeWind's cssInterop and rendered every button in the app
        // unstyled. NativeWind is gone, so it would work again; the rule and
        // this pattern stay as a tripwire. See `Btn.tsx`.
        //
        // No press dim, deliberately: this is chrome, the haptic already
        // fires, and 38px of ink dimming under a thumb is the kind of motion
        // that draws the eye to the least important control on the screen.
        style={{
          width: 38,
          height: 38,
          borderRadius: radius.pill,
          backgroundColor: palette.ink,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Sora 700 at 14 on ink, per the prototype's header. */}
        <Txt step="pill" ink="onInk">
          {initial}
        </Txt>
      </Pressable>
    </View>
  )
}
