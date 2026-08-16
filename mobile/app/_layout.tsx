import { useEffect } from 'react'
import { View } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { HankenGrotesk_400Regular } from '@expo-google-fonts/hanken-grotesk/400Regular'
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono/500Medium'
import { SairaSemiCondensed_600SemiBold } from '@expo-google-fonts/saira-semi-condensed/600SemiBold'
import { SairaSemiCondensed_700Bold } from '@expo-google-fonts/saira-semi-condensed/700Bold'

import { palette } from '@wazn/domain'

import { REQUIRED_FONTS } from '@/design/type'
import { UnitProvider } from '@/hooks/use-unit'
import '../global.css'

/**
 * The root.
 *
 * ── FONTS ARE A BLOCKING DEPENDENCY HERE, AND THAT IS DELIBERATE ────────────
 * The web app loads its faces with `font-display: swap` so a slow network
 * never blocks the logging path. Native has no such tradeoff: the .ttf files
 * are inside the app bundle, so "loading" is a disk read of a few milliseconds
 * and there is no network to be slow. Holding the splash screen until they are
 * registered is therefore free, and it buys the thing swap costs — no frame
 * where the ramp is measured against the system sans.
 *
 * That matters more here than it would in most apps: v5 is sized against a
 * CONDENSED face. Falling back to a normal-width sans does not merely look
 * wrong, it makes every measurement taken against it wrong while looking
 * entirely plausible.
 *
 * Only the four cuts the ramp actually uses are imported, by subpath. The
 * package root re-exports nine weights of each family and importing it would
 * put roughly 2 MB of unused Thin and Black into the bundle.
 */

void SplashScreen.preventAutoHideAsync()

const FACES = {
  SairaSemiCondensed_600SemiBold,
  SairaSemiCondensed_700Bold,
  HankenGrotesk_400Regular,
  IBMPlexMono_500Medium,
}

/**
 * The ramp names its cuts as strings; this file loads them as modules. A typo
 * on either side produces the system sans at the right size — plausible, and
 * wrong in a way no screenshot catches. So the two lists are compared at
 * startup, in development, where a mismatch is loud.
 */
if (__DEV__) {
  const missing = REQUIRED_FONTS.filter((name) => !(name in FACES))
  if (missing.length > 0) {
    throw new Error(
      `design/type.ts asks for ${missing.join(', ')}, which app/_layout.tsx does not load.`,
    )
  }
}

export default function RootLayout() {
  const [ready, error] = useFonts(FACES)

  useEffect(() => {
    // Hide on failure too. A missing font is a degraded app; a splash screen
    // that never goes away is a broken one, and the fallback still logs sets.
    if (ready || error) void SplashScreen.hideAsync()
  }, [ready, error])

  if (!ready && !error) return null

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.ink }}>
      <SafeAreaProvider>
        <UnitProvider>
          {/* The ground is painted here as well as on every screen. A route
              transition briefly shows whatever is behind the stack, and the
              platform default behind it is white. */}
          <View style={{ flex: 1, backgroundColor: palette.ink }}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: palette.ink },
                animation: 'fade',
                animationDuration: 160,
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="session/[id]"
                options={{
                  // Slides up over the tab bar and covers it. A live workout
                  // is not a tab — leaving it is a decision, not a swipe.
                  presentation: 'fullScreenModal',
                  animation: 'slide_from_bottom',
                  gestureEnabled: false,
                }}
              />
              <Stack.Screen
                name="settings"
                options={{ animation: 'slide_from_right' }}
              />
            </Stack>
          </View>
        </UnitProvider>
      </SafeAreaProvider>
      <StatusBar style="light" />
    </GestureHandlerRootView>
  )
}
