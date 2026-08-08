import type { QueuedSet } from './write-queue'

/**
 * The in-progress workout checkpoint — trust-ladder rung 1.
 *
 * "Losing a logged set once is how you lose the user" (wellness-app-design,
 * §4). Committed sets already survive a refresh because Postgres has them; the
 * two things that did not survive anything are the writes still in flight
 * (rung 2's queue) and the board's client-only state — block order when
 * migration 0020 is not applied, rows added past the plan, exercises taken off
 * the board. Kill the tab between a check and its ack and, before this, that
 * set was simply gone.
 *
 * localStorage rather than IndexedDB deliberately: this is a few hundred bytes
 * written on every commit, and it must be readable *synchronously* during the
 * load path so nothing renders a board that is about to change under it.
 * IndexedDB arrives in U3b, for the offline queue, where the volume and the
 * async access pattern actually justify it.
 *
 * Every function here is total. A checkpoint is read from storage that a user,
 * a browser upgrade or a previous version of this app may have written, so
 * `decode` treats every field as hostile and returns null rather than throwing
 * — a corrupt checkpoint must cost the client state it held, never the screen.
 */

export const CHECKPOINT_KEY = 'wazn.workout.v1'

/**
 * Bumped when the shape changes. A mismatch is discarded rather than migrated:
 * the whole payload is reconstructible from the server plus one session of
 * lost preferences, so migration code would be more risk than the data is
 * worth.
 */
export const CHECKPOINT_VERSION = 1

/**
 * A checkpoint older than this is not restored.
 *
 * A queue from three days ago belongs to a workout that has since been
 * finished or abandoned on another device, and replaying it would insert sets
 * into a session the user considers over. Twelve hours is longer than any
 * workout and shorter than any gap between them.
 */
export const MAX_AGE_MS = 12 * 60 * 60 * 1000

export interface WorkoutCheckpoint {
  version: number
  workoutId: string
  /** Epoch milliseconds. Compared against a clock the caller supplies. */
  savedAt: number
  /** Writes that had not been acknowledged when this was written. */
  queue: QueuedSet[]
  /** Block order — the only copy of it when migration 0020 is unapplied. */
  order: string[]
  /** Rows added past the plan, per exercise. */
  extraRows: [string, number][]
  /** Exercises taken off the board. */
  removed: string[]
}

export function encode(checkpoint: Omit<WorkoutCheckpoint, 'version'>): string {
  return JSON.stringify({ ...checkpoint, version: CHECKPOINT_VERSION })
}

const isString = (v: unknown): v is string => typeof v === 'string'

function decodeQueue(value: unknown): QueuedSet[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is QueuedSet => {
    if (typeof item !== 'object' || item === null) return false
    const q = item as Partial<QueuedSet>
    // Every field the insert needs. A half-written entry is dropped rather
    // than sent, because a write missing `reps` is a row Postgres will refuse
    // forever and the queue would never drain past it.
    return (
      isString(q.id) &&
      isString(q.workoutId) &&
      isString(q.exerciseId) &&
      typeof q.setNumber === 'number' &&
      typeof q.reps === 'number' &&
      isString(q.setType) &&
      typeof q.attempts === 'number' &&
      (q.weightKg === null || typeof q.weightKg === 'number') &&
      (q.rpe === null || typeof q.rpe === 'number') &&
      (q.supersetGroup === null || typeof q.supersetGroup === 'number')
    )
  })
}

/** Null for anything this version cannot vouch for. Never throws. */
export function decode(raw: string | null | undefined): WorkoutCheckpoint | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null

  const c = parsed as Partial<WorkoutCheckpoint>
  if (c.version !== CHECKPOINT_VERSION) return null
  if (!isString(c.workoutId) || typeof c.savedAt !== 'number') return null

  return {
    version: CHECKPOINT_VERSION,
    workoutId: c.workoutId,
    savedAt: c.savedAt,
    queue: decodeQueue(c.queue),
    order: Array.isArray(c.order) ? c.order.filter(isString) : [],
    extraRows: Array.isArray(c.extraRows)
      ? c.extraRows.filter(
          (e): e is [string, number] =>
            Array.isArray(e) && isString(e[0]) && typeof e[1] === 'number',
        )
      : [],
    removed: Array.isArray(c.removed) ? c.removed.filter(isString) : [],
  }
}

export function isStale(
  checkpoint: WorkoutCheckpoint,
  nowMs: number,
  maxAgeMs = MAX_AGE_MS,
): boolean {
  // A savedAt in the future means a clock change, not a fresh checkpoint. Trust
  // it rather than discard it: the alternative is throwing away a live queue
  // because the phone crossed a timezone.
  return nowMs - checkpoint.savedAt > maxAgeMs
}

/**
 * Restore only if it belongs to the workout the server just handed us and has
 * not aged out. A checkpoint for a different workout is not wrong, it is
 * finished — the session it described ended somewhere this tab did not see.
 */
export function isUsable(
  checkpoint: WorkoutCheckpoint | null,
  activeWorkoutId: string | null,
  nowMs: number,
): checkpoint is WorkoutCheckpoint {
  if (!checkpoint || !activeWorkoutId) return false
  if (checkpoint.workoutId !== activeWorkoutId) return false
  return !isStale(checkpoint, nowMs)
}

/* ── Storage, guarded ──────────────────────────────────────────────────────
   Safari in private mode throws on `setItem` once the quota is reached, and a
   throw on the commit path would take down the set the checkpoint exists to
   protect. Storage is best-effort by construction here: losing it costs the
   pending queue, and throwing costs the workout. */

export function save(
  storage: Storage | null,
  checkpoint: Omit<WorkoutCheckpoint, 'version'>,
) {
  if (!storage) return
  try {
    storage.setItem(CHECKPOINT_KEY, encode(checkpoint))
  } catch {
    // Full, disabled, or private mode. Nothing to do and nothing worth saying.
  }
}

export function load(storage: Storage | null): WorkoutCheckpoint | null {
  if (!storage) return null
  try {
    return decode(storage.getItem(CHECKPOINT_KEY))
  } catch {
    return null
  }
}

/**
 * `window.localStorage` where it exists and is reachable.
 *
 * Merely *touching* the property throws in a Safari private window and in a
 * third-party iframe with storage blocked, so the access itself is guarded and
 * not only the reads and writes that follow it.
 */
export function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function clear(storage: Storage | null) {
  if (!storage) return
  try {
    storage.removeItem(CHECKPOINT_KEY)
  } catch {
    // Same posture as save.
  }
}
