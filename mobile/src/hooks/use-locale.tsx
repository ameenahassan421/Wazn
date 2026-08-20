import { createContext, use, useCallback, useEffect, useState } from 'react'
import { I18nManager } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getLocales } from 'expo-localization'

import { resolveInitialLocale, t as translate, type Locale } from '@wazn/domain'

/**
 * Which language the app is READ in.
 *
 * ── THERE IS ONLY ONE CATALOGUE, AND IT IS NOT IN THIS PACKAGE ──────────────
 * `src/lib/i18n.ts` holds all 785 keys in both locales and is already reached
 * through `@wazn/domain`. It takes plain strings and touches no browser
 * global, so the native app needs an ADAPTER, not a second catalogue: this
 * file supplies the two things the web provider gets from the DOM (the device
 * language, and somewhere to keep the choice) and nothing else. A native copy
 * of the strings would drift within a week, and half of them would drift
 * silently because English renders fine in both.
 *
 * The contract matches `src/lib/locale-context.tsx` deliberately, down to the
 * `t` shorthand and the English fallback outside the provider. Two providers
 * with two different `useLocale()` shapes is how a screen ends up written
 * twice.
 *
 * ── WHY ASYNCSTORAGE AND NOT SECURESTORE ────────────────────────────────────
 * Same answer as `use-unit`: a display preference is not a secret, and a
 * keychain round trip is not free. The auth session is the only thing here
 * that earns one.
 *
 * ── WHAT THIS DOES NOT YET DO ───────────────────────────────────────────────
 * Server sync. The web provider reads `get_user_preferences` and writes
 * `upsert_user_preference`, so a locale set on the phone will not follow the
 * lifter to the browser until this does the same. See `applyDirection` below
 * for the other honest gap.
 */

const KEY = 'wazn.locale'

/**
 * The device's first preferred language tag.
 *
 * `resolveInitialLocale` was written against `navigator.language` and splits
 * on the region separator itself, so a BCP 47 tag is exactly the shape it
 * wants: `ar-SA` resolves the same way `ar` does. Passing `languageTag`
 * rather than `languageCode` also avoids the latter's `null`.
 */
function deviceLanguage(): string {
  return getLocales()[0]?.languageTag ?? 'en'
}

/**
 * Tell React Native which way the layout runs.
 *
 * ── THIS DOES NOT FLIP A RUNNING APP, AND PRETENDING OTHERWISE IS THE TRAP ──
 * `forceRTL` writes a native flag that the view system reads when it BUILDS a
 * layout. Views already mounted keep the direction they were created with, so
 * the mirror is only complete after the bundle reloads: a fast refresh in
 * development, the next cold launch in a store build. Nothing here restarts
 * the app to hide that, because a preference toggle that kills the process is
 * worse than one that takes effect next launch, and this app does not depend
 * on `expo-updates` just to own a reload.
 *
 * `allowRTL` has to come first. `forceRTL(true)` is ignored while RTL is
 * disallowed, which is the default in a bundle built from an LTR project, and
 * the failure mode is a flag that reads as set and does nothing.
 */
function applyDirection(locale: Locale) {
  const rtl = locale === 'ar'
  if (I18nManager.isRTL === rtl) return
  I18nManager.allowRTL(rtl)
  I18nManager.forceRTL(rtl)
}

type LocaleContext = {
  locale: Locale
  setLocale: (next: Locale) => void
  /** Shorthand: `t(locale, key, params)` bound to the current locale. */
  t: (key: string, params?: Record<string, string>) => string
  /** False until the stored preference has been read. Nothing blocks on it
   *  today, unlike `useUnit`'s: a line of English for one frame is a smaller
   *  cost than a blank screen, where a weight that corrects itself is not. */
  ready: boolean
}

/**
 * The default falls back to ENGLISH, not to the key.
 *
 * A component rendered outside the provider has to show real copy. `entry.back`
 * on screen is gibberish in production and it is also what every isolated
 * component test would assert against, which makes the assertions worthless.
 */
const Ctx = createContext<LocaleContext>({
  locale: 'en',
  setLocale: () => {},
  t: (key, params) => translate('en', key, params),
  ready: false,
})

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  // Resolved lazily from the device, then corrected by the stored choice one
  // tick later. An Arabic phone therefore paints Arabic on the first frame
  // rather than flashing English at it.
  const [locale, setLocaleState] = useState<Locale>(() =>
    resolveInitialLocale(null, deviceLanguage()),
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let live = true
    void AsyncStorage.getItem(KEY)
      .then((stored) => {
        if (!live) return
        setLocaleState(resolveInitialLocale(stored, deviceLanguage()))
        setReady(true)
      })
      .catch(() => {
        // An unreadable preference is not a reason to hold the app. The
        // device default is a real answer, and the next write repairs it.
        if (live) setReady(true)
      })
    return () => {
      live = false
    }
  }, [])

  // One effect rather than a call at each site that changes the locale. The
  // device default is a locale nobody set, and a failed storage read still
  // leaves one on screen: driving the flag off the value covers both, where
  // three call sites would each have to remember.
  useEffect(() => {
    applyDirection(locale)
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    // State first, storage after, same as the unit toggle: the switch has to
    // feel instant, and a failed write costs a preference rather than a set.
    setLocaleState(next)
    void AsyncStorage.setItem(KEY, next).catch(() => {})
  }, [])

  const t = useCallback(
    (key: string, params?: Record<string, string>) => translate(locale, key, params),
    [locale],
  )

  return <Ctx value={{ locale, setLocale, t, ready }}>{children}</Ctx>
}

export function useLocale(): LocaleContext {
  return use(Ctx)
}
