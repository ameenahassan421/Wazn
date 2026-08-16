import { describe, expect, it } from 'vitest'
import {
  MAX_SILENT_ATTEMPTS,
  ack,
  classifyFailure,
  discardOpId,
  discardWrites,
  dropForWorkout,
  enqueue,
  finishOpId,
  hasPendingStart,
  head,
  isAlreadyLanded,
  newId,
  pendingSetCount,
  retry,
  retryDelayMs,
  shouldSurface,
} from '@wazn/core/write-queue'
import type { QueuedSet, QueuedWorkoutStart, QueuedWrite } from '@wazn/core/write-queue'

const item = (id: string, workoutId = 'w1'): QueuedSet => ({
  kind: 'set',
  id,
  workoutId,
  exerciseId: 'ex-1',
  setNumber: 1,
  weightKg: 100,
  reps: 8,
  setType: 'normal',
  rpe: null,
  supersetGroup: null,
  attempts: 0,
})

const start = (workoutId = 'w1'): QueuedWorkoutStart => ({
  kind: 'workout-start',
  id: workoutId,
  workoutId,
  userId: 'u1',
  startedAt: '2026-08-08T17:00:00Z',
  name: null,
  routineId: null,
  attempts: 0,
})

describe('enqueue', () => {
  it('appends, so sets land in the order they were performed', () => {
    const q = enqueue(enqueue([], item('a')), item('b'))
    expect(q.map((i) => i.id)).toEqual(['a', 'b'])
    expect(head(q)?.id).toBe('a')
  })

  it('refuses the same id twice — that is a bug upstream, not a second set', () => {
    const q = enqueue(enqueue([], item('a')), item('a'))
    expect(q).toHaveLength(1)
  })

  it('does not mutate the queue it is given', () => {
    const q: QueuedWrite[] = []
    enqueue(q, item('a'))
    expect(q).toEqual([])
  })

  /**
   * The invariant that makes an offline workout possible at all.
   * `workout_sets.workout_id` references `workouts`, so the insert that
   * creates the session has to stay in front of every set in it. The queue
   * drains head-first and retries a failed head rather than skipping it, so
   * appending IS the foreign-key guarantee.
   */
  it('keeps the workout insert in front of the sets that reference it', () => {
    const q = enqueue(enqueue(enqueue([], start()), item('a')), item('b'))
    expect(q.map((i) => i.kind)).toEqual(['workout-start', 'set', 'set'])
  })
})

describe('ack and retry', () => {
  it('removes an acknowledged write', () => {
    const q = enqueue(enqueue([], item('a')), item('b'))
    expect(ack(q, 'a').map((i) => i.id)).toEqual(['b'])
  })

  it('counts a failure without losing the write', () => {
    const q = retry(enqueue([], item('a')), 'a')
    expect(q).toHaveLength(1)
    expect(q[0].attempts).toBe(1)
  })

  it('leaves other writes untouched', () => {
    const q = retry(enqueue(enqueue([], item('a')), item('b')), 'a')
    expect(q[1].attempts).toBe(0)
  })
})

describe('dropForWorkout', () => {
  it('drops a discarded workout’s writes and keeps everything else', () => {
    const q = enqueue(enqueue([], item('a', 'w1')), item('b', 'w2'))
    expect(dropForWorkout(q, 'w1').map((i) => i.id)).toEqual(['b'])
  })

  it('takes the workout’s own start and finish ops with it', () => {
    const q: QueuedWrite[] = [
      start('w1'),
      item('a', 'w1'),
      {
        kind: 'workout-finish',
        id: finishOpId('w1'),
        workoutId: 'w1',
        endedAt: 'x',
        attempts: 0,
      },
      item('b', 'w2'),
    ]
    expect(dropForWorkout(q, 'w1').map((i) => i.id)).toEqual(['b'])
  })
})

