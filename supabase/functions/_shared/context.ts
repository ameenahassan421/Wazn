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
import { quotaMessage, quotaWindowStart, remaining, type Feature } from './quota.ts'

export { QUOTAS, type Feature } from './quota.ts'

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
    /**
     * A short machine-readable class for the ledger — 'parse', 'truncated',
     * 'ungrounded', 'quota'. Grouping failures by their user-facing message
     * means grouping by a typo, and the message is the part most likely to be
     * reworded.
     */
    readonly code?: string,
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
 * How many generations are left in the window.
 *
 * Design v2.1 puts this in the Coach footer — "1 regenerate left this week" —
 * and disables the control at zero. A quota the user cannot see is a quota
 * they discover by being refused, which reads as a fault rather than a limit.
 *
 * The arithmetic moved to `quota.ts` so it could be unit-tested; what is left
 * here is the part that genuinely needs a database. Note `.eq('ok', true)`:
 * since H2 the ledger records failed attempts too, and counting those would
 * let a provider outage spend the user's week. `ai_generations_quota_idx` is
 * the matching partial index.
 */
export async function quotaRemaining(
  caller: Caller,
  feature: Feature,
): Promise<number> {
  const since = quotaWindowStart(feature, Date.now())
  const base = () =>
    caller.asService
      .from('ai_generations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', caller.userId)
      .eq('feature', feature)
      .gte('created_at', since)

  const { count, error } = await base().eq('ok', true)

  // Pre-0017 there is no `ok` column, and PostgREST answers 42703. Without
  // this fallback the whole feature would 500 for the window between merging
  // (which deploys functions) and applying the migration by hand — the one
  // failure in this file that a user would actually see. Every row in the old
  // shape is a success, so dropping the filter is exactly right there.
  //
  // Delete once 0017 is applied.
  if (error?.code === '42703') {
    console.warn('ai_generations has no `ok` column — apply migration 0017')
    const { count: legacyCount, error: legacyError } = await base()
    if (legacyError) throw new HttpError('Could not check your usage.', 500)
    return remaining(feature, legacyCount ?? 0)
  }
  if (error) throw new HttpError('Could not check your usage.', 500)
  return remaining(feature, count ?? 0)
}

export async function assertWithinQuota(
  caller: Caller,
  feature: Feature,
): Promise<void> {
  if ((await quotaRemaining(caller, feature)) <= 0) {
    throw new HttpError(quotaMessage(feature), 429)
  }
}

/**
 * One row per attempt — successful or not.
 *
 * It used to be one row per *success*, called after parsing had already
 * worked, which is why the fallback rate, the parse-failure rate, the
 * truncation rate and p95 latency were all unmeasurable while
 * `BEATING_HEVY_PLAN` §12 promised every one of them
 * (`docs/INFRASTRUCTURE_AUDIT.md` §3-A3). Failures are now rows with
 * `ok = false` and an `error_code`, and `quotaRemaining` filters them out so
 * a bad afternoon at the provider does not cost anyone their week.
 *
 * Deliberately never throws. This is instrumentation: a ledger write that
 * fails must not turn a generation the user already received into an error
 * they see.
 */
export async function recordGeneration(
  caller: Caller,
  feature: Feature,
  entry: {
    ok: boolean
    model?: string
    usedFree?: boolean
    errorCode?: string
    latencyMs?: number
    finishReason?: string
    tokensIn?: number
    tokensOut?: number
    promptVersion?: string
    toolCalls?: number
  },
): Promise<void> {
  const legacy = {
    user_id: caller.userId,
    feature,
    model: entry.model ?? null,
    used_free: entry.usedFree ?? false,
  }
  try {
    const { error } = await caller.asService.from('ai_generations').insert({
      ...legacy,
      ok: entry.ok,
      error_code: entry.errorCode ?? null,
      latency_ms: entry.latencyMs ?? null,
      finish_reason: entry.finishReason ?? null,
      tokens_in: entry.tokensIn ?? null,
      tokens_out: entry.tokensOut ?? null,
      prompt_version: entry.promptVersion ?? null,
      tool_calls: entry.toolCalls ?? 0,
    })
    // 42703 is "column does not exist" — this code is live against a schema
    // that predates 0017, because merging deploys functions while migrations
    // are applied by hand. Falling back to the old shape keeps the quota
    // ledger working in that window; without it every generation would be
    // unrecorded and therefore unmetered. Only successes are worth recording
    // in the old shape, since it has no column that can say otherwise.
    //
    // Delete once 0017 is applied.
    if (error?.code === '42703') {
      console.warn('ai_generations is missing the H2 columns — apply migration 0017')
      if (entry.ok) await caller.asService.from('ai_generations').insert(legacy)
    } else if (error) {
      console.error('ledger write failed', error)
    }
  } catch (error) {
    console.error('ledger write threw', error)
  }
}
