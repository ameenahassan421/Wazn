import { describe, expect, it } from 'vitest'
import {
  isAbandonedWorkout,
  CHECKPOINT_KEY,
  CHECKPOINT_VERSION,
  MAX_AGE_MS,
  clear,
  decode,
  encode,
  isStale,
  isUsable,
  load,
  pendingQueue,
  save,
} from './checkpoint'
import type { WorkoutCheckpoint } from './checkpoint'
import type { QueuedSet } from './write-queue'

const queued: QueuedSet = {
  kind: 'set',
  id: 'set-1',
  workoutId: 'w1',
  exerciseId: 'ex-1',
  setNumber: 1,
  weightKg: 100,
  reps: 8,
  setType: 'normal',
  rpe: null,
  supersetGroup: null,
  attempts: 0,
}

const body = {
  workoutId: 'w1',
  savedAt: 1_000_000,
  queue: [queued],
  order: ['ex-1', 'ex-2'],
  extraRows: [['ex-1', 2]] as [string, number][],
  removed: ['ex-9'],
}

/** A Storage that behaves, and one that does not. */
function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  }
}

function hostileStorage(): Storage {
  return {
    length: 0,
    clear: () => {
      throw new Error('nope')
    },
    getItem: () => {
      throw new Error('nope')
    },
    key: () => null,
    removeItem: () => {
      throw new Error('nope')
    },
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
  }
}

describe('encode / decode', () => {
  it('round-trips a checkpoint', () => {
    expect(decode(encode(body))).toEqual({ version: CHECKPOINT_VERSION, ...body })
  })

  it('returns null for anything it cannot vouch for, and never throws', () => {
    expect(decode(null)).toBeNull()
    expect(decode('')).toBeNull()
    expect(decode('not json')).toBeNull()
    expect(decode('null')).toBeNull()
    expect(decode('[]')).toBeNull()
    expect(decode('{"version":99,"workoutId":"w1","savedAt":1}')).toBeNull()
    expect(decode('{"version":1,"savedAt":1}')).toBeNull()
    expect(decode('{"version":1,"workoutId":"w1"}')).toBeNull()
  })

  it('drops a half-written queue entry rather than sending it', () => {
    // A write missing `reps` is a row Postgres refuses forever, and the queue
    // would never drain past it.
    const raw = JSON.stringify({
      version: 1,
      workoutId: 'w1',
      savedAt: 1,
      queue: [queued, { id: 'broken', workoutId: 'w1' }],
    })
    expect(decode(raw)?.queue).toEqual([queued])
  })

  it('still reads a version-1 checkpoint, whose queue was sets and only sets', () => {
    // The user this protects is the one mid-workout when the update lands.
    // v1 wrote no `kind` at all, so the absence of one means 'set'.
    const { kind: _kind, ...v1Set } = queued
    const raw = JSON.stringify({
      version: 1,
      workoutId: 'w1',
      savedAt: 1,
      queue: [v1Set],
    })
    expect(decode(raw)?.queue).toEqual([queued])
  })

  it('carries the workout ops the offline queue added in U3b', () => {
    const ops = [
      {
        kind: 'workout-start',
        id: 'w1',
        workoutId: 'w1',
        userId: 'u1',
        startedAt: '2026-08-08T17:00:00Z',
        name: null,
        routineId: null,
        attempts: 0,
      },
      {
        kind: 'workout-finish',
        id: 'finish:w1',
        workoutId: 'w1',
        endedAt: '2026-08-08T18:00:00Z',
        attempts: 0,
      },
      { kind: 'workout-discard', id: 'discard:w2', workoutId: 'w2', attempts: 0 },
    ]
    expect(decode(encode({ ...body, queue: ops as never }))?.queue).toEqual(ops)
  })

  it('drops an op whose kind it has never heard of', () => {
    const raw = JSON.stringify({
      version: CHECKPOINT_VERSION,
      workoutId: 'w1',
      savedAt: 1,
      queue: [{ kind: 'delete-account', id: 'x', workoutId: 'w1', attempts: 0 }],
    })
    expect(decode(raw)?.queue).toEqual([])
  })

  it('drops a set whose type is not one of the four', () => {
    const raw = JSON.stringify({
      version: CHECKPOINT_VERSION,
      workoutId: 'w1',
      savedAt: 1,
      queue: [{ ...queued, setType: 'superset' }],
    })
    expect(decode(raw)?.queue).toEqual([])
  })

  it('survives the client-state fields being absent or the wrong type', () => {
    const raw = JSON.stringify({
      version: 1,
      workoutId: 'w1',
      savedAt: 1,
      order: 'not an array',
      extraRows: [['ok', 1], ['bad'], 7],
      removed: ['a', 5],
    })
    const out = decode(raw)
    expect(out?.order).toEqual([])
    expect(out?.extraRows).toEqual([['ok', 1]])
    expect(out?.removed).toEqual(['a'])
  })
})

