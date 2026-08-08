import { describe, expect, it } from 'vitest'
import {
  MAX_SILENT_ATTEMPTS,
  ack,
  dropForWorkout,
  enqueue,
  head,
  isAlreadyLanded,
  newId,
  retry,
  retryDelayMs,
  shouldSurface,
} from './write-queue'
import type { QueuedSet } from './write-queue'

const item = (id: string, workoutId = 'w1'): QueuedSet => ({
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
    const q: QueuedSet[] = []
    enqueue(q, item('a'))
    expect(q).toEqual([])
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
