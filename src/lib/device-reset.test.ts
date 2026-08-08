import { describe, expect, it } from 'vitest'
import { CHECKPOINT_KEY } from './checkpoint'
import {
  DEVICE_USER_KEY,
  reconcileDeviceUser,
  shouldForgetDevice,
} from './device-reset'

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

describe('shouldForgetDevice', () => {
  it('wipes when a different person signs in', () => {
    expect(shouldForgetDevice('a', 'b')).toBe(true)
  })

  /**
   * Signing out and back in as yourself is a normal thing to do, and doing it
   * with a set still queued must not throw the set away.
   */
  it('does not wipe when the same person signs back in', () => {
    expect(shouldForgetDevice('a', 'a')).toBe(false)
  })

  it('does not wipe on a first sign-in or on sign-out', () => {
    expect(shouldForgetDevice(null, 'a')).toBe(false)
    expect(shouldForgetDevice('a', null)).toBe(false)
    expect(shouldForgetDevice(null, null)).toBe(false)
  })
})

describe('reconcileDeviceUser', () => {
  it('remembers who is here without wiping the first time', async () => {
    const storage = memoryStorage()
    expect(await reconcileDeviceUser('a', storage)).toBe(false)
    expect(storage.getItem(DEVICE_USER_KEY)).toBe('a')
  })

  it('wipes the checkpoint when the account changes', async () => {
    const storage = memoryStorage()
    await reconcileDeviceUser('a', storage)
    storage.setItem(CHECKPOINT_KEY, '{"version":2}')
    expect(await reconcileDeviceUser('b', storage)).toBe(true)
    expect(storage.getItem(CHECKPOINT_KEY)).toBeNull()
    expect(storage.getItem(DEVICE_USER_KEY)).toBe('b')
  })

  it('leaves an in-progress workout alone when the same account returns', async () => {
    const storage = memoryStorage()
    await reconcileDeviceUser('a', storage)
    storage.setItem(CHECKPOINT_KEY, '{"version":2}')
    expect(await reconcileDeviceUser('a', storage)).toBe(false)
    expect(storage.getItem(CHECKPOINT_KEY)).toBe('{"version":2}')
  })

  it('does nothing at all with nobody signed in', async () => {
    const storage = memoryStorage()
    storage.setItem(CHECKPOINT_KEY, 'keep me')
    expect(await reconcileDeviceUser(null, storage)).toBe(false)
    expect(storage.getItem(CHECKPOINT_KEY)).toBe('keep me')
  })

  it('survives having no storage at all', async () => {
    await expect(reconcileDeviceUser('a', null)).resolves.toBe(false)
  })
})
