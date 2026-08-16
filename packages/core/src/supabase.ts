import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The client seam between the calculation core and whatever app is hosting it.
 *
 * `src/lib/supabase.ts` used to construct the client at module scope from
 * `import.meta.env`, which is a Vite construct: Metro does not have it, and a
 * core module that reads it cannot run on a phone. Rather than teach the core
 * about two bundlers, the app builds the client and hands it over.
 *
 * The web app still exports its own `supabase` singleton and 47 component call
 * sites were left alone. Only code that has to run on both platforms uses
 * `db()`.
 */

export interface SupabaseConfig {
  url: string | undefined
  anonKey: string | undefined
  /**
   * Where the session is persisted. The web leaves this undefined and gets
   * `localStorage`; React Native passes AsyncStorage, which is the whole
   * reason this parameter exists.
   */
  storage?: {
    getItem: (key: string) => Promise<string | null> | string | null
    setItem: (key: string, value: string) => Promise<void> | void
    removeItem: (key: string) => Promise<void> | void
  }
  /**
   * PKCE's `?code=` exchange reads the browser URL, so it is web-only. On
   * native the redirect arrives through a deep link and is handled explicitly.
   */
  detectSessionInUrl?: boolean
}

/**
 * Missing config is a deploy mistake, not a crash: the app renders the fix
 * instead of a blank screen. The variable names are the caller's to report,
 * since they differ per platform (`VITE_*` against `EXPO_PUBLIC_*`).
 */
export function describeConfigError(
  config: SupabaseConfig,
  hint: string,
): string | null {
  return !config.url || !config.anonKey ? hint : null
}

export function createWaznClient(config: SupabaseConfig): SupabaseClient {
  return createClient(config.url ?? 'http://localhost', config.anonKey ?? 'anon', {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: config.detectSessionInUrl ?? false,
      flowType: 'pkce',
      ...(config.storage ? { storage: config.storage } : {}),
    },
  })
}

let client: SupabaseClient | null = null

/** Called once, by the app, before anything in the core touches the network. */
export function initSupabase(next: SupabaseClient): void {
  client = next
}

/**
 * The client, or a loud failure.
 *
 * Deliberately a function rather than an exported binding: an eager `export
 * const supabase` is exactly what forced `import.meta.env` to be read at
 * module scope, which is the coupling this file exists to remove.
 */
export function db(): SupabaseClient {
  if (!client) {
    throw new Error(
      'Supabase was used before initSupabase() ran. The app entry point has to ' +
        'call it: src/main.tsx on web, app/_layout.tsx on native.',
    )
  }
  return client
}

/** Test seam. Resets the module between cases so state cannot leak. */
export function resetSupabaseForTests(): void {
  client = null
}

/**
 * Supabase errors surface as "Failed to fetch" or a bare Postgres code, which
 * tells the user nothing at the gym. Every caller wraps its own action name
 * around the underlying message so the toast says what failed and what to do.
 */
export function describeError(action: string, error: unknown): string {
  const raw =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)

  if (/failed to fetch|network|load failed/i.test(raw)) {
    return `${action} failed — no connection to the server. Your last saved set is safe; try again once you have signal.`
  }
  if (/jwt|token|not authenticated|session/i.test(raw)) {
    return `${action} failed — your sign-in expired. Sign in again to continue.`
  }
  return `${action} failed — ${raw}`
}
