import 'react-native-url-polyfill/auto'

import { AppState, Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The native Supabase client.
 *
 * This is one of the files that is deliberately NOT shared with the web app
 * (see `src/lib/portable.ts`). The schema, the RLS policies and the RPCs are
 * identical — the client is not, because where a session lives is a platform
 * question. The browser keeps it in `localStorage`; a phone should keep it in
 * the keychain, where it is encrypted at rest and does not survive an app
 * uninstall.
 *
 * The publishable (anon) key is the only key here. The service-role key is
 * script-only and must never reach a client bundle — anything in `extra`
 * ships inside the app where any user can read it.
 */

const extra = Constants.expoConfig?.extra ?? {}
const url = String(extra.supabaseUrl ?? '')
const anonKey = String(extra.supabaseAnonKey ?? '')

/**
 * Missing config is reported, not thrown.
 *
 * A throw here happens during module evaluation, before the error boundary
 * exists, and produces a white screen with a stack trace. The app renders a
 * sentence instead — the same thing the web app does with
 * `supabaseConfigError`.
 */
export const supabaseConfigError: string | null =
  url === '' || anonKey === ''
    ? 'This build has no Supabase configuration. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'
    : null

/**
 * SecureStore, chunked.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────
 * `expo-secure-store` refuses values over ~2 KB on Android (the KeyStore
 * blob limit) and warns above 2048 bytes on iOS. A Supabase session is an
 * access token, a refresh token, and the whole user object — routinely 3–4 KB,
 * and larger for an account with app_metadata. Handed to SecureStore whole it
 * fails at WRITE time, which means the session is silently not persisted and
 * the lifter is signed out next launch. That is a bug that only appears on
 * real accounts, which is the worst kind.
 *
 * So a value is split across numbered keys with a small manifest. Reading
 * stops at the first missing chunk and returns null rather than a truncated
 * JSON string — a half-session must look like no session, never like a
 * corrupt one.
 */
const CHUNK = 1800

/**
 * The web target has no keychain, and `expo-secure-store` has no web
 * implementation at all: every one of its methods is undefined there, so the
 * first session read throws `getValueWithKeyAsync is not a function` before
 * anything renders. Stage 4A phase A0 found this by RUNNING the web export,
 * not by building it. The export was green.
 *
 * `localStorage` is the right answer rather than a fallback, and this file's
 * own preamble already said so: where a session lives is a platform question,
 * and the browser's answer is localStorage. It is also exactly what the Vite
 * app being retired has always used, so a session written by one and read by
 * the other agrees.
 *
 * No chunking here. The ~2 KB limit that forces it on native is a KeyStore
 * constraint; localStorage holds megabytes.
 */
const webStore = {
  async getItem(key: string): Promise<string | null> {
    try {
      return globalThis.localStorage?.getItem(key) ?? null
    } catch {
      // Private mode and blocked third-party storage both throw on access
      // rather than returning null. No session is the correct reading.
      return null
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      globalThis.localStorage?.setItem(key, value)
    } catch {
      // Over quota, or storage disabled. The session stays in memory for this
      // tab, which is a worse experience than persistence and a much better
      // one than a thrown error at sign-in.
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      globalThis.localStorage?.removeItem(key)
    } catch {
      // Nothing to do: if it cannot be removed it was never written.
    }
  },
}

const nativeStore = {
  async getItem(key: string): Promise<string | null> {
    const count = await SecureStore.getItemAsync(`${key}.n`)
    if (count === null) {
      // Written before chunking existed, or never written. Either way the
      // plain key is the answer.
      return SecureStore.getItemAsync(key)
    }
    const n = Number(count)
    if (!Number.isInteger(n) || n < 1) return null

    const parts: string[] = []
    for (let i = 0; i < n; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`)
      if (part === null) return null
      parts.push(part)
    }
    return parts.join('')
  },

  async setItem(key: string, value: string): Promise<void> {
    await nativeStore.removeItem(key)
    const n = Math.ceil(value.length / CHUNK)
    for (let i = 0; i < n; i++) {
      await SecureStore.setItemAsync(
        `${key}.${i}`,
        value.slice(i * CHUNK, (i + 1) * CHUNK),
      )
    }
    // The manifest is written LAST so a crash mid-write leaves no manifest
    // and therefore no session, rather than a manifest promising chunks that
    // were never written.
    await SecureStore.setItemAsync(`${key}.n`, String(n))
  },

  async removeItem(key: string): Promise<void> {
    const count = await SecureStore.getItemAsync(`${key}.n`)
    // The manifest goes first, for the same reason it is written last.
    await SecureStore.deleteItemAsync(`${key}.n`)
    if (count !== null) {
      const n = Number(count)
      for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(`${key}.${i}`)
    }
    await SecureStore.deleteItemAsync(key)
  },
}

export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    storage: Platform.OS === 'web' ? webStore : nativeStore,
    autoRefreshToken: true,
    persistSession: true,
    /**
     * False on native, true on web. `detectSessionInUrl` exists for the
     * browser's OAuth redirect, where the tokens come back in the location
     * hash. On a phone the redirect arrives through the `wazn://` scheme and
     * is handled by `expo-auth-session`, and leaving this on makes the client
     * try to parse a URL that is not there. On the web target it is the only
     * way the redirect completes at all.
     */
    detectSessionInUrl: Platform.OS === 'web',
  },
})

/**
 * Refresh only while the app is in front.
 *
 * Supabase's auto-refresh runs on a timer. Left running in the background it
 * either fires against a suspended network stack and logs failures, or is
 * killed by the OS mid-flight — and on resume the session looks expired when
 * it is not. Stopping and starting on foreground state is what the Supabase
 * React Native guidance asks for, and it is why a workout left open on the
 * lock screen for ninety seconds does not come back signed out.
 */
AppState.addEventListener('change', (state) => {
  if (supabaseConfigError !== null) return
  if (state === 'active') void supabase.auth.startAutoRefresh()
  else void supabase.auth.stopAutoRefresh()
})
