import { db } from './supabase'

/**
 * Client half of username sign-in. The `auth-alias` Edge Function resolves a
 * username to its account email server-side and performs the sign-in there,
 * so the address never reaches this browser until the session does. See the
 * function for the identical-response rules; nothing here should try to be
 * cleverer than "send what was typed, relay what came back".
 */

async function describeFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: Response })?.context
  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { error?: string }
      if (body?.error) return body.error
    } catch {
      /* fall through */
    }
  }
  return error instanceof Error ? error.message : 'Something went wrong.'
}

interface AliasSession {
  session?: { access_token: string; refresh_token: string }
  ok?: boolean
}

async function invoke(body: Record<string, string>): Promise<AliasSession> {
  const { data, error } = await db().functions.invoke<AliasSession>('auth-alias', {
    body,
  })
  if (error) throw new Error(await describeFunctionError(error))
  return data ?? {}
}

async function adopt(result: AliasSession): Promise<void> {
  if (!result.session) throw new Error('Sign-in did not complete. Try again.')
  const { error } = await db().auth.setSession(result.session)
  if (error) throw new Error(error.message)
}

/** Fire-and-report-nothing: the response is `{ok:true}` no matter what. */
export async function requestCodeForUsername(username: string): Promise<void> {
  await invoke({ action: 'request-code', username })
}

export async function verifyCodeForUsername(
  username: string,
  token: string,
): Promise<void> {
  await adopt(await invoke({ action: 'verify-code', username, token }))
}

export async function passwordSignInForUsername(
  username: string,
  password: string,
): Promise<void> {
  await adopt(await invoke({ action: 'password', username, password }))
}
