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
}

const UnitContext = createContext<UnitContextValue>({
  unit: 'lbs',
  toggleUnit: () => {},
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

  const toggleUnit = useCallback(() => {
    setUnit((current) => {
      const next = current === 'lbs' ? 'kg' : 'lbs'
      // Write to Supabase in the background. The RPC bootstraps the row if it
      // does not exist. Failure is silent: the toggle still works for the
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
  }, [userId])

  return (
    <UnitContext.Provider value={{ unit, toggleUnit }}>{children}</UnitContext.Provider>
  )
}

export function useUnit() {
  return useContext(UnitContext)
}
