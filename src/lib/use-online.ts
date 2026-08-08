import { useEffect, useState } from 'react'

/**
 * Whether the browser thinks it has a network.
 *
 * `navigator.onLine` is a weak signal and is treated as one. It is true on a
 * hotel captive portal, true on gym wifi that resolves nothing, and false only
 * when the OS is certain — so it is used to decide when NOT to bother trying,
 * never to decide that a write succeeded. The authority on whether a write
 * landed is the write's own answer, classified in `write-queue.ts`.
 *
 * What it is genuinely good for: `false` means "do not spend battery firing
 * requests into a dead radio", and the `online` event is the cheapest possible
 * cue to drain the queue the moment signal comes back — which is GATE 4's
 * whole sentence.
 */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(isOnline)

  useEffect(() => {
    const update = () => setOnline(isOnline())
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    // The events do not fire while the tab is backgrounded on iOS, so coming
    // back to a phone that changed networks in a pocket needs this as well.
    document.addEventListener('visibilitychange', update)
    // And once now, in case the state changed between render and subscribe.
    update()
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])

  return online
}
