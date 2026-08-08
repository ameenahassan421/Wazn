/**
 * IndexedDB, as a key-value store and nothing more.
 *
 * ── Why raw IndexedDB and not `idb` ────────────────────────────────────────
 * The U3b prompt allows either and asks for a justification. `idb` is a good
 * library and this is not a criticism of it; it is the wrong trade here for
 * two reasons that both point the same way.
 *
 * First, the shape of what Wazn stores. There are no indexes, no cursors, no
 * ranges, no schema evolution — one object store, get/put/delete/clear, keyed
 * by a string. `idb`'s value is the promise wrapper and the typed cursor and
 * transaction ergonomics, and this file uses one of those three. The wrapper
 * is the forty lines below.
 *
 * Second, the budget. The precache ceiling (~600 KiB, parity plan §4) is the
 * binding constraint on this app right now: STATUS records it going over at
 * 604.98 KiB and being brought back to 592.20 KiB by dropping a chunk out of
 * the shell, leaving 7.8 KiB of headroom and an explicit warning that the next
 * UI phase should expect to remove something. Spending a meaningful slice of
 * that on a dependency that saves sixty lines of code we would have to read
 * anyway is the wrong direction. See DECISIONS.md.
 *
 * ── The backend is injectable, and that is the testing story ───────────────
 * Everything above `KeyValueStore` is pure logic about staleness, ownership
 * and shape, and it is unit-tested against `memoryStore()`. The IndexedDB
 * adapter itself is deliberately thin enough to read in one sitting, and the
 * real thing is exercised end to end by the airplane-mode Playwright run,
 * which is the only place a real IndexedDB exists anyway.
 */

export interface KeyValueStore {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}

const DB_NAME = 'wazn'
const DB_VERSION = 1
const STORE = 'kv'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    // Another tab is holding an old version open. Rejecting is right: the
    // caller falls back to no cache, which is a slower app, not a broken one.
    request.onblocked = () => reject(new Error('indexeddb blocked'))
  })
  // A failed open must not be remembered as the answer forever — a private
  // window that later becomes a normal one deserves a second attempt.
  dbPromise.catch(() => {
    dbPromise = null
  })
  return dbPromise
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  const db = await openDb()
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = fn(tx.objectStore(STORE))
    tx.onabort = () => reject(tx.error)
    tx.onerror = () => reject(tx.error)
    // Resolve on the TRANSACTION, not the request, for writes: a `put` reports
    // success the moment it is queued, and the point of this store is
    // durability across a tab that is about to die.
    tx.oncomplete = () => resolve((request.result as T) ?? null)
  })
}

/**
 * The browser's store, or null where there isn't one.
 *
 * Every call is guarded and every failure degrades to "no cache". Storage is
 * best-effort by construction: losing it costs an offline session's read
 * cache, and throwing on the commit path would cost the set.
 */
export function indexedDbStore(): KeyValueStore | null {
  try {
    if (typeof indexedDB === 'undefined') return null
  } catch {
    return null
  }
  const guard = async <T>(run: () => Promise<T | null>): Promise<T | null> => {
    try {
      return await run()
    } catch {
      return null
    }
  }
  return {
    get: <T>(key: string) =>
      guard<T>(() => withStore<T>('readonly', (s) => s.get(key))),
    set: async (key, value) => {
      await guard(() => withStore('readwrite', (s) => s.put(value, key)))
    },
    delete: async (key) => {
      await guard(() => withStore('readwrite', (s) => s.delete(key)))
    },
    clear: async () => {
      await guard(() => withStore('readwrite', (s) => s.clear()))
    },
  }
}

/** The same contract, in memory. Used by the unit tests and by nothing else. */
export function memoryStore(): KeyValueStore {
  const map = new Map<string, string>()
  return {
    // Round-tripped through JSON so a test cannot pass by handing back the
    // very object it stored — IndexedDB gives you a structured clone.
    get: async <T>(key: string) => {
      const raw = map.get(key)
      return raw === undefined ? null : (JSON.parse(raw) as T)
    },
    set: async (key, value) => {
      map.set(key, JSON.stringify(value))
    },
    delete: async (key) => {
      map.delete(key)
    },
    clear: async () => {
      map.clear()
    },
  }
}
