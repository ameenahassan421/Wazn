import type { SetType } from './types'

/**
 * The write queue behind optimistic set commits — trust-ladder rung 2.
 *
 * Until now a set was not on screen until Postgres said so: `addSet` awaited
 * the insert before touching state, which is why U7 measured tap → set on
 * screen at 195ms against a 100ms budget and why §3-U7 predicted that only
 * this work could close it. One round trip is the floor, and the fix is not to
 * make the round trip faster — it is to stop waiting for it.
 *
 * ── The id is the idempotency key ──────────────────────────────────────────
 * Every queued write carries a client-generated uuid that IS the row's primary
 * key (`workout_sets.id` has a default, not a constraint against being given
 * one). That single decision buys three things:
 *
 *  1. **A replay cannot double-insert.** If the tab is killed between the
 *     insert landing and the ack being processed, the restored queue retries
 *     the same write — and Postgres answers with a unique violation on the
 *     primary key, which is not an error here. It is the server saying "I
 *     already have that." `isAlreadyLanded` reads it that way.
 *  2. **The optimistic row has its final identity immediately.** No temporary
 *     id, no swap on ack, so React never remounts the row and the 90ms commit
 *     animation cannot run twice for one set.
 *  3. **The queue is safe to persist.** A checkpoint written mid-flight can be
 *     drained by a later page load without deduplication logic of its own.
 *
 * Everything here is pure. The draining, the timers and the network live in
 * the screen; what is easy to get wrong — when to retry, when to stop retrying
 * silently, what counts as success — is here where a test can reach it.
 */

export interface QueuedSet {
  /** Client-generated, and the row's primary key. See above. */
  id: string
  workoutId: string
  exerciseId: string
  setNumber: number
  weightKg: number | null
  reps: number
  setType: SetType
  rpe: number | null
  supersetGroup: number | null
  /** Delivery attempts made so far. Zero until the first one fails. */
  attempts: number
}

/**
 * How many failures pass in silence before the user is told.
 *
 * Not zero: a single failed insert on gym wifi is normal and self-corrects,
 * and an error banner between sets is exactly the interruption §2.1 forbids.
 * Not unbounded either — silence past the point where the app has stopped
 * working is the app lying about whether the session is being saved.
 */
export const MAX_SILENT_ATTEMPTS = 3

/**
 * Exponential backoff, capped. The cap matters more than the curve: a workout
 * lasts an hour and a retry an hour from now is not a retry, it is a loss.
 */
export function retryDelayMs(attempts: number): number {
  const base = 400 * 2 ** Math.max(0, attempts - 1)
  return Math.min(base, 15_000)
}

/** True once the failures have gone on long enough to be worth saying. */
export function shouldSurface(attempts: number): boolean {
  return attempts >= MAX_SILENT_ATTEMPTS
}

export function enqueue(queue: QueuedSet[], item: QueuedSet): QueuedSet[] {
  // Enqueuing the same id twice would be a bug upstream, not a duplicate set;
  // dropping it here keeps the invariant the id promises.
  if (queue.some((q) => q.id === item.id)) return queue
  return [...queue, item]
}

/** Remove a write that has landed — or that the server says it already had. */
export function ack(queue: QueuedSet[], id: string): QueuedSet[] {
  return queue.filter((q) => q.id !== id)
}

/** Count a failure against a write, leaving it in the queue to try again. */
export function retry(queue: QueuedSet[], id: string): QueuedSet[] {
  return queue.map((q) => (q.id === id ? { ...q, attempts: q.attempts + 1 } : q))
}

/**
 * Drop everything belonging to a workout. Discarding a session must not leave
 * writes in flight against a row that no longer exists — they would fail on
 * the foreign key forever and surface as an error about a workout the user
 * deliberately threw away.
 */
export function dropForWorkout(queue: QueuedSet[], workoutId: string): QueuedSet[] {
  return queue.filter((q) => q.workoutId !== workoutId)
}

/** The next write to attempt: oldest first, so sets land in the order performed. */
export function head(queue: QueuedSet[]): QueuedSet | null {
  return queue[0] ?? null
}

/**
 * A unique violation on the primary key means this exact write already landed.
 *
 * That is a success, not a failure, and reading it any other way is how a
 * restored queue turns one set into two. `23505` is Postgres's
 * `unique_violation`; PostgREST passes the SQLSTATE through as `code`.
 */
export function isAlreadyLanded(error: { code?: string | null } | null): boolean {
  return error?.code === '23505'
}

/**
 * A uuid, from the platform where it exists.
 *
 * `crypto.randomUUID` needs a secure context. The app is HTTPS everywhere it
 * runs, but a test environment and an old WebView are not guaranteed to have
 * it, and a missing id here would mean a set that cannot be written at all.
 * The fallback is v4-shaped and only ever has to be unique within one queue.
 */
export function newId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes)
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
