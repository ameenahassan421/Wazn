/**
 * AsyncStorage, in memory, for vitest.
 *
 * ── WHY A STUB AND NOT A MOCK ───────────────────────────────────────────────
 * The real module pulls in `react-native`, whose `index.js` is Flow, which
 * vitest's parser refuses outright — so `live-workout.ts` became untestable
 * the moment it started checkpointing. That is the wrong trade: the checkpoint
 * is the most important thing in the file.
 *
 * This is a working implementation rather than a `vi.fn()` because the tests
 * that matter are about what comes BACK — a workout restored after the app was
 * killed. A mock that records calls cannot answer that; a Map can.
 */
const store = new Map<string, string>()

export function __reset(): void {
  store.clear()
}

export function __peek(key: string): string | null {
  return store.get(key) ?? null
}

export default {
  getItem(key: string): Promise<string | null> {
    return Promise.resolve(store.get(key) ?? null)
  },
  setItem(key: string, value: string): Promise<void> {
    store.set(key, value)
    return Promise.resolve()
  },
  removeItem(key: string): Promise<void> {
    store.delete(key)
    return Promise.resolve()
  },
}
