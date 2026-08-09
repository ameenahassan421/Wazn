import { useSyncExternalStore } from 'react'

/**
 * Whether a workout is open, published for the parts of the app that sit
 * ABOVE the Log screen in the tree.
 *
 * L8 asked for Discard in the header overflow menu, and the header is a
 * sibling of the screens rather than a child, so it cannot read `LogScreen`'s
 * state. The alternatives were threading workout state up through `App` (which
 * would put the active workout in the component that owns auth and tabs) or a
 * context whose value a child pushes in an effect. The second is a synchronous
 * setState inside an effect, which `eslint-plugin-react-hooks` v7 forbids for
 * good reason, and CLAUDE.md records the auto-fill defect that rule exists to
 * prevent.
 *
 * An external store is the tool actually designed for this: publishing is a
 * plain function call rather than a state update, and `useSyncExternalStore`
 * makes the read tear-free. It carries the id and a discard callback, nothing
 * else, because "nothing else" is what keeps it from becoming a second home
 * for workout state.
 */
export interface ActiveWorkout {
  id: string
  /** Runs the Log screen's own discard, so there is one implementation. */
  discard: () => void
}

let current: ActiveWorkout | null = null
const listeners = new Set<() => void>()

export function publishActiveWorkout(next: ActiveWorkout | null): void {
  // Referential equality is the store's change signal, so publishing the same
  // absence twice must not wake every subscriber.
  if (current === next) return
  if (current === null && next === null) return
  current = next
  for (const listener of listeners) listener()
}

export function getActiveWorkout(): ActiveWorkout | null {
  return current
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useActiveWorkout(): ActiveWorkout | null {
  return useSyncExternalStore(subscribe, getActiveWorkout, () => null)
}

/** Test seam. Module state outlives a test file otherwise. */
export function resetActiveWorkout(): void {
  current = null
  listeners.clear()
}
