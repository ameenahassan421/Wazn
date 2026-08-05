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
  ) {
    super(message)
    this.name = 'ModelError'
  }
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
    throw new ModelError('OPENROUTER_API_KEY is not set on this project', 503)
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
      }
      const content = payload.choices?.[0]?.message?.content
      if (!content) {
        lastStatus = 502
        lastBody = 'the model returned no content'
        continue
      }
      return {
        content,
        model: attempt.model,
        usedFree: attempt.free,
        finishReason: payload.choices?.[0]?.finish_reason,
      }
    }

    lastStatus = response.status
    lastBody = await response.text()

    // Nothing special-cased. A free attempt that failed for any reason —
    // rate limit, no credit, slug does not exist, schema unsupported — falls
    // through to the paid model below. The loop ends naturally after the paid
    // attempt, which is the last entry.
  }

  throw new ModelError(
    `the model provider refused the request (${lastStatus}): ${lastBody.slice(0, 200)}`,
    lastStatus === 429 ? 429 : 502,
  )
}
