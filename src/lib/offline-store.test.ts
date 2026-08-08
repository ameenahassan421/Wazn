import { describe, expect, it } from 'vitest'
import { memoryStore } from './idb'
import {
  CACHE_MAX_AGE_MS,
  QUEUE_MAX_AGE_MS,
  forget,
  getQueue,
  getSnapshot,
  mergeQueues,
  putQueue,
  putSnapshot,
  withDeadline,
} from './offline-store'
import type { QueuedSet, QueuedWrite } from './write-queue'

const ME = 'user-a'
const THEM = 'user-b'

const set = (id: string, workoutId = 'w1'): QueuedSet => ({
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

describe('snapshots', () => {
  it('round-trips a value with the time it was true', async () => {
    const store = memoryStore()
    await putSnapshot(store, ME, 'catalogue', { exercises: 3 }, 1000)
    expect(await getSnapshot(store, ME, 'catalogue', 2000)).toEqual({
      value: { exercises: 3 },
      savedAt: 1000,
    })
  })

  /**
   * One phone, two accounts — production has already seen one Gmail inbox make
   * two Wazn accounts. Cached training data belongs to exactly one of them.
   */
  it('will not hand one account’s training data to another', async () => {
    const store = memoryStore()
    await putSnapshot(store, ME, 'catalogue', { exercises: 3 }, 1000)
    expect(await getSnapshot(store, THEM, 'catalogue', 2000)).toBeNull()
  })

  it('discards a read too old to be worth showing', async () => {
    const store = memoryStore()
    await putSnapshot(store, ME, 'catalogue', 'x', 0)
    expect(
      await getSnapshot(store, ME, 'catalogue', CACHE_MAX_AGE_MS - 1),
    ).not.toBeNull()
    expect(await getSnapshot(store, ME, 'catalogue', CACHE_MAX_AGE_MS + 1)).toBeNull()
  })

  it('returns null for a key nothing has written', async () => {
    expect(await getSnapshot(memoryStore(), ME, 'nothing')).toBeNull()
  })

  it('is a no-op without a store, rather than a crash', async () => {
    await expect(putSnapshot(null, ME, 'catalogue', 1)).resolves.toBeUndefined()
    expect(await getSnapshot(null, ME, 'catalogue')).toBeNull()
    expect(await getQueue(null, ME)).toEqual([])
    await expect(forget(null)).resolves.toBeUndefined()
  })
})

describe('the durable queue', () => {
  it('round-trips writes', async () => {
    const store = memoryStore()
    await putQueue(store, ME, [set('a'), set('b')], 1000)
    expect((await getQueue(store, ME, 1000)).map((w) => w.id)).toEqual(['a', 'b'])
  })

  it('re-validates what it reads back rather than trusting the store', async () => {
    const store = memoryStore()
    // A half-written entry is a row Postgres refuses forever, and the queue
    // drains head-first, so keeping it would stall every write behind it.
    await store.set('queue', {
      userId: ME,
      savedAt: 1000,
      value: [set('a'), { id: 'broken', workoutId: 'w1' }],
    })
    expect((await getQueue(store, ME, 1000)).map((w) => w.id)).toEqual(['a'])
  })

  it('does not replay a queue from a session that ended yesterday', async () => {
    const store = memoryStore()
    await putQueue(store, ME, [set('a')], 0)
    expect(await getQueue(store, ME, QUEUE_MAX_AGE_MS - 1)).toHaveLength(1)
    expect(await getQueue(store, ME, QUEUE_MAX_AGE_MS + 1)).toEqual([])
  })

  it('does not replay another account’s writes', async () => {
    const store = memoryStore()
    await putQueue(store, ME, [set('a')], 1000)
    expect(await getQueue(store, THEM, 1000)).toEqual([])
  })

  it('forgets everything when the signed-in user changes', async () => {
    const store = memoryStore()
    await putQueue(store, ME, [set('a')], 1000)
    await putSnapshot(store, ME, 'catalogue', 'x', 1000)
    await forget(store)
    expect(await getQueue(store, ME, 1000)).toEqual([])
    expect(await getSnapshot(store, ME, 'catalogue', 1000)).toBeNull()
  })
})

describe('withDeadline', () => {
  it('passes the value straight through when it arrives in time', async () => {
    expect(await withDeadline(Promise.resolve('rows'), 50)).toBe('rows')
  })

  /**
   * The case the screenshot harness caught: a network that accepts and then
   * goes quiet never rejects, so `Promise.all` never settles and the Log tab
   * sits on "Loading…" with a full cache on the device beside it.
   */
  it('gives up on a promise that never settles', async () => {
    expect(await withDeadline(new Promise(() => {}), 10)).toBeNull()
  })

  it('treats a rejection as nothing rather than letting it escape', async () => {
    // A throw out of the load path would leave `loading` true forever, which
    // is the same stuck screen by another route.
    await expect(
      withDeadline(Promise.reject(new Error('nope')), 50),
    ).resolves.toBeNull()
  })

  it('drops a late answer instead of drawing over the fallback', async () => {
    let settle: (v: string) => void = () => {}
    const slow = new Promise<string>((resolve) => (settle = resolve))
    const result = withDeadline(slow, 10)
    await new Promise((r) => setTimeout(r, 30))
    settle('too late')
    expect(await result).toBeNull()
  })
})

describe('mergeQueues', () => {
  /**
   * Two durable copies exist on purpose: localStorage writes synchronously and
   * so survives a hard kill mid-write, IndexedDB holds the volume. Merging
   * needs no cleverness because the id is the primary key — the same id is the
   * same write, and even a double send is refused rather than doubled.
   */
  it('keeps the order of whichever copy saw more writes', () => {
    const idb = [set('a'), set('b'), set('c')]
    const checkpoint = [set('c'), set('a')]
    expect(mergeQueues(idb, checkpoint).map((w) => w.id)).toEqual(['a', 'b', 'c'])
    expect(mergeQueues(checkpoint, idb).map((w) => w.id)).toEqual(['a', 'b', 'c'])
  })

  it('keeps a write that only one copy has — the user still did that set', () => {
    const merged = mergeQueues([set('a'), set('b')], [set('c')])
    expect(merged.map((w) => w.id)).toEqual(['a', 'b', 'c'])
  })

  it('handles either side being empty', () => {
    const only: QueuedWrite[] = [set('a')]
    expect(mergeQueues(only, [])).toEqual(only)
    expect(mergeQueues([], only)).toEqual(only)
    expect(mergeQueues([], [])).toEqual([])
  })
})
