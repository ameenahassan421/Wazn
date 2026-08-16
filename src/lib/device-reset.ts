import { READ_CACHE } from '@wazn/core/cache-names'
import { CHECKPOINT_KEY } from './checkpoint'
import { indexedDbStore } from './idb'
import { forget } from './offline-store'

/**
 * When a different person signs in on this phone, the previous one's training
 * data goes.
 *
 * U3b put three caches on the device — an IndexedDB read cache and write
 * queue, a localStorage checkpoint, and the service worker's NetworkFirst
 * cache of Supabase reads. The first two are stamped with their owner and
 * refuse to answer anyone else, but the third cannot be: the Cache API keys on
 * URL alone and these responses vary only by an `Authorization` header, so
 * without this an account switch could show one person History belonging to
 * another. That is not a theoretical pairing — production has already seen one
 * Gmail inbox produce two Wazn accounts.
 *
 * Deliberately NOT on sign-out. Signing out and back in as yourself is a
 * normal thing to do — and doing it with a set still queued must not throw the
 * set away. The trigger is a *different* user, which is the only case where
 * the data on this device stops being theirs.
 */

export const DEVICE_USER_KEY = 'wazn.device.user'

/**
 * Whether the device should be wiped, given who used it last and who is here
 * now. Pure, so the one rule that matters is testable without a browser.
 */
export function shouldForgetDevice(
  previousUserId: string | null,
  nextUserId: string | null,
): boolean {
  // Nobody signed in yet, or nobody signed in now: nothing has changed hands.
  if (!previousUserId || !nextUserId) return false
  return previousUserId !== nextUserId
}

/** Empty the service worker's read cache. A no-op where there is no worker. */
async function clearReadCache(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return
    await caches.delete(READ_CACHE)
  } catch {
    // A browser that refuses to answer about its caches has none to leak.
  }
}

/**
 * Run the check and, if it says so, forget everything. Returns whether it did,
 * which is what makes this observable from a test.
 */
export async function reconcileDeviceUser(
  userId: string | null,
  storage: Storage | null,
): Promise<boolean> {
  if (!userId) return false
  let previous: string | null
  try {
    previous = storage?.getItem(DEVICE_USER_KEY) ?? null
  } catch {
    previous = null
  }

  const forgetting = shouldForgetDevice(previous, userId)
  if (forgetting) {
    await forget(indexedDbStore())
    await clearReadCache()
    try {
      storage?.removeItem(CHECKPOINT_KEY)
    } catch {
      // Same posture as everywhere else storage is touched: best-effort.
    }
  }

  try {
    if (previous !== userId) storage?.setItem(DEVICE_USER_KEY, userId)
  } catch {
    // Unable to remember who this is. The next sign-in re-checks from scratch,
    // which is the safe direction: it forgets more often, never less.
  }
  return forgetting
}
