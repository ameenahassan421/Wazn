import { SET_TYPE_CYCLE } from './types'
import type { SetType } from './types'
import type { QueuedWrite } from './write-queue'

const isSetType = (v: unknown): v is SetType =>
  typeof v === 'string' && (SET_TYPE_CYCLE as string[]).includes(v)

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
 * ── Why this stayed in localStorage when U3b brought IndexedDB in ──────────
 * IndexedDB now holds the durable queue and the offline read cache
 * (`offline-store.ts`), which is where the volume is. This file did not move,
 * and the reason is the one thing localStorage does that IndexedDB cannot: it
 * writes *synchronously*. A transaction opened five milliseconds before the OS
 * kills a backgrounded tab may never commit; a `setItem` that returned has
 * already happened. So the two coexist deliberately — this is the last-gasp
 * copy, IndexedDB is the durable one, and the load path takes the union of
 * both by id, which the id-as-primary-key rule makes free of consequence.
 *
 * Every function here is total. A checkpoint is read from storage that a user,
 * a browser upgrade or a previous version of this app may have written, so
 * `decode` treats every field as hostile and returns null rather than throwing
 * — a corrupt checkpoint must cost the client state it held, never the screen.
 */

export const CHECKPOINT_KEY = 'wazn.workout.v1'

/**
 * Bumped when the shape changes.
 *
 * Version 2 (U3b) widened `queue` from sets to the full op log. Version 1 is
 * still accepted, and its entries are read as sets, because the one user this
 * costs is the one mid-workout when the update lands — exactly the person the
 * checkpoint exists for. Anything older or newer is discarded rather than
 * migrated: the payload is reconstructible from the server plus one session of
 * lost preferences, so migration code would be more risk than the data.
 */
export const CHECKPOINT_VERSION = 2

/**
 * A checkpoint older than this is not restored.
 *
 * A queue from three days ago belongs to a workout that has since been
 * finished or abandoned on another device, and replaying it would insert sets
 * into a session the user considers over. Twelve hours is longer than any
 * workout and shorter than any gap between them.
 */
export const MAX_AGE_MS = 12 * 60 * 60 * 1000

/**
 * Is this open workout an abandoned tap rather than a session in progress?
 *
 * A workout row exists from the moment Start is pressed, before any set. The
 * app used to delete empty ones when the Log screen unmounted, which meant
 * leaving that screen at all destroyed them — tapping the avatar to check a
 * setting between Start and the first set came back to nothing, because an
 * unmount cannot tell "abandoned" from "went to look at something".
 *
 * Age can. Two conditions, both required: nothing logged, and older than the
 * checkpoint's own expiry — past which the app has already stopped trying to
 * restore it. A pure function because it decides whether a row is destroyed,
 * and that rule should be readable and pinned rather than inline in a load.
 */
export function isAbandonedWorkout(
  startedAt: string,
  setCount: number,
  nowMs: number = Date.now(),
): boolean {
  if (setCount > 0) return false
  const started = new Date(startedAt).getTime()
  // An unparseable date is not evidence of abandonment.
  if (!Number.isFinite(started)) return false
  return nowMs - started > MAX_AGE_MS
}

