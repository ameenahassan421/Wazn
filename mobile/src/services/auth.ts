import { classifyIdentifier } from '@wazn/domain'

import { supabase } from './supabase'

/**
 * The ways in, on native.
 *
 * ── RESTYLED, NOT REDESIGNED ────────────────────────────────────────────────
 * Every flow here is the same server call the web `AuthScreen.tsx` makes, in
 * the same order, with the same rules. The design changes what auth looks
 * like; it never changes what it does (handoff §Do-not-regress 1). Where this
 * file differs from the web one it is because the platform differs — nowhere
 * else.
 *
 * ── NEVER A MAGIC LINK ──────────────────────────────────────────────────────
 * Four ways in, and a link is not one of them (CLAUDE.md, Ameen 2026-08-07):
 * Google, Apple, email+password with CODE-based recovery, and the 6-digit
 * email code. A link that opens a browser to hand a session back to an app is
 * the worst of both worlds on a phone, and the reason recovery is code-based
 * is the same reason sign-in is.
 *
 * ── USERNAMES NEVER RESOLVE ON THE CLIENT ───────────────────────────────────
 * A username goes to the `auth-alias` Edge Function, which resolves it to an
 * address and performs the sign-in server-side, then hands back a session.
 * The address never reaches this device until the session does, and the
 * function answers identically whether the username exists or not. Nothing
 * here should try to be cleverer than "send what was typed, relay what came
 * back".
 */

/**
 * What an unusable identifier is told.
 *
 * `classifyIdentifier` returns `{kind:'invalid'}` and no reason — deliberately,
 * because the rule it applies is not something a caller should re-derive. The
 * message lives here, once, so all three entry points say the same thing: a
 * username is 3–20 of a–z, 0–9 and underscore, and anything else with no `@`
 * is a typo worth naming rather than guessing at.
 */
const INVALID_IDENTIFIER = 'That does not look like an email address or a username.'

/** Pull the real message out of a FunctionsHttpError, which hides it. */
async function describeFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: Response })?.context
  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { error?: string }
      if (body?.error) return body.error
    } catch {
      /* fall through to the generic message */
    }
  }
  return error instanceof Error ? error.message : 'Something went wrong.'
}

interface AliasSession {
  session?: { access_token: string; refresh_token: string }
  ok?: boolean
}

async function invokeAlias(body: Record<string, string>): Promise<AliasSession> {
  const { data, error } = await supabase.functions.invoke<AliasSession>('auth-alias', {
    body,
  })
  if (error) throw new Error(await describeFunctionError(error))
  return data ?? {}
}

async function adopt(result: AliasSession): Promise<void> {
  if (!result.session) throw new Error('Sign-in did not complete. Try again.')
  const { error } = await supabase.auth.setSession(result.session)
  if (error) throw new Error(error.message)
}

/**
 * Send a 6-digit code to whoever this identifier belongs to.
 *
 * Returns nothing on purpose, and cannot fail in a way that distinguishes a
 * real account from an absent one. That is the no-oracle rule: a sign-in
 * screen that says "no such user" is an account-enumeration endpoint.
 */
export async function requestCode(identifier: string): Promise<void> {
  const id = classifyIdentifier(identifier)
  if (id.kind === 'invalid') throw new Error(INVALID_IDENTIFIER)

  if (id.kind === 'username') {
    await invokeAlias({ action: 'request-code', username: id.value })
    return
  }
  const { error } = await supabase.auth.signInWithOtp({ email: id.value })
  if (error) throw new Error(error.message)
}

export async function verifyCode(identifier: string, token: string): Promise<void> {
  const id = classifyIdentifier(identifier)
  if (id.kind === 'invalid') throw new Error(INVALID_IDENTIFIER)

  if (id.kind === 'username') {
    await adopt(await invokeAlias({ action: 'verify-code', username: id.value, token }))
    return
  }
  const { error } = await supabase.auth.verifyOtp({
    email: id.value,
    token,
    type: 'email',
  })
  if (error) throw new Error(error.message)
}

export async function signInWithPassword(
  identifier: string,
  password: string,
): Promise<void> {
  const id = classifyIdentifier(identifier)
  if (id.kind === 'invalid') throw new Error(INVALID_IDENTIFIER)

  if (id.kind === 'username') {
    await adopt(await invokeAlias({ action: 'password', username: id.value, password }))
    return
  }
  const { error } = await supabase.auth.signInWithPassword({
    email: id.value,
    password,
  })
  if (error) throw new Error(error.message)
}

/**
 * Create an account. Supabase mails a 6-digit confirmation, not a link —
 * `supabase/email_templates/` must keep its `{{ .Token }}`, or this flow has
 * no second step.
 *
 * Sign-up takes an ADDRESS only. A username is claimed after the fact, on the
 * welcome screen, because a username collision at sign-up costs somebody a
 * password they have already typed twice.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<void> {
  const id = classifyIdentifier(email)
  if (id.kind !== 'email') {
    throw new Error('Sign up with an email address. You can pick a username after.')
  }
  const { error } = await supabase.auth.signUp({ email: id.value, password })
  if (error) throw new Error(error.message)
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

/**
 * Delete the account and everything in it. Irreversible.
 *
 * Both stores require this path: Apple rejects a submission without in-app
 * deletion (5.1.1(v)), Play requires the in-app path plus a web URL. The work
 * happens in the `delete-account` Edge Function, because removing a user needs
 * the service-role key and that key is never allowed near a client.
 *
 * `confirm: 'DELETE'` is a FIXED sentinel and deliberately not the localised
 * word the user typed. The screen checks the typed input against
 * `settings.delete.word`, which is Arabic on an Arabic build; if that string
 * were forwarded, the server contract would change with the device language
 * and an Arabic user could never delete their account.
 *
 * The local session is cleared only after the server confirms. Signing out
 * first would leave a caller with no token to authorise the deletion, which is
 * the obvious ordering and the wrong one.
 */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', {
    method: 'POST',
    body: { confirm: 'DELETE' },
  })
  if (error) throw new Error(error.message)
  await supabase.auth.signOut()
}
