import { createContext, use, useCallback, useEffect, useRef, useState } from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { type Scheme, type ThemeChoice, palettes } from '@wazn/domain'

import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/services/supabase'

/**
 * Which ground the app is drawn on.
 *
 * ── THREE CHOICES, TWO GROUNDS ──────────────────────────────────────────────
 * `system` is the default and follows the OS, which is what almost everybody
 * wants and the only option that changes with the time of day on iOS. `light`
 * and `dark` are the overrides for the people who want one regardless.
 *
 * The distinction matters in storage: persisting the resolved SCHEME would
 * turn "follow the system" into whatever the system happened to be at the
 * moment of the write, and the setting would silently stop following anything.
 * So the CHOICE is stored and the scheme is derived on every render.
 *
 * ── SAME THREE WRITERS AND THE SAME RANKING AS `use-unit` ───────────────────
 * The account is read on a phone and in a browser, so the preference has to
 * survive the trip:
 *
 *   1. the lifter tapping the control  (always wins)
 *   2. the server row                  (wins over the cache)
 *   3. the AsyncStorage cache          (renders first, yields to both)
 *
 * Enforced with refs rather than by ordering awaits, because the network is
 * not orderable: a slow `get_user_preferences` landing after somebody has
 * pressed Dark must not drag them back to Light.
 *
 * ── NO `ready` FLAG, UNLIKE `use-unit` ──────────────────────────────────────
 * That provider gates rendering because a figure that flips from 225 to 102
 * one frame after paint is a lie about a weight. A ground that resolves from
 * system-light to stored-dark on the second frame is a flash, which is worse
 * to look at and true the whole time. Holding the whole app on a disk read to
 * avoid it would cost every launch, so this renders immediately on the system
 * scheme and corrects.
 */

const KEY = 'wazn.theme'
const DEFAULT: ThemeChoice = 'system'

function asChoice(value: string | null | undefined): ThemeChoice | null {
  return value === 'system' || value === 'light' || value === 'dark' ? value : null
}

type ThemeContext = {
  /** The active palette. Every colour in the app comes from here. */
  palette: (typeof palettes)[Scheme]
  /** What is actually being drawn, after `system` is resolved. */
  scheme: Scheme
  /** What the lifter picked, which may be `system`. */
  choice: ThemeChoice
  setChoice: (next: ThemeChoice) => void
}

const Ctx = createContext<ThemeContext>({
  palette: palettes.light,
  scheme: 'light',
  choice: DEFAULT,
  setChoice: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth()
  const system = useColorScheme()
  const [choice, setChoiceState] = useState<ThemeChoice>(DEFAULT)

  const userChose = useRef(false)
  const serverAnswered = useRef(false)

  useEffect(() => {
    let live = true
    void AsyncStorage.getItem(KEY)
      .then((stored) => {
        if (!live) return
        if (userChose.current || serverAnswered.current) return
        const parsed = asChoice(stored)
        if (parsed !== null) setChoiceState(parsed)
      })
      .catch(() => {
        // An unreadable preference is not a reason to hold the app. `system`
        // is a real answer and the next write repairs the store.
      })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (userId === null) return
    let live = true
    // A different account answers for itself.
    userChose.current = false
    serverAnswered.current = false

    void Promise.resolve(supabase.rpc('get_user_preferences'))
      .then(({ data, error }) => {
        if (!live || error !== null || data === null) return
        if (userChose.current) return
        const parsed = asChoice((data as { theme?: string }).theme)
        if (parsed === null) return
        serverAnswered.current = true
        setChoiceState(parsed)
        void AsyncStorage.setItem(KEY, parsed).catch(() => {})
      })
      .catch(() => {
        // Signed out mid-flight, offline, or no row yet. The cache stays
        // authoritative and the next launch tries again.
      })
    return () => {
      live = false
    }
  }, [userId])

  const setChoice = useCallback((next: ThemeChoice) => {
    // Marked before any no-op check: pressing the live segment is still the
    // lifter saying what they want, and it outranks a server read in flight.
    userChose.current = true
    setChoiceState(next)
    void AsyncStorage.setItem(KEY, next).catch(() => {})
    /*
     * Fire and forget, and the failure is deliberately silent HERE.
     *
     * Unlike the weekly target on Crew, a theme that fails to reach the server
     * is already correct on this device and correct in the cache: the only
     * cost is that a browser will not agree until the next successful write.
     * Reverting the ground under somebody who just tapped Dark, to report a
     * sync problem they cannot act on, would be worse than the disagreement.
     */
    void Promise.resolve(
      supabase.rpc('upsert_user_preference', { p_column: 'theme', p_value: next }),
    ).catch(() => {})
  }, [])

  /*
   * Derived every render, never stored.
   *
   * Anything that is not exactly `'dark'` resolves to light. `useColorScheme`
   * can return null before the OS answers AND the literal string
   * `'unspecified'`, so a `?? 'light'` fallback compiles and still lets
   * `'unspecified'` through as a scheme that has no palette. Matching on
   * `'dark'` is the only form that cannot leak a third value.
   *
   * Light is the fallback rather than a held render, because holding is a
   * blank frame and this app opens on the logging path.
   */
  const scheme: Scheme =
    choice === 'system' ? (system === 'dark' ? 'dark' : 'light') : choice

  return (
    <Ctx
      value={{
        palette: palettes[scheme],
        scheme,
        choice,
        setChoice,
      }}
    >
      {children}
    </Ctx>
  )
}

export function useTheme(): ThemeContext {
  return use(Ctx)
}

/**
 * The palette alone, which is what almost every caller wants.
 *
 * A separate hook rather than destructuring at 28 call sites: it keeps the
 * conversion from `import { palette }` to a hook a one-line change per file,
 * and it reads the same as the import it replaces.
 */
export function usePalette(): (typeof palettes)[Scheme] {
  return use(Ctx).palette
}