export interface WorkoutCheckpoint {
  version: number
  workoutId: string
  /** Epoch milliseconds. Compared against a clock the caller supplies. */
  savedAt: number
  /** Writes that had not been acknowledged when this was written. */
  queue: QueuedWrite[]
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

/**
 * Validate one queued write, or drop it.
 *
 * A half-written entry is dropped rather than sent, because a write missing
 * `reps` is a row Postgres will refuse forever and the queue — which drains
 * strictly head-first to keep the foreign keys satisfied — would never get
 * past it. Losing one entry costs a set; keeping it costs the session.
 *
 * Exported because IndexedDB needs exactly the same scrutiny: the durable
 * queue is read back from a store the browser may have half-written too.
 */
export function decodeWrite(item: unknown): QueuedWrite | null {
  if (typeof item !== 'object' || item === null) return null
  const q = item as Record<string, unknown>
  // Version 1 wrote sets and nothing else, with no discriminant on them.
  const kind = q.kind === undefined ? 'set' : q.kind
  if (!isString(q.id) || !isString(q.workoutId)) return null
  if (typeof q.attempts !== 'number') return null
  const base = { id: q.id, workoutId: q.workoutId, attempts: q.attempts }

  if (kind === 'set') {
    if (
      !isString(q.exerciseId) ||
      typeof q.setNumber !== 'number' ||
      typeof q.reps !== 'number' ||
      !isSetType(q.setType) ||
      !(q.weightKg === null || typeof q.weightKg === 'number') ||
      !(q.rpe === null || typeof q.rpe === 'number') ||
      !(q.supersetGroup === null || typeof q.supersetGroup === 'number')
    ) {
      return null
    }
    return {
      kind: 'set',
      ...base,
      exerciseId: q.exerciseId,
      setNumber: q.setNumber,
      reps: q.reps,
      setType: q.setType,
      weightKg: q.weightKg,
      rpe: q.rpe,
      supersetGroup: q.supersetGroup,
    }
  }

  if (kind === 'workout-start') {
    if (!isString(q.userId) || !isString(q.startedAt)) return null
    return {
      kind: 'workout-start',
      ...base,
      userId: q.userId,
      startedAt: q.startedAt,
      name: isString(q.name) ? q.name : null,
      routineId: isString(q.routineId) ? q.routineId : null,
    }
  }

  if (kind === 'workout-finish') {
    if (!isString(q.endedAt)) return null
    return { kind: 'workout-finish', ...base, endedAt: q.endedAt }
  }

  if (kind === 'workout-discard') {
    return { kind: 'workout-discard', ...base }
  }

  return null
}

export function decodeQueue(value: unknown): QueuedWrite[] {
  if (!Array.isArray(value)) return []
  return value.map(decodeWrite).filter((write): write is QueuedWrite => write !== null)
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
  // v1 is read, not rejected: its queue entries are sets, and `decodeWrite`
  // says so. The user this protects is the one mid-workout when an update
  // lands, which is the exact person a checkpoint exists for.
  if (c.version !== CHECKPOINT_VERSION && c.version !== 1) return null
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

/**
 * The writes a checkpoint is still carrying, if it is recent enough to replay.
 *
 * Deliberately NOT gated on `isUsable`, and that is the whole point of this
 * function existing rather than the call sites reading `.queue` themselves.
 * `isUsable` asks "does this checkpoint describe the workout the server just
 * handed us", which is the right question for the board's arrangement — order,
 * extra rows, removals are meaningless against a different session — and the
 * wrong question for the queue.
 *
 * A queue is "writes this device has not delivered", full stop. Two cases the
 * `isUsable` gate got wrong, both of them losing a set that was performed:
 *
 *  - **Airplane mode.** A workout logged with no signal exists nowhere but this
 *    device, so the server can never hand back an active id to match — the
 *    answer is permanently no. That is precisely the case the synchronous
 *    checkpoint exists for (see the header above), and gating its queue on a
 *    server round trip made it unreadable there. GATE 4 failed on this.
 *  - **A newer session.** Finish one workout in a dead zone, start another; the
 *    first one's undelivered writes are not stale, they are just behind.
 *
 * Staleness still applies, on the checkpoint's own bound, which is the same
 * twelve hours `offline-store.ts` uses for the durable copy.
 */
export function pendingQueue(
  checkpoint: WorkoutCheckpoint | null,
  nowMs: number,
  maxAgeMs = MAX_AGE_MS,
): QueuedWrite[] {
  if (!checkpoint) return []
  return isStale(checkpoint, nowMs, maxAgeMs) ? [] : checkpoint.queue
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