describe('discardWrites', () => {
  /**
   * A workout discarded before its own insert drained has never existed
   * anywhere but this device. Sending a delete for it would be a request that
   * can only fail, about a row nobody has ever seen.
   */
  it('sends nothing for a workout the server has never seen', () => {
    const q = enqueue(enqueue([], start('w1')), item('a', 'w1'))
    const out = discardWrites(q, 'w1')
    expect(out.queue).toEqual([])
    expect(out.needsServerDelete).toBe(false)
  })

  it('queues the delete for a workout that already landed', () => {
    const q = enqueue(enqueue([], item('a', 'w1')), item('b', 'w2'))
    const out = discardWrites(q, 'w1')
    expect(out.needsServerDelete).toBe(true)
    expect(out.queue.map((i) => i.id)).toEqual(['b', discardOpId('w1')])
  })

  it('does not leave the delete op to delete itself', () => {
    // The drop runs first, so a second discard of the same workout is a
    // no-op rather than an op that removes the op that would have worked.
    const once = discardWrites([item('a', 'w1')], 'w1')
    const twice = discardWrites(once.queue, 'w1')
    expect(twice.queue.filter((w) => w.kind === 'workout-discard')).toHaveLength(1)
  })
})

describe('hasPendingStart and pendingSetCount', () => {
  it('knows whether the workout row exists on the server yet', () => {
    expect(hasPendingStart([start('w1'), item('a')], 'w1')).toBe(true)
    expect(hasPendingStart([item('a')], 'w1')).toBe(false)
  })

  it('counts sets only — a lifter does not care about the finish op', () => {
    const q: QueuedWrite[] = [
      start('w1'),
      item('a'),
      item('b'),
      {
        kind: 'workout-finish',
        id: finishOpId('w1'),
        workoutId: 'w1',
        endedAt: 'x',
        attempts: 0,
      },
    ]
    expect(pendingSetCount(q)).toBe(2)
  })
})

describe('retry policy', () => {
  it('backs off exponentially and then stops growing', () => {
    expect(retryDelayMs(1)).toBe(400)
    expect(retryDelayMs(2)).toBe(800)
    expect(retryDelayMs(3)).toBe(1600)
    // A retry an hour into the future is not a retry, it is a loss.
    expect(retryDelayMs(20)).toBe(15_000)
  })

  it('stays silent through the failures that self-correct', () => {
    expect(shouldSurface(0)).toBe(false)
    expect(shouldSurface(MAX_SILENT_ATTEMPTS - 1)).toBe(false)
  })

  it('speaks up once the app has genuinely stopped saving', () => {
    expect(shouldSurface(MAX_SILENT_ATTEMPTS)).toBe(true)
  })
})

describe('isAlreadyLanded', () => {
  /**
   * The single assertion that stops a restored queue turning one set into two.
   * The id is the primary key, so a replay of a write that already landed is
   * refused by Postgres — and that refusal means success.
   */
  it('reads a primary-key violation as "the server already has it"', () => {
    expect(isAlreadyLanded({ code: '23505' })).toBe(true)
  })

  it('does not swallow any other failure', () => {
    expect(isAlreadyLanded({ code: '23503' })).toBe(false)
    expect(isAlreadyLanded({ code: '42501' })).toBe(false)
    expect(isAlreadyLanded({})).toBe(false)
    expect(isAlreadyLanded(null)).toBe(false)
  })
})

describe('classifyFailure', () => {
  /**
   * The distinction the whole offline story rests on. Before it, walking into
   * a basement gym produced three fast retries and an error banner over a
   * board somebody was lifting from — the interruption §2.1 forbids, and wrong
   * on the facts: nothing had failed, there was no network.
   */
  it('reads a dead radio as offline, in both browsers’ wording', () => {
    expect(classifyFailure({ message: 'TypeError: Failed to fetch' })).toBe('offline')
    expect(classifyFailure({ message: 'Load failed' })).toBe('offline')
    expect(classifyFailure({ message: 'NetworkError when attempting to fetch' })).toBe(
      'offline',
    )
  })

  it('reads a server that answered as a rejection, whatever it said', () => {
    expect(classifyFailure({ code: '42501', message: 'permission denied' })).toBe(
      'rejected',
    )
    expect(classifyFailure({ code: '23503', message: 'foreign key' })).toBe('rejected')
    expect(classifyFailure(null)).toBe('rejected')
  })

  it('does not mistake an HTTP error for a missing network', () => {
    // A 503 body can say almost anything. The status is proof a server spoke.
    expect(classifyFailure({ status: 503, message: 'network is unavailable' })).toBe(
      'rejected',
    )
  })

  it('still reports a replayed write as landed', () => {
    expect(classifyFailure({ code: '23505', message: 'duplicate key' })).toBe('landed')
  })
})

describe('newId', () => {
  it('is a v4-shaped uuid', () => {
    expect(newId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 500 }, newId))
    expect(ids.size).toBe(500)
  })
})
