import type { SetType } from './types'

/**
 * The write queue behind optimistic commits — trust-ladder rungs 2 and 3.
 *
 * Until U3a a set was not on screen until Postgres said so: `addSet` awaited
 * the insert before touching state, which is why U7 measured tap → set on
 * screen at 195ms against a 100ms budget and why §3-U7 predicted that only
 * this work could close it. One round trip is the floor, and the fix is not to
 * make the round trip faster — it is to stop waiting for it.
 *
 * U3b widened it from a queue of sets to an ordered log of every write an
 * active workout performs, because "a full airplane-mode workout" (GATE 4)
 * starts and ends offline too. Starting one used to await an insert, and
 * finishing one used to await an update; neither can be awaited in a gym with
 * no signal, and both are now ops in this queue.
 *
 * ── The id is the idempotency key ──────────────────────────────────────────
 * Every queued write carries a client-generated uuid that IS the row's primary
 * key (`workout_sets.id` and `workouts.id` have defaults, not constraints
 * against being given one). That single decision buys three things:
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
 * ── Order is the foreign key ───────────────────────────────────────────────
 * The queue drains strictly head-first and a failed head is retried rather
 * than skipped. That is not politeness about ordering, it is correctness:
 * `workout_sets.workout_id` references `workouts`, so a set queued behind the
 * insert that creates its workout must stay behind it. Draining out of order
 * would turn every offline workout into a wall of foreign-key violations.
 *
 * ── The conflict rule: device wins for its own data ────────────────────────
 * There is no merge anywhere in here, by design. Every write in this queue
 * belongs to the account that performed it, ids are chosen by the device that
 * did the set, and a replay of a write the server already has is refused
 * rather than reconciled. The one field that could disagree between two
 * devices is `workouts.ended_at`, and there last-write-wins is the rule: the
 * device that finished the session is the one that was in the gym.
 *
 * Everything here is pure. The draining, the timers and the network live in
 * the screen; what is easy to get wrong — when to retry, when to stop retrying
 * silently, what counts as success — is here where a test can reach it.
 */

/** Fields shared by every op, so the queue can be handled uniformly. */
interface QueuedBase {
  /** Client-generated, and the row's primary key where the op inserts one. */
  id: string
  /** The workout this write belongs to. Discarding a session drops them all. */
  workoutId: string
  /** Delivery attempts made so far. Zero until the first one fails. */
  attempts: number
}

export interface QueuedSet extends QueuedBase {
  kind: 'set'
  exerciseId: string
  setNumber: number
  weightKg: number | null
  reps: number
  setType: SetType
  rpe: number | null
  supersetGroup: number | null
}

/**
 * The insert that creates the workout. Its `id` is the workout id, so the
 * sets queued behind it already know what they belong to — which is what lets
 * a whole session be logged before the row exists anywhere but this device.
 */
export interface QueuedWorkoutStart extends QueuedBase {
  kind: 'workout-start'
  userId: string
  startedAt: string
  name: string | null
  routineId: string | null
}

/** `ended_at`. An update, so replaying it is naturally idempotent. */
export interface QueuedWorkoutFinish extends QueuedBase {
  kind: 'workout-finish'
  endedAt: string
}

/**
 * Deleting a workout the server already has. Only ever queued for a session
 * that reached Postgres — one discarded before its own start op drained is
 * dropped outright and never travels. See `discardWrites`.
 */
export interface QueuedWorkoutDiscard extends QueuedBase {
  kind: 'workout-discard'
}

export type QueuedWrite =
  QueuedSet | QueuedWorkoutStart | QueuedWorkoutFinish | QueuedWorkoutDiscard

/** Deterministic op ids for the writes that are not inserts. */
export const finishOpId = (workoutId: string) => `finish:${workoutId}`
export const discardOpId = (workoutId: string) => `discard:${workoutId}`