describe('isStale', () => {
  it('is fresh inside the window', () => {
    expect(
      isStale({ version: CHECKPOINT_VERSION, ...body }, body.savedAt + MAX_AGE_MS - 1),
    ).toBe(false)
  })

  it('ages out past it — a queue from yesterday belongs to a finished session', () => {
    expect(
      isStale({ version: CHECKPOINT_VERSION, ...body }, body.savedAt + MAX_AGE_MS + 1),
    ).toBe(true)
  })

  it('does not discard a live queue because the clock moved backwards', () => {
    expect(
      isStale({ version: CHECKPOINT_VERSION, ...body }, body.savedAt - 60_000),
    ).toBe(false)
  })
})

describe('isUsable', () => {
  const cp: WorkoutCheckpoint = { version: CHECKPOINT_VERSION, ...body }

  it('restores a checkpoint for the workout the server just handed us', () => {
    expect(isUsable(cp, 'w1', body.savedAt)).toBe(true)
  })

  it('ignores one for a different workout — that session ended elsewhere', () => {
    expect(isUsable(cp, 'w2', body.savedAt)).toBe(false)
  })

  it('ignores everything when there is no open workout', () => {
    expect(isUsable(cp, null, body.savedAt)).toBe(false)
  })

  it('ignores a stale one', () => {
    expect(isUsable(cp, 'w1', body.savedAt + MAX_AGE_MS + 1)).toBe(false)
  })

  it('ignores nothing at all', () => {
    expect(isUsable(null, 'w1', 0)).toBe(false)
  })
})

/*
 * The queue a checkpoint carries, which is NOT gated on `isUsable`.
 *
 * GATE 4 failed on exactly this distinction. `isUsable` asks "does this
 * checkpoint describe the workout the server just handed us", and for a
 * workout logged in airplane mode the answer is permanently no — the server
 * has never heard of it. Gating the queue on that question makes the
 * synchronous copy unreadable in the one case it exists for.
 */
describe('pendingQueue', () => {
  const cp: WorkoutCheckpoint = { version: CHECKPOINT_VERSION, ...body }

  it('hands back the queue when no workout is open at all', () => {
    // The airplane-mode case: nothing of this session ever reached the server,
    // so there is no active id to match and never will be.
    expect(pendingQueue(cp, body.savedAt)).toEqual([queued])
  })

  it('hands back the queue when the checkpoint is for another workout', () => {
    // An undelivered write outlives the workout it belongs to. Dropping it
    // because a different session is open would lose a set that was performed.
    expect(pendingQueue(cp, body.savedAt)).toEqual([queued])
  })

  it('drops a queue that has aged out, on the checkpoint’s own bound', () => {
    expect(pendingQueue(cp, body.savedAt + MAX_AGE_MS + 1)).toEqual([])
  })

  it('keeps a queue right up to the bound', () => {
    expect(pendingQueue(cp, body.savedAt + MAX_AGE_MS - 1)).toEqual([queued])
  })

  it('is empty rather than throwing when there is no checkpoint', () => {
    expect(pendingQueue(null, 0)).toEqual([])
  })
})

describe('storage, guarded', () => {
  it('round-trips through a real Storage under its own key', () => {
    const storage = memoryStorage()
    save(storage, body)
    expect(storage.getItem(CHECKPOINT_KEY)).toBeTruthy()
    expect(load(storage)?.workoutId).toBe('w1')
    clear(storage)
    expect(load(storage)).toBeNull()
  })

  /**
   * Safari in private mode throws on setItem once the quota is reached. A
   * throw on the commit path would take down the set the checkpoint exists to
   * protect — losing the checkpoint costs the pending queue, throwing costs
   * the workout.
   */
  it('never throws when storage does', () => {
    const storage = hostileStorage()
    expect(() => save(storage, body)).not.toThrow()
    expect(() => load(storage)).not.toThrow()
    expect(() => clear(storage)).not.toThrow()
    expect(load(storage)).toBeNull()
  })

  it('is a no-op when there is no storage at all', () => {
    expect(() => save(null, body)).not.toThrow()
    expect(load(null)).toBeNull()
    expect(() => clear(null)).not.toThrow()
  })
})

/*
 * The rule that decides whether a workout row is destroyed.
 *
 * It replaced an unmount-time sweep that could not tell "abandoned" from
 * "went to check a setting", and so deleted a session somebody was about to
 * come back to. Both halves matter, which is why both are asserted.
 */
describe('isAbandonedWorkout', () => {
  const HOUR = 60 * 60 * 1000
  const now = Date.parse('2026-08-14T12:00:00.000Z')
  const ago = (ms: number) => new Date(now - ms).toISOString()

  it('leaves a workout alone while anything is logged in it, however old', () => {
    expect(isAbandonedWorkout(ago(48 * HOUR), 1, now)).toBe(false)
  })

  it('leaves a fresh empty workout alone — this is the Settings-visit case', () => {
    expect(isAbandonedWorkout(ago(30 * 1000), 0, now)).toBe(false)
    expect(isAbandonedWorkout(ago(11 * HOUR), 0, now)).toBe(false)
  })

  it('sweeps an empty workout once the checkpoint has given up on it', () => {
    expect(isAbandonedWorkout(ago(13 * HOUR), 0, now)).toBe(true)
  })

  it('does not treat an unreadable date as evidence of abandonment', () => {
    expect(isAbandonedWorkout('not a date', 0, now)).toBe(false)
  })
})
