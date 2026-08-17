import { ScrollView, View, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { palette, radius, space } from '@wazn/domain'

import { Txt } from '@/design/Txt'
import { Card } from './Surface'

/**
 * Every tab screen's shell: the ground, the 18px gutter, the safe areas, and
 * enough bottom padding to clear the tab bar.
 *
 * The bar's height lives in ONE place — `space.tabBar` in the token module —
 * for the reason CLAUDE.md records: the last time this arithmetic was inlined
 * in three components, one of them kept its `+ 64px` after the bar was retired
 * and floated a tab-bar's height of empty space above the screen.
 *
 * `scroll` is opt-out rather than opt-in. A screen that does not scroll on a
 * 390px phone scrolls on a 375px one, and the failure mode is a button nobody
 * can reach.
 */
export function Screen({
  children,
  scroll = true,
  gutter = space.gutter,
  style,
  onTouchStart,
}: {
  /** Optional so a screen can render the ground alone while it waits on the
   *  stored unit or a first read — a blank frame on the right colour, rather
   *  than a figure that corrects itself one frame after paint. */
  children?: React.ReactNode
  scroll?: boolean
  gutter?: number
  style?: ViewStyle
  /**
   * Fires on the first touch anywhere in the screen, BEFORE and independently
   * of whatever the touch actually hit. RN bubbles touches up from the real
   * target, so this observes without intercepting.
   *
   * It exists for the rest canvas: screen 08 vanishes on interaction, and the
   * interaction has to still land where the lifter aimed it. A dismissal
   * driven by the canvas itself would have to swallow the touch to see it,
   * which is the two-tap regression this design exists to avoid.
   */
  onTouchStart?: () => void
}) {
  const insets = useSafeAreaInsets()

  const padding: ViewStyle = {
    paddingHorizontal: gutter,
    paddingTop: insets.top,
    // The tab bar draws its own safe-area inset, so only its chrome height is
    // cleared here. Adding `insets.bottom` again would double it.
    paddingBottom: space.tabBar + 10,
  }

  if (!scroll) {
    return (
      <View
        onTouchStart={onTouchStart}
        style={[{ flex: 1, backgroundColor: palette.ink }, padding, style ?? null]}
      >
        {children}
      </View>
    )
  }

  return (
    <ScrollView
      onTouchStart={onTouchStart}
      style={{ flex: 1, backgroundColor: palette.ink }}
      contentContainerStyle={[padding, style ?? null]}
      keyboardShouldPersistTaps="handled"
      // iOS default is a white flash at the bounce edges on a dark ground.
      indicatorStyle="white"
    >
      {children}
    </ScrollView>
  )
}

/**
 * The day-one empty state.
 *
 * The glyph is the handoff's: a 64px ring with a 26×7 ember bar through it —
 * a plate seen face on with nothing loaded. The copy is NOT invented here.
 * Every string comes from LAUNCH.md verbatim, and the reason that matters is
 * that these six sentences are the entire first impression of the app for
 * somebody with no data, so they were written once, deliberately, rather than
 * per screen by whoever built it.
 */
export function Empty({
  line,
  children,
}: {
  line: string
  /** The one thing to do, when there is one. Not every empty state has one:
   *  Progress's answer is "log a workout", which is not a button that belongs
   *  on Progress. */
  children?: React.ReactNode
}) {
  return (
    <Card style={{ alignItems: 'center', gap: 16, paddingVertical: 28 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          borderWidth: 2,
          borderColor: palette.line2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 26,
            height: 7,
            borderRadius: radius.chip / 2,
            backgroundColor: palette.accent,
          }}
        />
      </View>
      <Txt step="body" ink="muted" style={{ textAlign: 'center' }}>
        {line}
      </Txt>
      {children}
    </Card>
  )
}

/** A stat tile — STREAK / THIS WEEK / SESSIONS. Three across the gutter. */
export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card bare style={{ flex: 1, paddingVertical: 11, paddingHorizontal: 13 }}>
      <Txt step="kick" ink="muted" numberOfLines={1}>
        {label}
      </Txt>
      <Txt step="num" ltr style={{ marginTop: 5 }}>
        {value}
      </Txt>
    </Card>
  )
}