/**
 * How many failures pass in silence before the user is told.
 *
 * Not zero: a single failed insert on gym wifi is normal and self-corrects,
 * and an error banner between sets is exactly the interruption §2.1 forbids.
 * Not unbounded either — silence past the point where the app has stopped
 * working is the app lying about whether the session is being saved.
 *
 * Note what this does NOT count, since U3b: a write that failed because there
 * is no network. See `classifyFailure`.
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

export function enqueue(queue: QueuedWrite[], item: QueuedWrite): QueuedWrite[] {
  // Enqueuing the same id twice would be a bug upstream, not a second set;
  // dropping it here keeps the invariant the id promises.
  if (queue.some((q) => q.id === item.id)) return queue
  return [...queue, item]
}

/** Remove a write that has landed — or that the server says it already had. */
export function ack(queue: QueuedWrite[], id: string): QueuedWrite[] {
  return queue.filter((q) => q.id !== id)
}

/** Count a failure against a write, leaving it in the queue to try again. */
export function retry(queue: QueuedWrite[], id: string): QueuedWrite[] {
  return queue.map((q) => (q.id === id ? { ...q, attempts: q.attempts + 1 } : q))
}

/**
 * Drop everything belonging to a workout. Discarding a session must not leave
 * writes in flight against a row that no longer exists — they would fail on
 * the foreign key forever and surface as an error about a workout the user
 * deliberately threw away.
 */
export function dropForWorkout(queue: QueuedWrite[], workoutId: string): QueuedWrite[] {
  return queue.filter((q) => q.workoutId !== workoutId)
}

/** True while the insert that creates this workout has not landed yet. */
export function hasPendingStart(queue: QueuedWrite[], workoutId: string): boolean {
  return queue.some((q) => q.kind === 'workout-start' && q.workoutId === workoutId)
}

/**
 * Everything a discard does to the queue, in one decision.
 *
 * A workout whose own start op is still queued has never existed anywhere but
 * this device: dropping its writes IS the discard, and queuing a delete for a
 * row the server has never seen would be a request that can only 404. A
 * workout that already landed needs the delete, and it goes on after the drop
 * so it does not remove itself.
 */
export function discardWrites(
  queue: QueuedWrite[],
  workoutId: string,
): { queue: QueuedWrite[]; needsServerDelete: boolean } {
  const neverLanded = hasPendingStart(queue, workoutId)
  const rest = dropForWorkout(queue, workoutId)
  if (neverLanded) return { queue: rest, needsServerDelete: false }
  return {
    queue: [
      ...rest,
      { kind: 'workout-discard', id: discardOpId(workoutId), workoutId, attempts: 0 },
    ],
    needsServerDelete: true,
  }
}

/** The next write to attempt: oldest first, so sets land in the order performed. */
export function head(queue: QueuedWrite[]): QueuedWrite | null {
  return queue[0] ?? null
}

/** Sets waiting to be written — the only count worth showing a lifter. */
export function pendingSetCount(queue: QueuedWrite[]): number {
  return queue.filter((q) => q.kind === 'set').length
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

export type FailureKind = 'landed' | 'offline' | 'rejected'

/**
 * Why a write did not land — and the distinction the whole offline story rests
 * on.
 *
 * Before U3b every failure was the same failure, so walking into a gym
 * basement produced three fast retries and then an error banner over a board
 * somebody was lifting from. That is precisely the interruption §2.1 forbids,
 * and it was wrong on the facts too: nothing had failed. There was no network.
 *
 * `offline` writes do not count attempts and are never surfaced — the queue
 * waits for a connection instead. `rejected` means the server answered and
 * said no (RLS, a constraint, a bad payload), which is a real failure that
 * retrying may not fix and the user eventually deserves to hear about.
 *
 * Matching on the message rather than a status because that is all there is:
 * supabase-js turns a failed `fetch` into `{ message: 'TypeError: Failed to
 * fetch' }` with no code and no status, and Safari words the same condition
 * "Load failed".
 */
export function classifyFailure(
  error: { code?: string | null; message?: string | null; status?: number } | null,
): FailureKind {
  if (isAlreadyLanded(error)) return 'landed'
  if (!error) return 'rejected'
  // Any HTTP status at all means a server answered, whatever it said.
  if (typeof error.status === 'number' && error.status > 0) return 'rejected'
  const message = String(error.message ?? '')
  return /failed to fetch|networkerror|network request failed|load failed/i.test(
    message,
  )
    ? 'offline'
    : 'rejected'
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
