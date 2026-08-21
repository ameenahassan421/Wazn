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
  style,
}: {
  /** Optional so a screen can render the ground alone while it waits on the
   *  stored unit or a first read — a blank frame on the right colour, rather
   *  than a figure that corrects itself one frame after paint. */
  children?: React.ReactNode
  scroll?: boolean
  style?: ViewStyle
}) {
  /*
   * `gutter` and `onTouchStart` were props here until 2026-08-21 and neither
   * could change anything. `gutter` had one call site and it passed the
   * default. `onTouchStart` was documented at length as existing for the rest
   * canvas and passed by none of the sixteen call sites — the canvas's handler
   * was on the session screen's root View instead, where it fired on
   * touch-DOWN and killed every control the canvas owns.
   */
  const gutter = space.gutter
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
        style={[{ flex: 1, backgroundColor: palette.paper }, padding, style ?? null]}
      >
        {children}
      </View>
    )
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.paper }}
      contentContainerStyle={[padding, style ?? null]}
      keyboardShouldPersistTaps="handled"
      /* `black`, which iOS draws as a dark translucent bar. This said `white`
         with a comment about "a dark ground" — true of v5 Momentum and false
         since the ground turned to paper, so the scroll indicator was
         white-on-`#f7f3ec` and invisible on every scrolling screen in the app.
         The same class of miss as the status bar: chrome nobody photographs. */
      indicatorStyle="black"
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
          borderColor: palette.ringStrong,
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
