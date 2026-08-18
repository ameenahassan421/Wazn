import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'

import { restEnded } from '@/services/haptics'

/**
 * Rest, counted from a DEADLINE rather than a decrementing number.
 *
 * ── WHY THAT DISTINCTION IS THE WHOLE DESIGN ────────────────────────────────
 * A counter that subtracts one per tick is wrong the moment the app is
 * backgrounded, because the OS stops delivering ticks — and backgrounding is
 * the normal case here: a lifter puts the phone down for two minutes. Storing
 * the END TIME and deriving the remainder means the answer is correct however
 * long the process was frozen, with no background execution entitlement.
 *
 * ── THE TIMER IS SILENT ─────────────────────────────────────────────────────
 * Do-not-regress §5. No sound, ever. The end of rest is announced by a single
 * haptic and by the ring being full — a gym is loud and a chime is either
 * unheard or embarrassing.
 */
export interface RestTimer {
  /** Seconds left, or null when nothing is running. */
  remaining: number | null
  /** What it started at, for the ring's fraction. */
  total: number | null
  /** 0 at the start of the rest, 1 at the end. The ring FILLS. */
  progress: number
  start: (seconds: number) => void
  stop: () => void
  adjust: (deltaSeconds: number) => void
}

export const REST_STEP_SECONDS = 15

export function useRestTimer(): RestTimer {
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const announced = useRef(false)

  // One interval, only while something is running.
  useEffect(() => {
    if (endsAt === null) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [endsAt])

  // Recompute the instant the app comes back, rather than waiting up to a
  // quarter second for the next tick — coming back to a stale number is what
  // makes a timer feel like it stopped.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setNow(Date.now())
    })
    return () => sub.remove()
  }, [])

  /** The screen stays awake while resting and is released the moment it ends.
   *  A phone that sleeps mid-rest costs a lifter their place. */
  useEffect(() => {
    if (endsAt === null) return
    void activateKeepAwakeAsync('wazn-rest').catch(() => {})
    return () => {
      void deactivateKeepAwake('wazn-rest').catch(() => {})
    }
  }, [endsAt])

  const remaining =
    endsAt === null ? null : Math.max(0, Math.round((endsAt - now) / 1000))

  useEffect(() => {
    if (remaining === null) {
      announced.current = false
      return
    }
    if (remaining === 0 && !announced.current) {
      announced.current = true
      restEnded()
    }
  }, [remaining])

  const start = useCallback((seconds: number) => {
    if (seconds <= 0) return
    announced.current = false
    setTotal(seconds)
    setNow(Date.now())
    setEndsAt(Date.now() + seconds * 1000)
  }, [])

  const stop = useCallback(() => {
    setEndsAt(null)
    setTotal(null)
  }, [])

  const adjust = useCallback((delta: number) => {
    setEndsAt((e) => (e === null ? e : e + delta * 1000))
    setTotal((t) => (t === null ? t : Math.max(1, t + delta)))
  }, [])

  const progress =
    remaining === null || total === null || total === 0 ? 0 : 1 - remaining / total

  return { remaining, total, progress, start, stop, adjust }
}

/** `2:05`. Always minutes:seconds, never "125s". */
export function formatRest(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
