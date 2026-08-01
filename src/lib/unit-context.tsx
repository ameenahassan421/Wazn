import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
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

export function UnitProvider({ children }: { children: ReactNode }) {
  const [unit, setUnit] = useState<Unit>(readStoredUnit)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, unit)
    } catch {
      // Private browsing with storage blocked: the toggle still works for the
      // session, it just does not persist.
    }
  }, [unit])

  const toggleUnit = useCallback(() => {
    setUnit((current) => (current === 'lbs' ? 'kg' : 'lbs'))
  }, [])

  return (
    <UnitContext.Provider value={{ unit, toggleUnit }}>{children}</UnitContext.Provider>
  )
}

export function useUnit() {
  return useContext(UnitContext)
}
