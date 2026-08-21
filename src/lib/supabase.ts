import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Missing config is a deploy mistake, not a crash: the app renders the fix
 * instead of a blank screen.
 */
export const supabaseConfigError =
  !url || !anonKey
    ? 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY ' +
      '— locally in .env.local (copy .env.example), or in the Vercel project ' +
      'environment variables — then rebuild.'
    : null

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'anon', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Google sign-in returns through a redirect; PKCE puts a one-time `?code=`
    // in the URL and this exchanges it for a session on load (supabase-js
    // cleans the URL afterwards). Harmless for every other path — the invite
    // capture in main.tsx only rewrites `/join/...` and runs before render,
    // so the two never touch the same URL.
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})

/**
 * Supabase errors surface as "Failed to fetch" or a bare Postgres code, which
 * tells the user nothing at the gym. Every caller wraps its own action name
 * around the underlying message so the toast says what failed and what to do.
 */
/**
 * Moved to `./errors` on 2026-08-21 so the native app can read it too, and
 * re-exported here so no web caller had to change. `supabase.ts` builds the
 * browser client and can never be portable; a pure function over a string
 * should not have been trapped behind that.
 */
export { describeError } from './errors'
