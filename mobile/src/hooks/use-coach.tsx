import { createContext, use, useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  asMode,
  asVolume,
  DEFAULT_MODE,
  DEFAULT_VOLUME,
  showsCoachSurfaces,
  usesGhostIntelligence,
  type CoachMode,
  type CoachVolume,
} from '@wazn/domain'

/**
 * How loud the coach is, and which lens it reads through.
 *
 * ── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────────
 * `coach-mode.ts` has carried `COACH_VOLUMES`, `showsCoachSurfaces` and
 * `usesGhostIntelligence` since v3, and until 2026-08-21 nothing on native
 * asked any of them — so every native surface behaved as `full` by never
 * checking. v5 §Do-not-regress 6 requires the opposite: "Coach volume Off must
 * render a coherent pure logger."
 *
 * ── TWO QUESTIONS, NOT ONE, AND THE MODULE SAYS SO ──────────────────────────
 * `showsCoachSurfaces` is `full` alone; `usesGhostIntelligence` is `full` AND
 * `quiet`. Quiet is "stop talking", not "stop thinking" — a quiet app still
 * seeds the next set from the coach's arithmetic, it just does not narrate it.
 * Collapsing them into one boolean either leaves the coach talking with the
 * dial off, or strips a silenced app of ghosts it had before v3 existed. Both
 * are re-exported here so a screen never re-derives the rule.
 *
 * ── ASYNCSTORAGE, AND THE SERVER GAP IS REAL ────────────────────────────────
 * The web reads and writes `user_preferences` as well as `localStorage`.
 * Native does neither yet — the same gap `use-unit` and `use-locale` carry, and
 * the one A0 named. So a lifter who sets Off on the phone still has Full in the
 * browser. `off` in particular has to survive a reinstall to be a promise, and
 * on this side it currently only survives a relaunch.
 */

const MODE_KEY = 'wazn.coach.mode'
const VOLUME_KEY = 'wazn.coach.volume'

interface CoachValue {
  mode: CoachMode
  volume: CoachVolume
  /** May the coach SAY anything? `full` only. */
  speaks: boolean
  /** May the coach still shape the numbers? `full` and `quiet`. */
  thinks: boolean
  setMode: (next: CoachMode) => void
  setVolume: (next: CoachVolume) => void
}

const CoachContext = createContext<CoachValue>({
  mode: DEFAULT_MODE,
  volume: DEFAULT_VOLUME,
  speaks: showsCoachSurfaces(DEFAULT_VOLUME),
  thinks: usesGhostIntelligence(DEFAULT_VOLUME),
  setMode: () => {},
  setVolume: () => {},
})

export function CoachProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<CoachMode>(DEFAULT_MODE)
  const [volume, setVolumeState] = useState<CoachVolume>(DEFAULT_VOLUME)

  /**
   * Read once, and never write back what was just read.
   *
   * `setState` lands in a `.then` rather than the effect body — the rule
   * `react-hooks` v7 enforces and that `use-body` was rewritten for.
   */
  useEffect(() => {
    let live = true
    void AsyncStorage.multiGet([MODE_KEY, VOLUME_KEY])
      .then((pairs) => {
        if (!live) return
        const stored = Object.fromEntries(pairs)
        const storedMode = asMode(stored[MODE_KEY])
        const storedVolume = asVolume(stored[VOLUME_KEY])
        if (storedMode !== null) setModeState(storedMode)
        if (storedVolume !== null) setVolumeState(storedVolume)
      })
      .catch(() => {
        // A preference that would not load is the default, not an error. There
        // is nothing here worth interrupting a workout for.
      })
    return () => {
      live = false
    }
  }, [])

  const setMode = useCallback((next: CoachMode) => {
    setModeState(next)
    void AsyncStorage.setItem(MODE_KEY, next).catch(() => {})
  }, [])

  const setVolume = useCallback((next: CoachVolume) => {
    setVolumeState(next)
    void AsyncStorage.setItem(VOLUME_KEY, next).catch(() => {})
  }, [])

  return (
    <CoachContext
      value={{
        mode,
        volume,
        speaks: showsCoachSurfaces(volume),
        thinks: usesGhostIntelligence(volume),
        setMode,
        setVolume,
      }}
    >
      {children}
    </CoachContext>
  )
}

export function useCoach(): CoachValue {
  return use(CoachContext)
}
