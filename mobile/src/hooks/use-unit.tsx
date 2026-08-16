import { createContext, use, useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

import type { Unit } from '@wazn/domain'

/**
 * Which unit weights are DISPLAYED in.
 *
 * ── THE INVARIANT THIS PROTECTS ─────────────────────────────────────────────
 * Weight is stored in kilograms. Always. This context changes what a lifter
 * reads and types, and nothing else — no conversion this provider knows about
 * ever reaches the database. `toDisplayWeight` / `fromDisplayWeight` in the
 * shared domain are the only two functions that cross the boundary, and they
 * are the same two the web app calls.
 *
 * lbs is the default because Ameen's entire imported history is in lbs and
 * the first thing a new install shows is that history.
 *
 * ── WHY ASYNCSTORAGE AND NOT SECURESTORE ────────────────────────────────────
 * This is a display preference, not a secret, and SecureStore reads are a
 * keychain round trip. The auth session is the only thing that earns that.
 */

const KEY = 'wazn.unit'
const DEFAULT: Unit = 'lbs'

type UnitContext = {
  unit: Unit
  setUnit: (next: Unit) => void
  /** False until the stored preference has been read. Screens that render a
   *  figure wait on it — flipping 225 to 102 one frame after paint is worse
   *  than showing nothing for that frame. */
  ready: boolean
}

const Ctx = createContext<UnitContext>({
  unit: DEFAULT,
  setUnit: () => {},
  ready: false,
})

export function UnitProvider({ children }: { children: React.ReactNode }) {
  const [unit, setUnitState] = useState<Unit>(DEFAULT)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let live = true
    void AsyncStorage.getItem(KEY)
      .then((stored) => {
        if (!live) return
        if (stored === 'kg' || stored === 'lbs') setUnitState(stored)
        setReady(true)
      })
      .catch(() => {
        // An unreadable preference is not a reason to hold the app. The
        // default is a real answer, and the next write repairs the store.
        if (live) setReady(true)
      })
    return () => {
      live = false
    }
  }, [])

  const setUnit = useCallback((next: Unit) => {
    // State first, storage after. The toggle has to feel instant, and a
    // failed write costs a preference rather than a set.
    setUnitState(next)
    void AsyncStorage.setItem(KEY, next).catch(() => {})
  }, [])

  return <Ctx value={{ unit, setUnit, ready }}>{children}</Ctx>
}

export function useUnit(): UnitContext {
  return use(Ctx)
}
