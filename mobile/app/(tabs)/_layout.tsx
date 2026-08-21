import { Pressable, View } from 'react-native'
import { Tabs } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { palette, space } from '@wazn/domain'

import { Txt } from '@/design/Txt'
import { TABS, TAB_KEY, TabGlyph, type TabKey } from '@/components/ui/TabGlyph'
import { useLocale } from '@/hooks/use-locale'
import { tick } from '@/services/haptics'

/**
 * The six-tab bar.
 *
 * ── WHY A CUSTOM BAR AND NOT `tabBarIcon` ───────────────────────────────────
 * The live rail. v5 puts a 2px ember segment ON the bar's top edge for the
 * current tab, running 20%–80% of the column. React Navigation's built-in bar
 * has no slot for that — an indicator drawn inside the icon area shifts the
 * glyphs by two pixels on every navigation, which at six tabs is a visible
 * twitch. Owning the bar is cheaper than fighting it, and this is the app's
 * own chrome anyway.
 *
 * ── SIX TARGETS ─────────────────────────────────────────────────────────────
 * 65px each on a 390px screen, above the 48px floor. Height is 58 and the
 * labels are mono 9 — the meta voice, because a tab label is a stamped name
 * for a place rather than a spoken word.
 *
 * The bar recedes: `#0b0906` is the only surface in the app darker than the
 * ground, so the chrome sits BELOW the content rather than lifting off it.
 */
/**
 * The props a custom tab bar receives, taken from `Tabs`' own `tabBar` prop.
 *
 * Not imported as `BottomTabBarProps`: Expo Router 57 vendors react-navigation's
 * bottom tabs rather than depending on the published package, so the name is
 * only reachable through an internal build path. Deriving it from the public
 * surface means a signature change is a type error here rather than an import
 * that silently resolves to nothing.
 */
type TabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>
>[0]

function WaznTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets()
  const { t } = useLocale()

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: palette.tabbar,
        borderTopWidth: 1,
        borderTopColor: palette.line,
        // 58px of chrome plus whatever the phone reserves below it. Without
        // the inset the home indicator sits on top of the labels.
        paddingBottom: insets.bottom,
      }}
    >
      {state.routes.map((route, index) => {
        const tab = route.name as TabKey
        if (!TABS.includes(tab)) return null
        const on = state.index === index

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t(TAB_KEY[tab])}
            onPress={() => {
              if (!on) tick()
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              })
              if (!on && !event.defaultPrevented) navigation.navigate(route.name)
            }}
            // Static, not `({ pressed }) => ...`: NativeWind's cssInterop on
            // Pressable drops a function `style` entirely, which renders this as
            // an unstyled box. See the long note in `Btn.tsx`. The press dim is
            // gone with it rather than reintroduced through state — this is
            // chrome, the haptic already fires, and it never actually worked.
            style={{
              flex: 1,
              height: space.tabBar,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
            }}
          >
            {/* The live rail. Absolute, so it costs the column no height and
                the glyphs cannot shift by two pixels on navigation. */}
            <View
              style={{
                position: 'absolute',
                top: 0,
                start: '20%',
                end: '20%',
                height: 2,
                backgroundColor: on ? palette.accent : 'transparent',
              }}
            />
            <View style={{ height: 14, justifyContent: 'center', marginTop: 3 }}>
              <TabGlyph tab={tab} on={on} />
            </View>
            <Txt step="nano" ink={on ? 'accentSoft' : 'faint'}>
              {t(TAB_KEY[tab])}
            </Txt>
          </Pressable>
        )
      })}
    </View>
  )
}

export default function TabsLayout() {
  const { t } = useLocale()

  return (
    <Tabs
      tabBar={(props) => <WaznTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: palette.ink },
      }}
    >
      {TABS.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ title: t(TAB_KEY[name]) }} />
      ))}
    </Tabs>
  )
}
