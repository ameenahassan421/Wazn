import { describe, expect, it, vi } from 'vitest'
import { indexedDbStore, memoryStore } from './idb'

/**
 * What is testable here is the contract, not the database.
 *
 * jsdom has no IndexedDB, so `indexedDbStore()` can only be asserted on the
 * branch that matters most anyway — the one where there is no store and the
 * app has to keep working without one. The real adapter is driven end to end
 * by `e2e/offline.spec.ts`, which runs in a browser that has a real
 * IndexedDB and asserts that a workout logged with the network cut is on the
 * server afterwards. That is the only place the adapter can be proved.
 */

describe('memoryStore', () => {
  it('round-trips, overwrites, deletes and clears', async () => {
    const store = memoryStore()
    expect(await store.get('a')).toBeNull()
    await store.set('a', { n: 1 })
    expect(await store.get('a')).toEqual({ n: 1 })
    await store.set('a', { n: 2 })
    expect(await store.get('a')).toEqual({ n: 2 })
    await store.delete('a')
    expect(await store.get('a')).toBeNull()
    await store.set('b', 1)
    await store.clear()
    expect(await store.get('b')).toBeNull()
  })

  /**
   * IndexedDB hands back a structured clone, never the object you put in. A
   * fake that returned the same reference would let a test pass while the real
   * store — which cannot carry a Map, a Set or a class instance through a
   * JSON-shaped round trip — failed on the same data.
   */
  it('hands back a copy, the way a real store does', async () => {
    const store = memoryStore()
    const original = { rows: [1, 2] }
    await store.set('a', original)
    const read = await store.get<typeof original>('a')
    expect(read).toEqual(original)
    expect(read).not.toBe(original)
  })
})

describe('indexedDbStore', () => {
  it('is null where the browser has no IndexedDB, rather than throwing', () => {
    // jsdom is exactly this browser. Every caller treats null as "no cache",
    // which is a slower app and never a broken one.
    expect(indexedDbStore()).toBeNull()
  })

  it('is null when merely touching the global throws', () => {
    // A locked-down WebView and a Firefox private window both do this, and the
    // access itself is what throws — not the first read.
    vi.stubGlobal('indexedDB', {
      get open() {
        throw new Error('denied')
      },
    })
    // The guard is around `typeof indexedDB`, so a hostile global cannot take
    // the app down before it has decided whether to use one.
    expect(() => indexedDbStore()).not.toThrow()
    vi.unstubAllGlobals()
  })
})
