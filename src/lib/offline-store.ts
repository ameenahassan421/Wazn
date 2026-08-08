import { decodeQueue } from './checkpoint'
import type { KeyValueStore } from './idb'
import type { QueuedWrite } from './write-queue'

/**
 * What Wazn keeps on the device — the durable half of trust-ladder rungs 3
 * and 4.
 *
 * Two things live here and they are there for different reasons:
 *
 *  - **The write queue.** The localStorage checkpoint already holds a copy,
 *    written synchronously so it survives a hard kill. This is the copy that
 *    survives *volume* and does not block the main thread on the commit path.
 *    The load path takes the union of both by id, which costs nothing because
 *    the id is the primary key and a replayed write is refused, not doubled.
 *
 *  - **The read cache.** A gym dead zone must not blank the exercise
 *    catalogue, the picker's ordering, or the previous-session ghosts that are
 *    most of the reason the board is worth looking at. Every successful load
 *    writes what it fetched; a load with no network reads it back and the
 *    screen says so, stamped with when it was last true.
 *
 * ── Everything is stamped with its owner ───────────────────────────────────
 * A phone can hold two accounts — production has already seen one Gmail inbox
 * make two Wazn accounts — and cached training data belongs to exactly one of
 * them. Every record carries the user id that wrote it and a read by anyone
 * else returns nothing. `forget` on top of that, called when the signed-in
 * user changes, so the bytes go rather than merely being unreadable.
 */

export interface Stamped<T> {
  userId: string
  savedAt: number
  value: T
}

export interface Snapshot<T> {
  value: T
  savedAt: number
}

export const QUEUE_KEY = 'queue'

/**
 * A queue older than this is not replayed.
 *
 * Same reasoning and same number as the checkpoint's: writes from three days
 * ago belong to a workout that has since been finished or abandoned on another
 * device, and replaying them would insert sets into a session the user
 * considers over. Twelve hours is longer than any workout and shorter than any
 * gap between them.
 */
export const QUEUE_MAX_AGE_MS = 12 * 60 * 60 * 1000

/**
 * A cached read older than this is discarded rather than shown.
 *
 * Deliberately generous. A stale catalogue is not a lie — an exercise list a
 * week old still logs a bench press — and the screen stamps what it is showing
 * either way. The bound exists so an account nobody has opened since spring
 * does not resume against a picker ordered by last year's habits.
 */
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function stamped<T>(raw: unknown, userId: string): Stamped<T> | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Partial<Stamped<T>>
  if (record.userId !== userId) return null
  if (typeof record.savedAt !== 'number') return null
  if (record.value === undefined) return null
  return { userId, savedAt: record.savedAt, value: record.value as T }
}

const cacheKey = (name: string) => `cache:${name}`

export async function putSnapshot(
  store: KeyValueStore | null,
  userId: string,
  name: string,
  value: unknown,
  nowMs: number = Date.now(),
): Promise<void> {
  if (!store) return
  await store.set(cacheKey(name), { userId, savedAt: nowMs, value })
}

/** The snapshot and when it was taken, or null if there is nothing usable. */
export async function getSnapshot<T>(
  store: KeyValueStore | null,
  userId: string,
  name: string,
  nowMs: number = Date.now(),
  maxAgeMs: number = CACHE_MAX_AGE_MS,
): Promise<Snapshot<T> | null> {
  if (!store) return null
  const record = stamped<T>(await store.get(cacheKey(name)), userId)
  if (!record) return null
  // A savedAt in the future is a clock change, not a fresh read. Kept, for the
  // same reason the checkpoint keeps one: throwing away real data because a
  // phone crossed a timezone is the worse failure.
  if (nowMs - record.savedAt > maxAgeMs) return null
  return { value: record.value, savedAt: record.savedAt }
}

export async function putQueue(
  store: KeyValueStore | null,
  userId: string,
  queue: QueuedWrite[],
  nowMs: number = Date.now(),
): Promise<void> {
  if (!store) return
  await store.set(QUEUE_KEY, { userId, savedAt: nowMs, value: queue })
}

/**
 * The queue as the device last knew it.
 *
 * Re-validated through `decodeQueue` rather than trusted: this is read back
 * from a store a browser may have half-written, a previous version of the app
 * may have shaped differently, and — since it is the thing that replays writes
 * — is the last place in the codebase where an unchecked cast is acceptable.
 */
export async function getQueue(
  store: KeyValueStore | null,
  userId: string,
  nowMs: number = Date.now(),
): Promise<QueuedWrite[]> {
  if (!store) return []
  const record = stamped<unknown>(await store.get(QUEUE_KEY), userId)
  if (!record) return []
  if (nowMs - record.savedAt > QUEUE_MAX_AGE_MS) return []
  return decodeQueue(record.value)
}

/** Everything, gone. Called when the signed-in user changes. */
export async function forget(store: KeyValueStore | null): Promise<void> {
  if (!store) return
  await store.clear()
}

/**
 * How long the load path waits for a network that has not said no.
 *
 * A dead radio fails fast and needs none of this. What needs it is the network
 * that accepts a connection and then goes quiet — a captive portal, a gym wifi
 * with no route out, or a service worker holding a request open — where
 * nothing ever rejects and `Promise.all` never settles. The Log tab then sits
 * on "Loading…" indefinitely, with a full offline cache on the device it is
 * refusing to look at.
 *
 * Found by the screenshot harness, which photographed exactly that: an offline
 * reopen showing "Loading…" six seconds in. Cold start is budgeted at 2s, so
 * six is far outside a working connection and well inside a lifter's patience.
 */
export const LOAD_DEADLINE_MS = 6000

/**
 * Resolve with the promise's value, or with `null` once the deadline passes.
 *
 * The abandoned promise is not cancelled — nothing here can cancel a fetch —
 * but its value is dropped, so a late answer cannot overwrite the screen the
 * fallback has already drawn.
 */
export function withDeadline<T>(
  promise: Promise<T>,
  ms: number = LOAD_DEADLINE_MS,
): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(null)
      },
    )
  })
}

/**
 * Merge the two durable copies of the queue: IndexedDB's and the checkpoint's.
 *
 * Order comes from whichever copy is longer, because order is what keeps the
 * foreign keys satisfied and the longer copy is the one that saw more writes.
 * Entries the other copy has and it does not are appended — a set that exists
 * in only one store is still a set the user performed.
 *
 * Deduplication is by id and needs no cleverness: the id is the primary key,
 * so two copies of one write are the same write, and even a double send is
 * refused by Postgres rather than doubling anything.
 */
export function mergeQueues(a: QueuedWrite[], b: QueuedWrite[]): QueuedWrite[] {
  const [longer, shorter] = a.length >= b.length ? [a, b] : [b, a]
  const seen = new Set(longer.map((w) => w.id))
  return [...longer, ...shorter.filter((w) => !seen.has(w.id))]
}
