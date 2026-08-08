import { useEffect, useRef, useState } from 'react'

/**
 * Is the hand off the phone?
 *
 * Built for one caller — the rest canvas — and for one rule in §8-E1: the
 * canvas "vanishes the moment the user reaches for the next set". A canvas that
 * grows while a thumb is already travelling toward a check button is a canvas
 * that steals the tap the whole app is built around, so it is never allowed to
 * appear while anything is happening.
 *
 * ── THE ASYMMETRY IS THE DESIGN ─────────────────────────────────────────────
 * Going NOT idle is immediate and synchronous with the event, in the capture
 * phase, before any component has handled it. Going idle is polled. Those are
 * different requirements: leaving idle late would put a surface under a moving
 * thumb, while entering it late costs nothing but a quarter second of blank
 * gap. Anything symmetric would have to pick one of the two to get wrong.
 *
 * A `setTimeout` restarted per event would have been symmetric and simpler, and
 * on a touch drag that is a clear-and-schedule on every `pointermove` frame,
 * mid-workout, on the budget Android the plan names as the baseline. The ref
 * costs one write instead.
 */
export function useIdle(active: boolean, ms: number, pollMs = 250): boolean {
  const [state, setState] = useState({ armed: active, idle: false })
  const lastRef = useRef(0)

  /**
   * Arming and disarming both reset to "not idle", adjusted during render
   * rather than in an effect — CLAUDE.md's rule, and the reason for it is the
   * bug it prevents here. A rest ending and another starting would otherwise
   * inherit the previous rest's `idle`, and the canvas would be on screen for
   * up to a poll interval starting from the instant a check was pressed, which
   * is the one moment §8-E1 says it must not be there.
   */
  if (state.armed !== active) setState({ armed: active, idle: false })

  useEffect(() => {
    if (!active) return

    lastRef.current = Date.now()

    const touched = () => {
      lastRef.current = Date.now()
      // React bails out of an identical value, so this is a no-op on all but
      // the first event after a quiet stretch.
      setState((prev) => (prev.idle ? { ...prev, idle: false } : prev))
    }

    // Capture, so a handler that stops propagation cannot leave the canvas up.
    // `scroll` does not bubble to the document at all without it.
    const options = { capture: true, passive: true } as const
    const events = [
      'pointerdown',
      'pointermove',
      'wheel',
      'scroll',
      'keydown',
      'touchstart',
    ] as const
    for (const name of events) document.addEventListener(name, touched, options)

    const id = window.setInterval(() => {
      const quiet = Date.now() - lastRef.current >= ms
      setState((prev) => (prev.idle === quiet ? prev : { ...prev, idle: quiet }))
    }, pollMs)

    return () => {
      for (const name of events) document.removeEventListener(name, touched, options)
      window.clearInterval(id)
    }
  }, [active, ms, pollMs])

  // Inactive is not idle: the caller asked for nothing, and answering "yes,
  // quiet" would let a surface mount on a screen that never armed it.
  return active && state.armed && state.idle
}
