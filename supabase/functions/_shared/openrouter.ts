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
  /** Tools the model asked for this turn. Empty unless `tools` was passed. */
  toolCalls?: ToolCall[]
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
 *
 * ── AND A THIRD TIME, 2026-08-15 ────────────────────────────────────────────
 * Both times above, the cap was sized against the ANSWER. It is not an answer
 * budget: on a reasoning model it is shared between thinking and answering, and
 * the thinking goes first. `nvidia/nemotron-3-super-120b-a12b:free` spent 3627
 * to 4485 completion tokens on a routine whose JSON is a few hundred — the rest
 * was reasoning, inside the same ceiling.
 *
 * Which is why the ledger for that day reads exactly backwards: generate-routine
 * at 6000 succeeded three times, coach-notes at 1600 and coach-brief at 400
 * failed thirteen times between them, all on the same slug, all interleaved
 * within four minutes. The surface with the largest output was the only one with
 * room to think. The other two truncated inside the reasoning block and returned
 * a fragment, which every parser reads as "unreadable".
 *
 * So: `finish_reason === 'length'` is now caught HERE rather than in one of the
 * three callers, it fails that attempt rather than returning a fragment, and the
 * caps below leave room for a model that thinks before it answers.
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

/** OpenAI-shaped tool definition, which is what OpenRouter proxies. */
export interface ToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

/** One message in the conversation, in the provider's wire shape. */
type Message =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant'
      content: string | null
      tool_calls?: {
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }[]
    }
  | { role: 'tool'; tool_call_id: string; content: string }

async function callOnce(
  model: string,
  messages: Message[],
  apiKey: string,
  maxTokens: number,
  jsonSchema?: Record<string, unknown>,
  tools?: ToolSpec[],
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
        // The system prompt is static per feature and goes first, which is
        // what lets a provider prompt-cache it across every user. The per-user
        // block is the only part that varies, and tool results are appended
        // after it rather than folded into the system message — inlining them
        // would invalidate the cached prefix on every turn.
        messages,
        ...(tools && tools.length > 0
          ? {
              tools: tools.map((tool) => ({
                type: 'function',
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.parameters,
                },
              })),
            }
          : {}),
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
export async function chat(options: {
  freeModel: string | undefined
  paidModel: string
  system: string
  user: string
  jsonSchema?: Record<string, unknown>
  /** Raise this for anything whose output is a nested structure. */
  maxTokens?: number
}): Promise<ChatResult> {
  return await converse({ ...options, messages: undefined })
}

/**
 * The single-turn call, and the one turn of a tool loop.
 *
 * Split out from `chat()` so the loop can hand it a growing conversation
 * without every caller having to know about messages.
 */
