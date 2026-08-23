import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from './supabase'

const STORAGE_KEY = 'workout.theme'

export type Theme = 'paper' | 'dark'

/** Browser chrome color per theme, mirrored into the theme-color meta tag. */
const CHROME: Record<Theme, string> = {
  paper: '#f7f3ec',
  // v5's ground, not v2's #0c0b0a — the value moved with the palette in PR 1
  // and this table is the one place the browser chrome learns about it.
  dark: '#0f0d0a',
}

/**
 * The product default, and it is the opposite of what it used to be.
 *
 * Paper was the default from 2026-08-12. v5 "Momentum" replaced it outright on
 * 2026-08-16 and the toggle was deleted with it; Ameen asked for both themes
 * back the same day. So dark is what the app ships as and paper is a choice —
 * the reverse of the polarity this file was written with.
 *
 * The stored values keep the names `paper` and `dark`. `user_preferences.theme`
 * was deliberately never dropped when the toggle went away, so every row that
 * already says `paper` still means exactly what it said, and reinstating this
 * costs no migration at all.
 */
const DEFAULT_THEME: Theme = 'dark'

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
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

/**
 * `user_preferences.theme` and this file speak different vocabularies, so the
 * translation happens here rather than in the schema.
 *
 * 0040 gave the column three values: `system`, `light`, `dark`. That is the
 * native app's, and it is the right one, because native stores the CHOICE and
 * has to be able to say "follow the OS". This app has two themes and no system
 * option, and its own word for the light one is `paper`. Widening the column
 * to four values so a retiring client could keep its spelling would put the
 * dying app's vocabulary in the database that outlives it.
 *
 * `system` has no answer here. A browser could read `prefers-color-scheme`,
 * but this app's default is a designed look rather than an OS follow (see
 * DEFAULT_THEME), and inventing a mapping would make the web disagree with
 * the phone about what the same stored value means. It returns null and
 * localStorage stays authoritative, which is what this provider already does
 * for every other unreadable answer.
 */
function fromColumn(value: string | undefined): Theme | null {
  if (value === 'light') return 'paper'
  if (value === 'dark') return 'dark'
  return null
}

function toColumn(theme: Theme): 'light' | 'dark' {
  return theme === 'paper' ? 'light' : 'dark'
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
 * and an unreadable server answer fails silently with localStorage staying
 * authoritative.
 *
 * That last clause used to say "a missing `theme` column (0025 not applied
 * yet)", and it was describing a condition that held in production for the
 * whole life of this file: 0025 was written and never applied, so every write
 * from here raised `column theme does not exist` and was discarded. 0040 adds
 * the column, so this sync starts working for the first time.
 *
 * The default is not a system-preference read: the product default is the
 * designed look, and the other one is a choice. Which of the two is the
 * default flipped with v5 — see DEFAULT_THEME above.
 */
export function ThemeProvider({
  children,
  userId,
}: {
  children: ReactNode
  userId?: string | null
}) {
  const [theme, setThemeState] = useState<Theme>(
    () => readStoredTheme() ?? DEFAULT_THEME,
  )

  useEffect(() => {
    if (!userId) return

    let active = true
    ;(async () => {
      try {
        const { data, error } = await supabase.rpc('get_user_preferences')
        if (!active || error || !data) return
        const serverTheme = fromColumn((data as { theme?: string }).theme)
        if (serverTheme !== null) {
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
            p_value: toColumn(next),
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
