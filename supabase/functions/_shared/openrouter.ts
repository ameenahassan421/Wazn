/**
 * The only place in Wazn that talks to a model provider.
 *
 * Plan §2C fixes three things about how it talks:
 *
 *  1. The key lives as a Supabase secret and is read here, server-side. It is
 *     never a `VITE_*` var and never reaches a browser.
 *  2. Model ids are environment variables, so swapping models is config rather
 *     than a deploy of changed code.
 *  3. The `:free` variant is tried first and a 429 falls back to the paid one
 *     automatically. Free tiers are rate-limited, not unreliable — the fallback
 *     is what makes "free during testing" a cost decision instead of a
 *     reliability one.
 */

export interface ChatResult {
  content: string
  /** The model that actually answered, after any fallback. */
  model: string
  usedFree: boolean
  /** From the provider's `usage` block, when it sends one. */
  tokensIn?: number
  tokensOut?: number
  /**
   * Why the model stopped. `'length'` means it hit the token ceiling and the
   * answer is cut off mid-structure.
   *
   * Worth carrying all the way to the caller: a truncated response and a
   * genuinely malformed one are indistinguishable once parsing fails, and they
   * need opposite fixes — raise the ceiling versus change the prompt. Twice now
   * a truncation has been diagnosed as "the model returned junk", so the
   * provider's own answer to that question is no longer thrown away.
   */
  finishReason?: string
}

export class ModelError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Machine-readable class for the ledger: 'provider_429', 'timeout', … */
    readonly code = 'provider',
  ) {
    super(message)
    this.name = 'ModelError'
  }
}

/**
 * The circuit breaker.
 *
 * `BEATING_HEVY_PLAN` §10 says the app must be fully usable with AI dark, and
 * until now nothing implemented that. The failure shape it exists for is not
 * hypothetical: `TIMEOUT_MS` is 45s and every call tries the free model and
 * then the paid one, so a provider having a bad afternoon meant **ninety
 * seconds of spinner**, per request, for every user, for as long as it lasted.
 *
 * After `FAILURE_THRESHOLD` consecutive provider failures the breaker opens
 * and calls fail instantly for `COOLDOWN_MS`; the next call after that is a
 * probe, and one success closes it again. Callers turn an open breaker into
 * the surface's deterministic skeleton — numbers, no prose — rather than an
 * error.
 *
 * **State is per instance, deliberately.** Edge Function instances are reused
 * across many requests, so an instance learns quickly; a fresh instance
 * re-learns in three calls. Making this global would mean a database round
 * trip on the hot path of every generation to protect against an outage that
 * is, by definition, rare. The cheap version is the right version here, and
 * naming the limitation is better than a shared counter nobody maintains.
 */
const FAILURE_THRESHOLD = 3
const COOLDOWN_MS = 60_000

let consecutiveFailures = 0
let openedAt = 0

function breakerIsOpen(now: number): boolean {
  if (consecutiveFailures < FAILURE_THRESHOLD) return false
  if (now - openedAt >= COOLDOWN_MS) {
    // Half-open: let exactly one call through to find out. Resetting the
    // counter rather than tracking a separate state means a probe that fails
    // has to re-earn the threshold, which is the forgiving direction.
    consecutiveFailures = 0
    return false
  }
  return true
}

/** Test seam, and the reset an instance would get by being recycled. */
export function resetBreaker(): void {
  consecutiveFailures = 0
  openedAt = 0
}

export function breakerState(): { open: boolean; consecutiveFailures: number } {
  return { open: breakerIsOpen(Date.now()), consecutiveFailures }
}

/**
 * Every request is capped. A runaway generation is a bill, not a bug report.
 *
 * The cap has now been too low twice, and both times the symptom was the same:
 * a truncated object that no parser can read.
 *
 * At 900, a Coach's Notes run against real data was cut off mid-thought. Raised
 * to 2400, which fixed notes and was assumed to fix everything.
 *
 * It did not. On 2026-08-05 a 4-day routine failed repeatedly with "The routine
 * came back unreadable" while a 3-day routine had succeeded minutes earlier —
 * the first successful generation the feature ever produced. The difference is
 * output size, and the cap is shared. A routine is a nested structure of days,
 * exercises and sets; notes are five short strings. One number cannot serve
 * both, so the ceiling is now per call.
 *
 * The size is what makes this affordable to be generous about: output tokens on
 * the free model cost nothing, and on the paid fallback a routine is a fraction
 * of a cent. Truncating a response you have already paid for is the expensive
 * outcome, not the large ceiling.
 */
const DEFAULT_MAX_TOKENS = 2400
const TIMEOUT_MS = 45_000

/**
 * Free by default, not free by configuration.
 *
 * Before this, an unset `*_MODEL_FREE` secret meant the free attempt was
 * skipped entirely and every call went straight to the paid model — the most
 * expensive possible reading of a missing environment variable. A secret that
 * is absent, misspelled, or lost in a project restore should cost nothing, so
 * the free attempt now happens unless something explicitly says otherwise.
 *
 * This slug is the one free model that both answered and honoured
 * `response_format` when four candidates were tested against the real schema
 * on 2026-08-04 (3.2s). `*_MODEL_FREE` still overrides it.
 *
 * To run a feature on the paid model deliberately, set its `*_MODEL_FREE` to
 * the same value as its `*_MODEL` — equal values skip the free attempt, which
 * is the existing behaviour and now also the documented escape hatch.
 */
