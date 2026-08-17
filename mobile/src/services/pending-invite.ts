import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * An invite code, held between the tap and the account.
 *
 * Somebody arriving on `wazn.app/join/<code>` usually has no account yet, so
 * the code has to survive sign-up — several screens and possibly an app
 * restart later. It lives here rather than in the route module because an
 * Expo Router file should export its screen and nothing else; a helper
 * exported from a route is a helper that gets bundled into the route's chunk
 * and imported by things that do not need the screen.
 *
 * AsyncStorage, not SecureStore: an invite code is a public URL fragment, and
 * the keychain is for the session.
 */
const KEY = 'wazn.pending-invite'

/** Written BEFORE the code is resolved — a dead radio at the moment of the
 *  tap must not be what loses somebody their invite. */
export async function holdPendingInvite(code: string): Promise<void> {
  await AsyncStorage.setItem(KEY, code).catch(() => {})
}

/** Read and clear. Consumed once, by whoever gets there first — the home
 *  screen after sign-in. */
export async function takePendingInvite(): Promise<string | null> {
  const code = await AsyncStorage.getItem(KEY).catch(() => null)
  if (code !== null) await AsyncStorage.removeItem(KEY).catch(() => {})
  return code
}
