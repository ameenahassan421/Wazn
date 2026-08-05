/**
 * Identity, clients, quotas and CORS — the parts both AI functions share.
 *
 * The identity rule from plan §2C is enforced here and nowhere else: the
 * caller's user id comes from their JWT, never from the request body. There is
 * no code path in either function that reads a user id from JSON, so there is
 * nothing to get wrong on a busy day.
 */

import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2.45.4'

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

export interface Caller {
  userId: string
  /** Runs as the user. Every read through this is scoped by RLS. */
  asUser: SupabaseClient
  /**
   * Runs as the service role. Used only to write `coach_notes` and
   * `ai_generations`, which have no client-writable policy on purpose — a
   * browser that could write them could forge text under the "AI-generated"
   * label, or delete its own quota ledger.
   */
  asService: SupabaseClient
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export async function authenticate(request: Request): Promise<Caller> {
  const authorization = request.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) {
    throw new HttpError('Sign in to use this.', 401)
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })

  // getUser() verifies the token against the auth server rather than trusting
  // its claims. A decoded-but-unverified JWT is not an identity.
  const { data, error } = await asUser.auth.getUser()
  if (error || !data.user) {
    throw new HttpError('That session is no longer valid. Sign in again.', 401)
  }

  const asService = createClient(url, serviceKey, {
    auth: { persistSession: false },
  })

  return { userId: data.user.id, asUser, asService }
}

/**
 * Free-tier quotas, per plan §2C: Coach's Notes regenerate at most weekly, and
 * routines are capped at three a month.
 *
 * Derived by counting the ledger rather than by keeping a counter, because a
 * counter needs something to reset it and a ledger just ages out. Pro is
 * unmetered — there is no subscription table yet (Stage 6), so this is written
 * to take one argument when there is.
 */
export const QUOTAS = {
  coach_notes: { limit: 1, days: 7 },
  routine: { limit: 3, days: 30 },
} as const

/**
 * How many generations are left in the window.
 *
 * Design v2.1 puts this in the Coach footer — "1 regenerate left this week" —
 * and disables the control at zero. A quota the user cannot see is a quota
 * they discover by being refused, which reads as a fault rather than a limit.
 */
export async function quotaRemaining(
  caller: Caller,
  feature: keyof typeof QUOTAS,
): Promise<number> {
  const { limit, days } = QUOTAS[feature]
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const { count, error } = await caller.asService
    .from('ai_generations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', caller.userId)
    .eq('feature', feature)
    .gte('created_at', since)
  if (error) throw new HttpError('Could not check your usage.', 500)
  return Math.max(0, limit - (count ?? 0))
}

export async function assertWithinQuota(
  caller: Caller,
  feature: keyof typeof QUOTAS,
): Promise<void> {
  const { limit } = QUOTAS[feature]
  if ((await quotaRemaining(caller, feature)) <= 0) {
    throw new HttpError(
      feature === 'routine'
        ? `That is ${limit} generated routines this month. You can still build one by hand — it takes about a minute.`
        : 'Your notes were written recently. They refresh once a week, or whenever you log something new.',
      429,
    )
  }
}

export async function recordGeneration(
  caller: Caller,
  feature: keyof typeof QUOTAS,
  model: string,
  usedFree: boolean,
): Promise<void> {
  await caller.asService.from('ai_generations').insert({
    user_id: caller.userId,
    feature,
    model,
    used_free: usedFree,
  })
}
