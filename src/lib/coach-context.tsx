import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from './supabase'
import {
  DEFAULT_MODE,
  DEFAULT_VOLUME,
  asMode,
  asVolume,
  type CoachMode,
  type CoachVolume,
} from '@wazn/core/coach-mode'

/**
 * The coach's dials, held where every screen can read them.
 *
 * Same shape as ThemeProvider and LocaleProvider on purpose: localStorage is
 * the optimistic cache so a switch is instant, the server row is the
 * cross-device memory, and a missing column — 0027 not applied yet — fails
 * silently with localStorage staying authoritative. That is what lets the v3
 * UI ship before its DDL, exactly as 0023 and 0025 did.
 *
 * `mode` is a lens over one dataset and `volume` is how loudly the coach
 * speaks. Neither is a feature flag: both are preferences the lifter set, and
 * `off` in particular has to survive a reinstall or it is not a promise.
 */

const MODE_KEY = 'workout.coach.mode'
const VOLUME_KEY = 'workout.coach.volume'
const MEET_KEY = 'workout.coach.meet'
const TARGET_KEY = 'workout.coach.weeklyTarget'

export const DEFAULT_WEEKLY_TARGET = 3

interface CoachContextValue {
  mode: CoachMode
  volume: CoachVolume
  /** ISO date, or null while meet prep is undated. */
  meetDate: string | null
  weeklyTarget: number
  proteinTargetG: number | null
  setMode: (mode: CoachMode) => void
  setVolume: (volume: CoachVolume) => void
  setMeetDate: (date: string | null) => void
  setWeeklyTarget: (n: number) => void
  setProteinTargetG: (g: number | null) => void
}

const CoachContext = createContext<CoachContextValue>({
  mode: DEFAULT_MODE,
  volume: DEFAULT_VOLUME,
  meetDate: null,
  weeklyTarget: DEFAULT_WEEKLY_TARGET,
  proteinTargetG: null,
  setMode: () => {},
  setVolume: () => {},
  setMeetDate: () => {},
  setWeeklyTarget: () => {},
  setProteinTargetG: () => {},
})

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Private browsing with storage blocked: the dial still works for the
    // session, it just does not persist.
  }
}

/** Fire-and-forget; a preference that fails to sync is not worth a message. */
function push(userId: string | null | undefined, column: string, value: string) {
  if (!userId) return
  void Promise.resolve(
    supabase.rpc('upsert_user_preference', { p_column: column, p_value: value }),
  ).catch(() => {})
}

export function CoachProvider({
  children,
  userId,
}: {
  children: ReactNode
  userId?: string | null
}) {
  const [mode, setModeState] = useState<CoachMode>(
    () => asMode(read(MODE_KEY)) ?? DEFAULT_MODE,
  )
  const [volume, setVolumeState] = useState<CoachVolume>(
    () => asVolume(read(VOLUME_KEY)) ?? DEFAULT_VOLUME,
  )
  const [meetDate, setMeetDateState] = useState<string | null>(() => read(MEET_KEY))
  const [weeklyTarget, setWeeklyTargetState] = useState<number>(() => {
    const stored = Number(read(TARGET_KEY))
    return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_WEEKLY_TARGET
  })
  const [proteinTargetG, setProteinTargetState] = useState<number | null>(null)

  useEffect(() => {
    if (!userId) return
    let active = true
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('get_user_preferences')
        if (!active || error || !data) return
        const row = data as {
          coach_mode?: unknown
          coach_volume?: unknown
          meet_date?: unknown
          weekly_target?: unknown
          protein_target_g?: unknown
        }
        const serverMode = asMode(row.coach_mode)
        if (serverMode) {
          setModeState(serverMode)
          write(MODE_KEY, serverMode)
        }
        const serverVolume = asVolume(row.coach_volume)
        if (serverVolume) {
          setVolumeState(serverVolume)
          write(VOLUME_KEY, serverVolume)
        }
        if (typeof row.meet_date === 'string' || row.meet_date === null) {
          setMeetDateState(row.meet_date)
          write(MEET_KEY, row.meet_date)
        }
        if (typeof row.weekly_target === 'number' && row.weekly_target > 0) {
          setWeeklyTargetState(row.weekly_target)
          write(TARGET_KEY, String(row.weekly_target))
        }
        if (typeof row.protein_target_g === 'number') {
          setProteinTargetState(row.protein_target_g)
        }
      } catch {
        // Offline, or 0027 not applied. localStorage stays authoritative.
      }
    })()
    return () => {
      active = false
    }
  }, [userId])

  const setMode = useCallback(
    (next: CoachMode) => {
      setModeState(next)
      write(MODE_KEY, next)
      push(userId, 'coach_mode', next)
    },
    [userId],
  )

  const setVolume = useCallback(
    (next: CoachVolume) => {
      setVolumeState(next)
      write(VOLUME_KEY, next)
      push(userId, 'coach_volume', next)
    },
    [userId],
  )

  const setMeetDate = useCallback(
    (next: string | null) => {
      setMeetDateState(next)
      write(MEET_KEY, next)
      // The empty string is how 0027's RPC is told to clear the date. A second
      // RPC for "unset" would be one more thing to keep in step.
      push(userId, 'meet_date', next ?? '')
    },
    [userId],
  )

  const setWeeklyTarget = useCallback(
    (n: number) => {
      const next = Math.min(14, Math.max(1, Math.round(n)))
      setWeeklyTargetState(next)
      write(TARGET_KEY, String(next))
      push(userId, 'weekly_target', String(next))
    },
    [userId],
  )

  const setProteinTargetG = useCallback(
    (g: number | null) => {
      setProteinTargetState(g)
      push(userId, 'protein_target_g', g === null ? '' : String(g))
    },
    [userId],
  )

  return (
    <CoachContext.Provider
      value={{
        mode,
        volume,
        meetDate,
        weeklyTarget,
        proteinTargetG,
        setMode,
        setVolume,
        setMeetDate,
        setWeeklyTarget,
        setProteinTargetG,
      }}
    >
      {children}
    </CoachContext.Provider>
  )
}

export function useCoach() {
  return useContext(CoachContext)
}
