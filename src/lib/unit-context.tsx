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
import type { Unit } from './units'

const STORAGE_KEY = 'workout.unit'

interface UnitContextValue {
  unit: Unit
  toggleUnit: () => void
  /** Set a specific unit. A segmented kg/lb control cannot use a toggle:
   *  pressing "kg" when kg is already on must be a no-op, not a flip. */
  setUnit: (unit: Unit) => void
}

const UnitContext = createContext<UnitContextValue>({
  unit: 'lbs',
  toggleUnit: () => {},
  setUnit: () => {},
})

function readStoredUnit(): Unit {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'kg' ? 'kg' : 'lbs'
  } catch {
    return 'lbs'
  }
}

function writeStoredUnit(u: Unit) {
  try {
    localStorage.setItem(STORAGE_KEY, u)
  } catch {
    // Private browsing with storage blocked: the toggle still works for the
    // session, it just does not persist.
  }
}

export function UnitProvider({
  children,
  userId,
}: {
  children: ReactNode
  userId?: string | null
}) {
  const [unit, setUnit] = useState<Unit>(readStoredUnit)
  const loadedFromServer = useRef(false)

  // On auth, fetch the server-side preference. localStorage is the optimistic
  // cache so the toggle is instant; the server is the source of truth once we
  // hear from it.
  useEffect(() => {
    if (!userId) return

    let active = true
    ;(async () => {
      try {
        const { data, error } = await supabase.rpc('get_user_preferences')
        if (!active || error || !data) return
        const serverUnit = (data as { weight_unit?: string }).weight_unit
        if (serverUnit === 'kg' || serverUnit === 'lbs') {
          setUnit(serverUnit)
          writeStoredUnit(serverUnit)
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

  // Persist to localStorage on every change.
  useEffect(() => {
    writeStoredUnit(unit)
  }, [unit])

  const chooseUnit = useCallback(
    (next: Unit) => {
      setUnit((current) => {
        // Nothing to write when the choice is already the state. A segmented
        // control gets pressed on its live side often, and each press would
        // otherwise be a wasted RPC.
        if (next === current) return current
        // Write to Supabase in the background. The RPC bootstraps the row if
        // it does not exist. Failure is silent: the choice still holds for the
        // session via localStorage, and the next login will re-sync.
        if (userId) {
          void Promise.resolve(
            supabase.rpc('upsert_user_preference', {
              p_column: 'weight_unit',
              p_value: next,
            }),
          ).catch(() => {})
        }
        return next
      })
    },
    [userId],
  )

  const toggleUnit = useCallback(() => {
    chooseUnit(unit === 'lbs' ? 'kg' : 'lbs')
  }, [chooseUnit, unit])

  return (
    <UnitContext.Provider value={{ unit, toggleUnit, setUnit: chooseUnit }}>
      {children}
    </UnitContext.Provider>
  )
}

export function useUnit() {
  return useContext(UnitContext)
}