const DEFAULT_FREE_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free'

async function callOnce(
  model: string,
  system: string,
  user: string,
  apiKey: string,
  maxTokens: number,
  jsonSchema?: Record<string, unknown>,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // OpenRouter attributes traffic with these. Wazn's own domain, not a
        // user's anything.
        'HTTP-Referer': 'https://trywazn.app',
        'X-Title': 'Wazn',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.4,
        messages: [
          // The system prompt is static per feature and goes first, which is
          // what lets a provider prompt-cache it across every user. The
          // per-user block is the only part that varies.
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        ...(jsonSchema
          ? {
              response_format: {
                type: 'json_schema',
                json_schema: { name: 'result', strict: true, schema: jsonSchema },
              },
            }
          : {}),
      }),
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Ask a model, preferring the free variant.
 *
 * **Any failure of the free attempt falls through to the paid model; only the
 * paid attempt's failure is terminal.** The first version fell back on 429 and
 * 402 only, on the reasoning that retrying a 400 against a paid model just pays
 * for the same mistake. That reasoning was wrong, and a self-test found it in
 * one call: OpenRouter answers **404** for `moonshotai/kimi-k2.5:free` with
 * "This model is unavailable for free" — a case where falling back is exactly
 * right, and the narrow rule turned it into a hard failure of the feature.
 *
 * The general principle is the one the narrow rule missed: the free attempt is
 * an *optimisation*. An optimisation that fails should cost latency, never the
 * result. Free variants also differ in what they support — several do not
 * accept `response_format` at all and answer 400 — so "fall back on anything"
 * is the only rule that survives swapping the free model, which is a thing the
 * env vars exist to make easy.
 */
export async function chat({
  freeModel,
  paidModel,
  system,
  user,
  jsonSchema,
  maxTokens = DEFAULT_MAX_TOKENS,
}: {
  freeModel: string | undefined
  paidModel: string
  system: string
  user: string
  jsonSchema?: Record<string, unknown>
  /** Raise this for anything whose output is a nested structure. */
  maxTokens?: number
}): Promise<ChatResult> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) {
    throw new ModelError('OPENROUTER_API_KEY is not set on this project', 503, 'no_key')
  }

  // Fail in microseconds rather than ninety seconds. The caller renders the
  // deterministic skeleton; nobody waits for a provider that is already known
  // to be down.
  if (breakerIsOpen(Date.now())) {
    throw new ModelError(
      'The coach is offline for a moment. Your numbers are all still here.',
      503,
      'breaker_open',
    )
  }

  const attempts: { model: string; free: boolean }[] = []
  const free = freeModel ?? DEFAULT_FREE_MODEL
  if (free !== paidModel) {
    attempts.push({ model: free, free: true })
  }
  attempts.push({ model: paidModel, free: false })

  let lastStatus = 502
  let lastBody = ''

  for (const attempt of attempts) {
    let response: Response
    try {
      response = await callOnce(
        attempt.model,
        system,
        user,
        apiKey,
        maxTokens,
        jsonSchema,
      )
    } catch (error) {
      // A timeout or a network fault on the free variant is worth one paid
      // retry; on the paid one there is nothing left to try.
      lastStatus = 504
      lastBody = error instanceof Error ? error.message : String(error)
      continue
    }

    if (response.ok) {
      const payload = (await response.json()) as {
        choices?: { message?: { content?: string }; finish_reason?: string }[]
        // Token counts, which the ledger needs to answer "what does this cost
        // per active user" — the question §12 promises and could not compute.
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }
      const content = payload.choices?.[0]?.message?.content
      if (!content) {
        lastStatus = 502
        lastBody = 'the model returned no content'
        continue
      }
      consecutiveFailures = 0
      return {
        content,
        model: attempt.model,
        usedFree: attempt.free,
        finishReason: payload.choices?.[0]?.finish_reason,
        tokensIn: payload.usage?.prompt_tokens,
        tokensOut: payload.usage?.completion_tokens,
      }
    }

    lastStatus = response.status
    lastBody = await response.text()

    // Nothing special-cased. A free attempt that failed for any reason —
    // rate limit, no credit, slug does not exist, schema unsupported — falls
    // through to the paid model below. The loop ends naturally after the paid
    // attempt, which is the last entry.
  }

  // Only a failure of the *paid* attempt reaches here — the free one is an
  // optimisation and falls through. So this is a real provider failure and it
  // counts toward opening the breaker.
  consecutiveFailures += 1
  if (consecutiveFailures === FAILURE_THRESHOLD) openedAt = Date.now()

  throw new ModelError(
    `the model provider refused the request (${lastStatus}): ${lastBody.slice(0, 200)}`,
    lastStatus === 429 ? 429 : 502,
    lastStatus === 429
      ? 'provider_429'
      : lastStatus === 504
        ? 'timeout'
        : `provider_${lastStatus}`,
  )
}
