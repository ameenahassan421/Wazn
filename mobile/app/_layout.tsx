import { useEffect } from 'react'
import { View } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { HankenGrotesk_500Medium } from '@expo-google-fonts/hanken-grotesk/500Medium'
import { HankenGrotesk_600SemiBold } from '@expo-google-fonts/hanken-grotesk/600SemiBold'
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono/500Medium'
import { Sora_600SemiBold } from '@expo-google-fonts/sora/600SemiBold'
import { Sora_700Bold } from '@expo-google-fonts/sora/700Bold'
import { Sora_800ExtraBold } from '@expo-google-fonts/sora/800ExtraBold'

import { palette } from '@wazn/domain'

import { REQUIRED_FONTS } from '@/design/type'
import { Txt } from '@/design/Txt'
import { useAuth } from '@/hooks/use-auth'
import { LocaleProvider } from '@/hooks/use-locale'
import { UnitProvider } from '@/hooks/use-unit'
import { supabaseConfigError } from '@/services/supabase'
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
  Sora_600SemiBold,
  Sora_700Bold,
  Sora_800ExtraBold,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
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
  const { loading, userId } = useAuth()

  /**
   * Nothing is shown until BOTH the faces are registered and the keychain has
   * answered. Two reasons, and neither is cosmetic:
   *
   * Fonts, because v5 is sized against a condensed face and a frame measured
   * against the system sans is wrong in a way that looks plausible.
   *
   * Auth, because "not signed in yet" and "not signed in" are different
   * answers. Treating the first as the second bounces every returning lifter
   * to the sign-in screen and straight back, which reads as being logged out.
   */
  const held = (!ready && !error) || loading

  useEffect(() => {
    // Hide on font failure too. A missing font is a degraded app; a splash
    // screen that never goes away is a broken one, and the fallback still
    // logs sets. The auth read is bounded by the keychain, not the network,
    // so it cannot hang the way a fetch could.
    if (!held) void SplashScreen.hideAsync()
  }, [held])

  if (held) return null

  /**
   * A build with no Supabase configuration says so, rather than showing a
   * sign-in screen where every attempt fails for a reason the user cannot
   * see. Same posture as the web app's `supabaseConfigError`.
   */
  if (supabaseConfigError !== null) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: palette.paper,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Txt step="body" ink="accentSoft" style={{ textAlign: 'center' }}>
          {supabaseConfigError}
        </Txt>
      </View>
    )
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.paper }}>
      <SafeAreaProvider>
        {/* Locale outside unit: `t` is chrome for every screen including the
            ones that never render a weight, and the unit provider has no
            opinion about language. */}
        <LocaleProvider>
          <UnitProvider>
            {/* The ground is painted here as well as on every screen. A route
                transition briefly shows whatever is behind the stack, and the
                platform default behind it is white. */}
            <View style={{ flex: 1, backgroundColor: palette.paper }}>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: palette.paper },
                  animation: 'fade',
                  animationDuration: 160,
                }}
              >
                {/* Declarative, not an effect that redirects after render.
                    The effect-based guard every tutorial shows has a real race:
                    the protected screen mounts, its data hooks fire against a
                    session that is not there, and the redirect lands a frame
                    later — so a signed-out launch flashes an empty Log screen
                    and fires a doomed Supabase read on the way past. */}
                <Stack.Protected guard={userId !== null}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen
                    name="session/[id]"
                    options={{
                      // Slides up over the tab bar and covers it. A live
                      // workout is not a tab — leaving it is a decision, not a
                      // swipe.
                      presentation: 'fullScreenModal',
                      animation: 'slide_from_bottom',
                      gestureEnabled: false,
                    }}
                  />
                  <Stack.Screen
                    name="settings"
                    options={{ animation: 'slide_from_right' }}
                  />
                </Stack.Protected>

                {/* Signed out. `join/[code]` is deliberately OUTSIDE the guard:
                    an invite link is how somebody arrives before they have an
                    account, and bouncing them to a bare sign-in screen loses
                    the code and the reason they tapped. */}
                <Stack.Protected guard={userId === null}>
                  <Stack.Screen name="sign-in" />
                </Stack.Protected>

                <Stack.Screen name="join/[code]" />
              </Stack>
            </View>
          </UnitProvider>
        </LocaleProvider>
      </SafeAreaProvider>
      <StatusBar style="light" />
    </GestureHandlerRootView>
  )
}
