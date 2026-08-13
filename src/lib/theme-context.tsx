import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from './supabase'

const STORAGE_KEY = 'workout.theme'

export type Theme = 'paper' | 'dark'

/** Browser chrome color per theme, mirrored into the theme-color meta tag. */
const CHROME: Record<Theme, string> = {
  paper: '#f7f3ec',
  dark: '#0c0b0a',
}

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'paper',
  setTheme: () => {},
})

function readStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'paper' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

function writeStoredTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Private browsing with storage blocked: the toggle still works for the
    // session, it just does not persist.
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', CHROME[theme])
}

/**
 * Same shape as LocaleProvider on purpose: localStorage is the optimistic
 * cache so the flip is instant, the server row is the cross-device memory,
 * and a missing `theme` column (0025 not applied yet) fails silently with
 * localStorage staying authoritative.
 *
 * Paper is the default, not a system-preference read: the product default
 * is the designed look (DECISIONS.md 2026-08-12), and dark is a choice.
 */
export function ThemeProvider({
  children,
  userId,
}: {
  children: ReactNode
  userId?: string | null
}) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme() ?? 'paper')

  useEffect(() => {
    if (!userId) return

    let active = true
    ;(async () => {
      try {
        const { data, error } = await supabase.rpc('get_user_preferences')
        if (!active || error || !data) return
        const serverTheme = (data as { theme?: string }).theme
        if (serverTheme === 'paper' || serverTheme === 'dark') {
          setThemeState(serverTheme)
          writeStoredTheme(serverTheme)
        }
      } catch {
        // Offline or migration not applied yet. localStorage stays authoritative.
      }
    })()

    return () => {
      active = false
    }
  }, [userId])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    writeStoredTheme(theme)
  }, [theme])

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next)
      if (userId) {
        void Promise.resolve(
          supabase.rpc('upsert_user_preference', {
            p_column: 'theme',
            p_value: next,
          }),
        ).catch(() => {})
      }
    },
    [userId],
  )

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
