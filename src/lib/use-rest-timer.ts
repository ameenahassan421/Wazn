import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Rest timer.
 *
 * Counts down from a deadline, not by decrementing a number. A phone locks the
 * screen and throttles timers the moment it goes in a pocket, which is exactly
 * where it lives between sets — a tick-based countdown would drift or freeze
 * and come back wrong. Storing `endsAt` means the remaining time is always
 * derived from the clock, so the display is correct the instant the screen
 * wakes, however long it slept.
 */
export const DEFAULT_REST_SECONDS = 120

/** Steps the adjust buttons move by. */
export const REST_STEP_SECONDS = 15

export interface RestTimer {
  /** Seconds left, floored at 0. Null when no timer is running. */
  remaining: number | null
  /** What the timer was started with, for the progress ring. */
  total: number | null
  running: boolean
  start: (seconds: number) => void
  adjust: (deltaSeconds: number) => void
  stop: () => void
}

function vibrate(pattern: number | number[]) {
  // Not on iOS Safari, and not without a user gesture in some browsers.
  // Guarded rather than assumed — a throw here would land mid-workout.
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* vibration is a nicety, never a failure */
  }
}

// There is deliberately no sound here. Design v2 amends the rest timer to be
// SILENT: the done state is an amber ring and "Rest done", with an optional
// haptic. A gym is somebody else's room, and a phone that chirps between sets
// is a reason to leave the timer off — which costs the whole feature.

export function useRestTimer(): RestTimer {
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const firedRef = useRef(false)

  // Derived during render, never stored. `eslint-plugin-react-hooks` v7 forbids
  // synchronous setState inside effects (see CLAUDE.md), and a stored copy
  // would be a second source of truth for something the clock already knows.
  const remaining =
    endsAt === null ? null : Math.max(0, Math.ceil((endsAt - now) / 1000))

  useEffect(() => {
    if (endsAt === null) return

    // Only ever called from a timer or an event, never in the effect body.
    function tick() {
      const stamp = Date.now()
      setNow(stamp)
      if (endsAt !== null && stamp >= endsAt && !firedRef.current) {
        firedRef.current = true
        vibrate([200, 100, 200])
      }
    }

    const id = window.setInterval(tick, 250)
    // Recompute the moment the tab is foregrounded: throttled intervals can be
    // seconds late, and the first thing a user does is look at the number.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [endsAt])

  const start = useCallback((seconds: number) => {
    firedRef.current = false
    const stamp = Date.now()
    setNow(stamp)
    setTotal(seconds)
    setEndsAt(stamp + seconds * 1000)
  }, [])

  const adjust = useCallback((delta: number) => {
    setEndsAt((prev) => {
      if (prev === null) return prev
      const next = Math.max(Date.now(), prev + delta * 1000)
      if (next > Date.now()) firedRef.current = false
      return next
    })
    setTotal((prev) => (prev === null ? prev : Math.max(0, prev + delta)))
  }, [])

  const stop = useCallback(() => {
    firedRef.current = false
    setEndsAt(null)
    setTotal(null)
  }, [])

  return {
    remaining,
    total,
    running: endsAt !== null && (remaining ?? 0) > 0,
    start,
    adjust,
    stop,
  }
}

/** "2:00", "0:45" — the shape a gym clock has. */
export function formatRest(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
