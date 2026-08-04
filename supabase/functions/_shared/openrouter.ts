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

/** Every request is capped. A runaway generation is a bill, not a bug report. */
const MAX_TOKENS = 900
const TIMEOUT_MS = 45_000

async function callOnce(
  model: string,
  system: string,
  user: string,
  apiKey: string,
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
        max_tokens: MAX_TOKENS,
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
 * Falls back on 429 (rate limited) and on 402 (the free variant's own credit
 * rule). Anything else is a real failure and is surfaced — retrying a 400
 * against a paid model just pays for the same mistake.
 */
export async function chat({
  freeModel,
  paidModel,
  system,
  user,
  jsonSchema,
}: {
  freeModel: string | undefined
  paidModel: string
  system: string
  user: string
  jsonSchema?: Record<string, unknown>
}): Promise<ChatResult> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) {
    throw new ModelError('OPENROUTER_API_KEY is not set on this project', 503)
  }

  const attempts: { model: string; free: boolean }[] = []
  if (freeModel && freeModel !== paidModel) {
    attempts.push({ model: freeModel, free: true })
  }
  attempts.push({ model: paidModel, free: false })

  let lastStatus = 502
  let lastBody = ''

  for (const attempt of attempts) {
    let response: Response
    try {
      response = await callOnce(attempt.model, system, user, apiKey, jsonSchema)
    } catch (error) {
      // A timeout or a network fault on the free variant is worth one paid
      // retry; on the paid one there is nothing left to try.
      lastStatus = 504
      lastBody = error instanceof Error ? error.message : String(error)
      continue
    }

    if (response.ok) {
      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[]
      }
      const content = payload.choices?.[0]?.message?.content
      if (!content) {
        lastStatus = 502
        lastBody = 'the model returned no content'
        continue
      }
      return { content, model: attempt.model, usedFree: attempt.free }
    }

    lastStatus = response.status
    lastBody = await response.text()

    // 429: rate limited. 402: out of free credit. Both mean "try the paid
    // one"; everything else means the request itself was wrong.
    if (response.status !== 429 && response.status !== 402) break
  }

  throw new ModelError(
    `the model provider refused the request (${lastStatus}): ${lastBody.slice(0, 200)}`,
    lastStatus === 429 ? 429 : 502,
  )
}
