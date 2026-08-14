import { browserStorage } from './checkpoint'

/**
 * Whether this person has been past the first-run screen.
 *
 * It has to outlive the Log screen's mount. `welcomed` was component state,
 * and every screen in this app unmounts when you leave it — so a new user who
 * skipped the welcome, opened History and came back was shown the welcome
 * again, and again, until their first workout landed. The comment above it
 * said "shown once"; nothing made that true.
 *
 * Local, not a profile column. It describes this device's idea of where the
 * reader is in the app rather than a fact about them, it must answer with no
 * network on a cold start, and getting it wrong costs one extra screen rather
 * than any data. `reconcileDeviceUser` already wipes local state when a
 * different person signs in on the same phone, and the key carries the user
 * id anyway, so two people sharing a device do not inherit each other's.
 */
const PREFIX = 'wazn.welcomed.v1'

function key(userId: string): string {
  return `${PREFIX}.${userId}`
}

export function hasBeenWelcomed(
  userId: string,
  storage: Storage | null = browserStorage(),
): boolean {
  if (!storage) return false
  try {
    return storage.getItem(key(userId)) === '1'
  } catch {
    // Private mode, or storage disabled. Showing the welcome again is the
    // safe failure: it is a screen, not a loss.
    return false
  }
}

export function markWelcomed(
  userId: string,
  storage: Storage | null = browserStorage(),
): void {
  if (!storage) return
  try {
    storage.setItem(key(userId), '1')
  } catch {
    // Full or disabled. The session in front of us still works — `welcomed`
    // is held in component state too — and the worst case is that the screen
    // returns next launch.
  }
}