async function converse({
  freeModel,
  paidModel,
  system,
  user,
  jsonSchema,
  tools,
  messages,
  maxTokens = DEFAULT_MAX_TOKENS,
}: {
  freeModel: string | undefined
  paidModel: string
  system: string
  user: string
  jsonSchema?: Record<string, unknown>
  tools?: ToolSpec[]
  messages?: Message[]
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

  const wire: Message[] = messages ?? [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]

  let lastStatus = 502
  let lastBody = ''
  /** Set when the reason is more specific than the HTTP status. */
  let lastCode: string | null = null

  for (const attempt of attempts) {
    let response: Response
    try {
      response = await callOnce(
        attempt.model,
        wire,
        apiKey,
        maxTokens,
        jsonSchema,
        tools,
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
        choices?: {
          message?: {
            content?: string
            tool_calls?: {
              id: string
              function?: { name?: string; arguments?: string }
            }[]
          }
          finish_reason?: string
        }[]
        // Token counts, which the ledger needs to answer "what does this cost
        // per active user" — the question §12 promises and could not compute.
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }
      const message = payload.choices?.[0]?.message
      const rawCalls = message?.tool_calls ?? []
      const content = message?.content
      const finishReason = payload.choices?.[0]?.finish_reason

      // A turn that asks for tools is a valid turn with no prose in it, so
      // "no content" is only a failure when nothing was requested either.
      if (!content && rawCalls.length === 0) {
        lastStatus = 502
        lastBody = 'the model returned no content'
        lastCode = 'no_content'
        continue
      }

      // A response cut off at the ceiling is not a response. Every caller here
      // asks for a JSON object, and half an object parses as nothing — which is
      // how "the review came back unreadable" was the symptom of a token cap
      // three separate times. Rejecting it at the source means one attempt's
      // truncation falls through to the paid model (a different provider, which
      // may not spend the budget thinking) instead of being handed upward as a
      // fragment, and means the ledger records `truncated` rather than `parse`.
      if (finishReason === 'length') {
        lastStatus = 502
        lastBody = `the model ran out of room at max_tokens=${maxTokens}`
        lastCode = 'truncated'
        continue
      }

      consecutiveFailures = 0
      return {
        content: content ?? '',
        model: attempt.model,
        usedFree: attempt.free,
        finishReason,
        tokensIn: payload.usage?.prompt_tokens,
        tokensOut: payload.usage?.completion_tokens,
        toolCalls: rawCalls.map((call) => ({
          id: call.id,
          name: call.function?.name ?? '',
          // A model can emit malformed JSON here. An unparseable argument
          // object is an empty one, and the tool's own validation refuses it
          // — better than throwing away the whole turn.
          args: safeArgs(call.function?.arguments),
        })),
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
    lastCode ??
      (lastStatus === 429
        ? 'provider_429'
        : lastStatus === 504
          ? 'timeout'
          : `provider_${lastStatus}`),
  )
}

function safeArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/** One tool call and what came back, for the ledger and for debugging. */
export interface TraceEntry {
  tool: string
  args: Record<string, unknown>
  /** How many rows the tool returned. `null` when it refused. */
  rows: number | null
  error?: string
}

export interface ConversationResult extends ChatResult {
  trace: TraceEntry[]
}

/**
 * A model that can ask the database a second question.
 *
 * `docs/INFRASTRUCTURE_AUDIT.md` §3-A1: `chat()` was one-shot, so the coach
 * was only ever as deep as one query. `coach_stats()` is a 90-day window and
 * the top 12 lifts — "why did my bench stall in March?" was unanswerable, not
 * because the data was missing but because there was no way to ask for it.
 *
 * This is the whole retrieval mechanism, and it is deliberately generic and in
 * `_shared`: built once here, every AI surface after it inherits it. Built per
 * feature, it would be three half-versions.
 *
 * **This is not RAG and does not want to be.** The corpus is a schema, so the
 * right retrieval is a whitelisted, parameterised, RLS-scoped SQL function —
 * see DECISIONS.md, 2026-08-08.
 *
 * Three bounds, each of which is a cost or a safety property:
 *
 *  - `maxToolCalls` (default 4) — after that the model is told to answer with
 *    what it has. A loop with no ceiling is an unbounded bill.
 *  - The runner is a **map of named functions**. A tool the model invents does
 *    not run; it gets an error back and continues, which is a better turn than
 *    a thrown request.
 *  - Every call is traced, because `tool_calls` in the ledger is how a
 *    question's real cost gets measured and how a wrong answer gets explained.
 */
export async function converseWithTools({
  freeModel,
  paidModel,
  system,
  user,
  tools,
  run,
  jsonSchema,
  maxTokens = DEFAULT_MAX_TOKENS,
  maxToolCalls = 4,
}: {
  freeModel: string | undefined
  paidModel: string
  system: string
  user: string
  tools: ToolSpec[]
  /** Executes one call. Throwing is fine — it becomes a tool error message. */
  run: (call: ToolCall) => Promise<{ rows: number; result: unknown }>
  jsonSchema?: Record<string, unknown>
  maxTokens?: number
  maxToolCalls?: number
}): Promise<ConversationResult> {
  const messages: Message[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
  const trace: TraceEntry[] = []
  let used = 0
  let last: ChatResult | null = null

  // `+ 1`: the final pass is the one that must answer, and it is the pass in
  // which tools are withheld. Without the extra iteration a model that used
  // its whole budget would never get a turn to speak.
  for (let turn = 0; turn <= maxToolCalls + 1; turn++) {
    const exhausted = used >= maxToolCalls
    last = await converse({
      freeModel,
      paidModel,
      system,
      user,
      messages,
      // Withholding the tools is what ends the loop, rather than asking
      // politely in a prompt and hoping. A model cannot call what it cannot
      // see. The schema is applied only on the answering turn, because a
      // response_format that demands the final object would refuse a turn
      // whose whole content is a tool call.
      tools: exhausted ? undefined : tools,
      jsonSchema: exhausted ? jsonSchema : undefined,
      maxTokens,
    })

    const calls = last.toolCalls ?? []
    if (calls.length === 0 || exhausted) {
      return { ...last, trace }
    }

    // The assistant turn is rebuilt from the parsed fields rather than echoed
    // back from the response. A test caught the alternative: the first version
    // pushed the provider's raw `message` object, which works only while every
    // provider includes `role` in it. Reconstructing keeps the tool-call ids,
    // which is the part that actually has to match.
    messages.push({
      role: 'assistant',
      content: last.content || null,
      tool_calls: calls.map((call) => ({
        id: call.id,
        type: 'function' as const,
        function: { name: call.name, arguments: JSON.stringify(call.args) },
      })),
    })

    for (const call of calls) {
      if (used >= maxToolCalls) {
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: 'No further lookups are available. Answer with what you have.',
        })
        continue
      }
      used += 1

      const known = tools.some((tool) => tool.name === call.name)
      if (!known) {
        // A model told to pick from a list will still occasionally invent one
        // — the same lesson `validate-plan` exists for.
        trace.push({
          tool: call.name,
          args: call.args,
          rows: null,
          error: 'unknown tool',
        })
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: `There is no tool called ${call.name}.`,
        })
        continue
      }

      try {
        const { rows, result } = await run(call)
        trace.push({ tool: call.name, args: call.args, rows })
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        })
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        trace.push({ tool: call.name, args: call.args, rows: null, error: detail })
        // The model gets a plain refusal rather than our error text, which
        // could carry column names or a stack.
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: 'That lookup failed. Answer using the other results.',
        })
      }
    }
  }

  // Unreachable in practice — the loop returns on the exhausted pass. Kept as
  // a real error rather than a non-null assertion.
  if (!last) throw new ModelError('the tool loop produced no answer', 502, 'no_answer')
  return { ...last, trace }
}
