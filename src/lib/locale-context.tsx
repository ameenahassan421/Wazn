import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { supabase } from './supabase'
import type { Locale } from './i18n'
import { resolveInitialLocale, t } from './i18n'

const STORAGE_KEY = 'workout.locale'

interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  /** Shorthand: `t(locale, key, params)` bound to the current locale. */
  t: (key: string, params?: Record<string, string>) => string
}

/**
 * The default falls back to ENGLISH, not to the key.
 *
 * A component rendered outside the provider should show real copy, not
 * `entry.back` — that is gibberish in production and it broke 26 component
 * tests that render a component on its own. Detection of a missing provider
 * lives in the tests that assert a locale SWITCH (see Header.test.tsx), which
 * only passes when a real provider is above the component.
 */
const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: (key, params) => t('en', key, params),
})

function readStoredLocale(): Locale | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'en' || v === 'ar' ? v : null
  } catch {
    return null
  }
}

function writeStoredLocale(locale: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // Private browsing with storage blocked: the toggle still works for the
    // session, it just does not persist.
  }
}

function setDocumentDirection(locale: Locale) {
  const el = document.documentElement
  el.setAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr')
  el.setAttribute('lang', locale === 'ar' ? 'ar' : 'en')
}

export function LocaleProvider({
  children,
  userId,
}: {
  children: ReactNode
  userId?: string | null
}) {
  // localStorage is the optimistic cache so the locale flips instantly; the
  // server is the source of truth once we hear from it. Resolved lazily, like
  // UnitProvider: an eager call would re-read localStorage and navigator on
  // every render to compute a value only the first render can use.
  const [locale, setLocaleState] = useState<Locale>(() =>
    resolveInitialLocale(readStoredLocale(), navigator.language),
  )
  const loadedFromServer = useRef(false)

  // On auth, fetch the server-side preference. When valid, adopt it and write
  // it back to localStorage so the next cold start is instant.
  useEffect(() => {
    if (!userId) return

    let active = true
    ;(async () => {
      try {
        const { data, error } = await supabase.rpc('get_user_preferences')
        if (!active || error || !data) return
        const serverLocale = (data as { locale?: string }).locale
        if (serverLocale === 'en' || serverLocale === 'ar') {
          setLocaleState(serverLocale)
          writeStoredLocale(serverLocale)
        }
        loadedFromServer.current = true
      } catch {
        // Offline or migration not applied yet. localStorage stays authoritative.
      }
    })()

    return () => {
      active = false
    }
  }, [userId])

  // Flip dir/lang on the root element whenever the locale changes. index.html
  // keeps dir="ltr" as the pre-hydration default; this effect takes over once
  // React mounts.
  useEffect(() => {
    setDocumentDirection(locale)
  }, [locale])

  // Persist to localStorage on every change.
  useEffect(() => {
    writeStoredLocale(locale)
  }, [locale])

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next)
      // Write to Supabase in the background. The RPC bootstraps the row if it
      // does not exist. Failure is silent: the toggle still works for the
      // session via localStorage, and the next login will re-sync.
      if (userId) {
        void Promise.resolve(
          supabase.rpc('upsert_user_preference', {
            p_column: 'locale',
            p_value: next,
          }),
        ).catch(() => {})
      }
    },
    [userId],
  )

  const boundT = useCallback(
    (key: string, params?: Record<string, string>) => t(locale, key, params),
    [locale],
  )

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t: boundT }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  return useContext(LocaleContext)
}
