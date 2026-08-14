import { describe, expect, it } from 'vitest'
import { hasBeenWelcomed, markWelcomed } from './welcomed'

/** A Storage that behaves, and one that throws the way Safari private mode does. */
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
    clear: () => {},
    getItem: () => {
      throw new Error('denied')
    },
    key: () => null,
    removeItem: () => {},
    setItem: () => {
      throw new Error('quota')
    },
  }
}

describe('welcomed', () => {
  it('is false until marked, and true afterwards', () => {
    const storage = memoryStorage()
    expect(hasBeenWelcomed('user-a', storage)).toBe(false)
    markWelcomed('user-a', storage)
    expect(hasBeenWelcomed('user-a', storage)).toBe(true)
  })

  it('survives a remount — which is the entire point', () => {
    const storage = memoryStorage()
    markWelcomed('user-a', storage)
    // A second read is what the Log screen does after coming back from
    // History. Component state would have been lost here.
    expect(hasBeenWelcomed('user-a', storage)).toBe(true)
  })

  it('does not leak between two people on one phone', () => {
    const storage = memoryStorage()
    markWelcomed('user-a', storage)
    expect(hasBeenWelcomed('user-b', storage)).toBe(false)
  })

  it('reports not-welcomed when there is no storage at all', () => {
    expect(hasBeenWelcomed('user-a', null)).toBe(false)
    // And writing is a no-op rather than a crash.
    expect(() => markWelcomed('user-a', null)).not.toThrow()
  })

  it('survives storage that throws', () => {
    const storage = hostileStorage()
    expect(hasBeenWelcomed('user-a', storage)).toBe(false)
    expect(() => markWelcomed('user-a', storage)).not.toThrow()
  })
})
