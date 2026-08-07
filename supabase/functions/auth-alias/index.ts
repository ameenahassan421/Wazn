/**
 * Username sign-in, without an email oracle.
 *
 * The auth screen accepts a username anywhere it accepts an email. But
 * `signInWithOtp`, `verifyOtp` and `signInWithPassword` all need the real
 * address, and handing that address to the browser would let anyone type a
 * username and learn an email. So the resolution happens here, server-side,
 * and the address never leaves: this function performs the sign-in itself and
 * returns only a session (or a refusal).
 *
 * Three rules, load-bearing:
 *
 * - **Identical responses.** `request-code` answers `{ ok: true }` whether the
 *   username exists or not; `password` and `verify-code` fail with the same
 *   words for a wrong username, a wrong password, and a wrong code. A caller
 *   cannot distinguish "no such user" from "wrong credentials", here or in
 *   timing they can rely on (Supabase's own auth rate limits are the backstop).
 * - **shouldCreateUser is false.** Accounts are never created by username —
 *   a username only exists because an account already picked it.
 * - **No admin writes.** The service role is used to read the username → id
 *   mapping and the account's email; every sign-in runs through the ordinary
 *   anon-key auth API, so lockouts, rate limits and password policy all apply
 *   exactly as if the browser had called it.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { CORS_HEADERS, json } from '../_shared/context.ts'

/** Matches `profiles_username_check` in migration 0011. */
const USERNAME_RE = /^[a-z0-9_]{3,20}$/

const INVALID_CREDENTIALS = 'Invalid credentials. Check the username and try again.'
const INVALID_CODE =
  'That code is not valid. Re-enter the 6 digits from the newest email.'

interface Body {
  action?: string
  username?: string
  password?: string
  token?: string
}

async function resolveEmail(username: string): Promise<string | null> {
  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const asService = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: profile, error } = await asService
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()
  if (error || !profile) return null

  const { data, error: userError } = await asService.auth.admin.getUserById(profile.id)
  if (userError || !data.user?.email) return null
  return data.user.email
}

function anonClient() {
  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  return createClient(url, anonKey, { auth: { persistSession: false } })
}

type SessionOut = { access_token: string; refresh_token: string }

function sessionOut(session: {
  access_token: string
  refresh_token: string
}): SessionOut {
  // Only the two tokens. The full session object carries the user record —
  // including the email this function exists to keep private until sign-in
  // succeeds, at which point the client can read it from its own session.
  return { access_token: session.access_token, refresh_token: session.refresh_token }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }
  if (request.method !== 'POST') {
    return json({ error: 'POST only.' }, 405)
  }

  let body: Body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Bad request.' }, 400)
  }

  const username = (body.username ?? '').trim().toLowerCase().replace(/^@/, '')
  if (!USERNAME_RE.test(username)) {
    // Same refusal as an unknown username: a malformed name is not a
    // different, more informative failure.
    if (body.action === 'request-code') return json({ ok: true })
    return json(
      { error: body.action === 'verify-code' ? INVALID_CODE : INVALID_CREDENTIALS },
      400,
    )
  }

  switch (body.action) {
    case 'request-code': {
      const email = await resolveEmail(username)
      if (email) {
        // Failures are swallowed on purpose — a send error must not become
        // the oracle the identical response exists to prevent.
        await anonClient()
          .auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
          .catch(() => undefined)
      }
      return json({ ok: true })
    }

    case 'verify-code': {
      const token = (body.token ?? '').trim()
      const email = token.length === 6 ? await resolveEmail(username) : null
      if (!email) return json({ error: INVALID_CODE }, 400)
      const { data, error } = await anonClient().auth.verifyOtp({
        email,
        token,
        type: 'email',
      })
      if (error || !data.session) return json({ error: INVALID_CODE }, 400)
      return json({ session: sessionOut(data.session) })
    }

    case 'password': {
      const password = body.password ?? ''
      const email = password.length > 0 ? await resolveEmail(username) : null
      if (!email) return json({ error: INVALID_CREDENTIALS }, 400)
      const { data, error } = await anonClient().auth.signInWithPassword({
        email,
        password,
      })
      if (error || !data.session) return json({ error: INVALID_CREDENTIALS }, 400)
      return json({ session: sessionOut(data.session) })
    }

    default:
      return json({ error: 'Unknown action.' }, 400)
  }
})
