import { useEffect } from 'react'

/**
 * Keep the screen on while a workout is in progress.
 *
 * Stage 4's first gym-reality item, and the one with the most obvious failure
 * mode: you rack the bar, pick up the phone, and the screen has locked. Now
 * logging a set costs a face unlock and a re-find of where you were, which is
 * most of the 30-second budget §1 gives the whole interaction.
 *
 * Three things this has to survive, all of them normal:
 *
 *  - **No support.** Safari on iOS only got Screen Wake Lock in 16.4, and it
 *    is absent on plenty of the budget Android browsers this app is aimed at.
 *    Every call is guarded; a missing API is a no-op, never a thrown error
 *    mid-workout.
 *  - **Backgrounding.** The browser releases the lock whenever the page is
 *    hidden — switching apps, taking a call, the screen locking anyway. It is
 *    not restored automatically, so this re-acquires on `visibilitychange`.
 *  - **A user gesture requirement.** Some browsers refuse a request that does
 *    not follow an interaction. Starting a workout is a tap, so the first
 *    request is in the clear; the re-acquire after backgrounding may be
 *    refused, which is why the rejection is swallowed rather than surfaced.
 *
 * Deliberately silent either way. There is no "screen will stay on" toast:
 * §2.1 says nothing interrupts the logging flow, and a feature whose entire
 * job is to not be noticed should not announce itself.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return

    let sentinel: WakeLockSentinel | null = null
    let released = false

    async function acquire() {
      if (released || document.visibilityState !== 'visible') return
      try {
        sentinel = await navigator.wakeLock.request('screen')
      } catch {
        // Refused — usually no gesture, or a battery-saver mode. Not an error
        // worth a user's attention; the screen just behaves as it normally would.
      }
    }

    function onVisible() {
      if (document.visibilityState === 'visible' && !sentinel) void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release().catch(() => {})
      sentinel = null
    }
  }, [active])
}
