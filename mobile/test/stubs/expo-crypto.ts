/**
 * `expo-crypto`, for vitest. Same reason as the AsyncStorage stub: the real
 * module reaches into React Native.
 *
 * The ids are sequential rather than random ON PURPOSE. Every assertion about
 * the write queue is about identity — this set is that row, a replay collides
 * — and an assertion against a random id can only ever check its shape. A
 * counter makes the queue's behaviour readable in a diff.
 */
let n = 0

export function __reset(): void {
  n = 0
}

export function randomUUID(): string {
  n += 1
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
}
