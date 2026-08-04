import { useEffect, useRef } from 'react'

/**
 * System-back support for an app with no router.
 *
 * Installed as a PWA there is no browser chrome: the Android back gesture is
 * the only "back" a user has, and it pops browser history. Every overlay the
 * app opens with plain state — the picker, set entry, a routine editor, a
 * dialog, a menu — therefore mirrors itself into history as one entry. Back
 * then closes the topmost open layer instead of closing the app, which is
 * what every phone user's thumb already expects.
 *
 * One entry per *layer*, not per view: while `open` stays true the entry is
 * reused, so stepping picker → set entry inside the workout stays one level
 * deep and a single back always lands on the workout overview. Layers are
 * tracked by the depth they stamped into `history.state`; on popstate every
 * layer deeper than the arriving state closes, which also handles a
 * multi-entry back (long-press history jump) correctly.
 */

interface Layer {
  depth: number
  close: () => void
}

/** Open layers, shallowest first. Module scope: history is a global too. */
const layers: Layer[] = []
let listening = false

function currentDepth(): number {
  const state = window.history.state as { waznDepth?: number } | null
  return typeof state?.waznDepth === 'number' ? state.waznDepth : 0
}

function ensureListener() {
  if (listening) return
  listening = true
  window.addEventListener('popstate', (event) => {
    const state = event.state as { waznDepth?: number } | null
    const depth = typeof state?.waznDepth === 'number' ? state.waznDepth : 0
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      if (layers[i].depth > depth) {
        const [layer] = layers.splice(i, 1)
        layer.close()
      }
    }
  })
}

/**
 * Mirror an open/closed UI layer into browser history.
 *
 * While `open` is true, one history entry exists for this layer; the system
 * back gesture calls `close` instead of leaving the app. Closing in-app
 * (tapping ✕, saving, picking) consumes the entry silently.
 */
export function useBackLayer(open: boolean, close: () => void): void {
  // The latest close handler, without re-running the effect on every render.
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })

  useEffect(() => {
    if (!open) return
    ensureListener()
    const depth = currentDepth() + 1
    window.history.pushState({ waznDepth: depth }, '')
    const layer: Layer = { depth, close: () => closeRef.current() }
    layers.push(layer)

    return () => {
      const index = layers.indexOf(layer)
      // Already removed: the back gesture closed it, entry consumed.
      if (index === -1) return
      layers.splice(index, 1)
      // Closed in-app: take our entry back out so the stack stays honest.
      if (currentDepth() >= layer.depth) window.history.back()
    }
  }, [open])
}
