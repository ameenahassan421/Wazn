import {
  createWaznClient,
  describeConfigError,
  initSupabase,
} from '@wazn/core/supabase'

/**
 * The web app's Supabase client.
 *
 * E1b moved client construction and `describeError` into `@wazn/core/supabase`
 * so both platforms share them. What stays here is the part that is genuinely
 * web-only: reading `import.meta.env`, which Metro does not have, and turning
 * on `detectSessionInUrl`, which reads the browser URL.
 *
 * The `supabase` binding below is re-exported unchanged, so every existing
 * caller in `src/` kept working. Code that has to run on a phone uses `db()`
 * from the core instead.
 */

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Missing config is a deploy mistake, not a crash: the app renders the fix
 * instead of a blank screen.
 */
export const supabaseConfigError = describeConfigError(
  { url, anonKey },
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY ' +
    '— locally in .env.local (copy .env.example), or in the Vercel project ' +
    'environment variables — then rebuild.',
)

export const supabase = createWaznClient({
  url,
  anonKey,
  // Google sign-in returns through a redirect; PKCE puts a one-time `?code=`
  // in the URL and this exchanges it for a session on load (supabase-js
  // cleans the URL afterwards). Harmless for every other path — the invite
  // capture in main.tsx only rewrites `/join/...` and runs before render,
  // so the two never touch the same URL.
  detectSessionInUrl: true,
})

// Hand the same instance to the core. One client, not two: a second one would
// hold its own session and refresh timer.
initSupabase(supabase)

export { describeError } from '@wazn/core/supabase'
