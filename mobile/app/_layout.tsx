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
import { restoreWorkout } from '@/state/live-workout'
import { CoachProvider } from '@/hooks/use-coach'
import { LocaleProvider } from '@/hooks/use-locale'
import { UnitProvider } from '@/hooks/use-unit'
import { supabaseConfigError } from '@/services/supabase'

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

/**
 * Auth is OFF, and the app opens straight into the tabs.
 *
 * Ameen, 2026-08-20: "take out the sign in and sign out functionality for now,
 * that can be the last thing we do." Nothing is deleted — `sign-in.tsx`,
 * `services/auth.ts`, `use-auth.ts` and the Edge Function all stay exactly as
 * they are, and flipping this back to `true` restores the gate. Auth is the
 * screen a lifter sees once and the prototype does not cover it, so it is the
 * last thing worth building, not the first.
 *
 * ── WHAT THIS UNBLOCKS, WHICH IS THE REAL REASON IT IS WORTH DOING NOW ──────
 * Every tab sat behind `Stack.Protected`, so a session that cannot type
 * credentials could not SEE nine of the app's ten screens — not on the
 * simulator, not in the web export. WAZN_PLAN §6 calls that the biggest hole
 * in how a screen gets verified, and it is why every button in this app could
 * render invisible through four green checks: the one screen anybody could
 * look at was the sign-in screen.
 *
 * ── AND BACK ON, 2026-08-21, FOR THE REASON THE PARAGRAPH BELOW PREDICTED ───
 * Ameen: "import my workout history so you can actually interact with real
 * data. it will help you with coach and enable you to find more bugs." There
 * was nothing to import — 149 workouts and 3,197 sets have been in production
 * since the Hevy seed — so the only thing standing between this app and nine
 * months of real training was this constant.
 *
 * ── WHAT IT DOES NOT GIVE YOU ON ITS OWN ────────────────────────────────────
 * Data. Every read is RLS-scoped to `auth.uid()`, so the gate is necessary and
 * not sufficient: somebody has to actually sign in. With no session the
 * screens render their EMPTY states, not populated ones. That is worth having
 * — day-one copy is a real surface and LAUNCH.md specifies it — but a screen
 * built only against zero rows is half-checked, and every native screen in
 * this app was built exactly that way.
 */
export const AUTH_ENABLED = true

export default function RootLayout() {
  const [ready, error] = useFonts(FACES)
  const { loading, userId } = useAuth()

  /**
   * Bring back a workout the OS killed, once, at launch.
   *
   * Here rather than in the session screen because the checkpoint has to be
   * read whether or not that route is the one being opened: a lifter whose app
   * was killed mid-set reopens to Home, and the sets they logged have to be on
   * the phone and draining before they touch anything.
   *
   * `restoreWorkout` no-ops when a workout is already active, so a fast refresh
   * in development cannot clobber a live board with a stale checkpoint.
   *
   * ── WHAT THIS DOES NOT DO YET ─────────────────────────────────────────────
   * It restores the DATA, not the route. A restored workout is in the store and
   * its unsent sets are on their way, but nothing navigates the lifter back to
   * the board or offers to. That is a resume affordance on Home and it belongs
   * with Home's next pass, not smuggled in here.
   */
  useEffect(() => {
    void restoreWorkout()
  }, [])

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
            {/* Inside the unit provider because the coach reasons in weights
                and the dial has no opinion about language or units. */}
            <CoachProvider>
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
                  <Stack.Protected guard={!AUTH_ENABLED || userId !== null}>
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
                    {/* The picker. A sheet, not a full-screen takeover: it is a
                      detour from the board rather than a place, and the swipe
                      down is the cancel a lifter reaches for first. */}
                    <Stack.Screen
                      name="session/add"
                      options={{
                        presentation: 'modal',
                        animation: 'slide_from_bottom',
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
                  <Stack.Protected guard={AUTH_ENABLED && userId === null}>
                    <Stack.Screen name="sign-in" />
                  </Stack.Protected>

                  <Stack.Screen name="join/[code]" />
                </Stack>
              </View>
            </CoachProvider>
          </UnitProvider>
        </LocaleProvider>
      </SafeAreaProvider>
      {/* `dark`, not `light`, and this was wrong from the day the ground turned
          to paper. `style` sets the colour of the system glyphs, and `light`
          means near-white — which on `#f7f3ec` is about 1.05:1, so the clock,
          the battery and the signal bars were effectively invisible on all ten
          screens. It survived every screenshot taken during the prototype
          port, because a status bar is the one part of a screenshot nobody
          looks at.

          It is set once, here, and governs every route: no `Stack.Screen`
          overrides `statusBarStyle`. The one surface that genuinely wants
          light glyphs is the rest canvas, and that is an ink overlay drawn on
          top rather than a screen ground — it sets its own. */}
      <StatusBar style="dark" />
    </GestureHandlerRootView>
  )
}
