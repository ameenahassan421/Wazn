import { lazy } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'

/**
 * `React.lazy`, but it survives a deploy.
 *
 * THE DEFECT THIS EXISTS FOR, because it took a reproduction to believe it:
 * Progress, Coach and Friends — the three lazy tabs, and only those three —
 * broke for anyone whose page was already open when a new build went live.
 * Log and History kept working because they are in the main chunk.
 *
 * The sequence, reproduced end to end before this was written:
 *
 *  1. A page is open holding `index-<oldhash>.js`.
 *  2. A deploy lands. Vercel's production alias serves only the current
 *     build, so `ProgressScreen-<oldhash>.js` stops existing — a 404, not a
 *     stale file.
 *  3. The new service worker installs, and because vite-plugin-pwa's
 *     `autoUpdate` sets `skipWaiting` + `clientsClaim`, it takes over the
 *     running page and its precache no longer lists the old hashes. The cache
 *     that would have covered step 2 is gone.
 *  4. The user taps Progress. `import()` rejects with "Failed to fetch
 *     dynamically imported module", `lazy` throws, and the error boundary
 *     renders "Something broke".
 *
 * And it stays broken: a module that fails to load is remembered as failed, so
 * the boundary's "Try again" re-throws instantly and switching tabs and coming
 * back does nothing. Only a full reload clears it — which is exactly what this
 * does, once.
 *
 * `vite.config.ts` now also stops a new worker claiming a live page, which
 * closes step 3. This stays anyway: step 2 needs no service worker at all. A
 * plain browser tab left open across a deploy hits the same 404, and so does a
 * connection that drops mid-import.
 *
 * Reloading is safe here in a way it would not be on the Log tab. Every set is
 * written to `workout_sets` on commit, and this can only fire from a tap on
 * Progress, Coach or Friends — never mid-set. Plan §2.1 forbids interrupting
 * the logging flow; this is not in it.
 */

/**
 * Survives the reload, unlike a module variable, which is the whole point —
 * the guard has to still be there on the other side to stop a reload loop.
 * Per tab, so one bad tab cannot silence another.
 */
const RELOAD_KEY = 'wazn:chunk-reload'

/** Private mode can make `sessionStorage` throw on access, not just on write. */
function reloadAlreadyTried(): boolean {
  try {
    return window.sessionStorage.getItem(RELOAD_KEY) !== null
  } catch {
    // No storage means no guard, and an unguarded reload can loop. Treat it as
    // "already tried" and let the boundary have it: a screen showing an error
    // beats a phone reloading forever in a gym.
    return true
  }
}

function markReloadTried(): void {
  try {
    window.sessionStorage.setItem(RELOAD_KEY, '1')
  } catch {
    /* see above — nothing to do, and nothing worth failing over */
  }
}

function clearReloadMark(): void {
  try {
    window.sessionStorage.removeItem(RELOAD_KEY)
  } catch {
    /* likewise */
  }
}

/**
 * Wrap a screen's dynamic import so a failed chunk fetch reloads the page once
 * instead of stranding the tab.
 *
 * The returned promise deliberately never settles on the reload path. The
 * navigation is already underway and Suspense keeps its fallback up, so the
 * user sees "Loading…" for the moment it takes rather than an error card that
 * is about to be thrown away.
 */
// The same constraint `React.lazy` declares. A narrower one infers `never` for
// the props of a screen that takes any, and every screen here takes some.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyScreen<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const module = await load()
      // Getting here proves the assets match the page. Clearing the mark is
      // what lets a *later* deploy recover the same way; leaving it set would
      // spend the one reload on the first failure of the tab's life.
      clearReloadMark()
      return module
    } catch (error) {
      if (reloadAlreadyTried()) throw error
      markReloadTried()
      window.location.reload()
      return new Promise<never>(() => {})
    }
  })
}
