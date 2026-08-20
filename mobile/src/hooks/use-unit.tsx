import { createContext, use, useCallback, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

import type { Unit } from '@wazn/domain'

import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/services/supabase'

/**
 * Which unit weights are DISPLAYED in.
 *
 * ── THE INVARIANT THIS PROTECTS ─────────────────────────────────────────────
 * Weight is stored in kilograms. Always. This context changes what a lifter
 * reads and types, and nothing else. No conversion this provider knows about
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
 *
 * ── THREE WRITERS, IN A FIXED ORDER OF AUTHORITY ────────────────────────────
 * The same account is read on a phone and in a browser, so the preference has
 * to survive the trip. `user_preferences.weight_unit` on the server is the
 * shared truth; the two device caches are only there to make a cold start
 * instant. They deliberately use DIFFERENT keys (`wazn.unit` here,
 * `workout.unit` in `src/lib/unit-context.tsx`) and that is not a bug to fix:
 * a per-device cache is never read by the other platform, so making the names
 * match would buy nothing and would silently migrate nobody.
 *
 * Three things can decide the unit, and they rank:
 *
 *   1. the lifter tapping the control  (always wins, see `userChose`)
 *   2. the server row                  (wins over the cache, see `serverAnswered`)
 *   3. the AsyncStorage cache          (renders first, yields to both)
 *
 * The ranking is enforced with refs rather than by ordering the awaits,
 * because the network is not orderable. A slow `get_user_preferences` that
 * lands after the lifter has already pressed kg must not drag them back to
 * lbs, and a server answer that beats the disk read must not then be
 * overwritten by the stale cached value.
 */

const KEY = 'wazn.unit'
const DEFAULT: Unit = 'lbs'

type UnitContext = {
  unit: Unit
  setUnit: (next: Unit) => void
  /** False until the stored preference has been read. Screens that render a
   *  figure wait on it. Flipping 225 to 102 one frame after paint is worse
   *  than showing nothing for that frame. */
  ready: boolean
}

const Ctx = createContext<UnitContext>({
  unit: DEFAULT,
  setUnit: () => {},
  ready: false,
})

function cache(next: Unit) {
  void AsyncStorage.setItem(KEY, next).catch(() => {})
}

export function UnitProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth()
  const [unit, setUnitState] = useState<Unit>(DEFAULT)
  const [ready, setReady] = useState(false)

  const userChose = useRef(false)
  const serverAnswered = useRef(false)

  useEffect(() => {
    let live = true
    void AsyncStorage.getItem(KEY)
      .then((stored) => {
        if (!live) return
        // Anything better than the cache already landed while the disk was
        // being read. Do not undo it.
        if (!userChose.current && !serverAnswered.current) {
          if (stored === 'kg' || stored === 'lbs') setUnitState(stored)
        }
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

  // Reconcile with the server once there is somebody to reconcile for. This
  // never gates `ready`: the cached value renders on the first frame and the
  // server correction, if any, arrives a beat later.
  useEffect(() => {
    if (userId === null) return

    let live = true
    // A different account gets to answer for itself. Whatever the previous
    // lifter tapped is not this lifter's preference.
    userChose.current = false
    serverAnswered.current = false

    void Promise.resolve(supabase.rpc('get_user_preferences'))
      .then(({ data, error }) => {
        if (!live || error !== null || data === null) return
        // The lifter beat the network. Their tap outranks the row they are in
        // the middle of replacing, and the write for it is already in flight.
        if (userChose.current) return

        const server = (data as { weight_unit?: string }).weight_unit
        if (server !== 'kg' && server !== 'lbs') return

        serverAnswered.current = true
        setUnitState(server)
        cache(server)
      })
      .catch(() => {
        // Signed out mid-flight, offline, or a row that does not exist yet.
        // The cache stays authoritative and the next launch tries again.
      })

    return () => {
      live = false
    }
  }, [userId])

  const setUnit = useCallback(
    (next: Unit) => {
      // Marked before the no-op check: pressing the live side of a segmented
      // control is still the lifter saying which unit they want, and it should
      // outrank a server read that has not landed yet.
      userChose.current = true
      if (next === unit) return

      // State first, storage after. The toggle has to feel instant, and a
      // failed write costs a preference rather than a set.
      setUnitState(next)
      cache(next)

      // And the server last, in the background. Failure is silent: the choice
      // holds for this session out of the cache, and the next sign-in re-syncs.
      if (userId !== null) {
        void Promise.resolve(
          supabase.rpc('upsert_user_preference', {
            p_column: 'weight_unit',
            p_value: next,
          }),
        ).catch(() => {})
      }
    },
    [unit, userId],
  )

  return <Ctx value={{ unit, setUnit, ready }}>{children}</Ctx>
}

export function useUnit(): UnitContext {
  return use(Ctx)
}
