import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ModelError,
  chat,
  resetBreaker,
} from '../../supabase/functions/_shared/openrouter'

/**
 * What `chat()` does with an answer that stopped early.
 *
 * `max_tokens` is not an answer budget. On a reasoning model it is shared
 * between the thinking and the answer, and the thinking goes first — so a
 * ceiling sized against the output can be spent before the output starts.
 *
 * On 2026-08-15 that produced a ledger reading exactly backwards:
 * generate-routine at 6000 tokens succeeded three times while coach-notes at
 * 1600 and coach-brief at 400 failed thirteen times between them, on the same
 * model, interleaved within four minutes. The surface with the largest output
 * was the only one with room to think in. Both of the others returned a
 * fragment of a JSON object, and both reported it to the user as "came back
 * unreadable" — which sends whoever reads that message looking at the prompt
 * rather than at the ceiling.
 *
 * So truncation is caught here now, at the one place that can see
 * `finish_reason`, rather than in one of the three callers (it was, in exactly
 * one of them). Half an object is not an answer: it fails the attempt.
 *
 * `Deno.env` and `fetch` are stubbed the same way `tool-loop.test.ts` stubs
 * them, so this runs in the ordinary suite with no network and no Deno.
 */

interface StubTurn {
  content?: string
  finishReason?: string
  status?: number
}

let turns: StubTurn[] = []
let models: string[] = []
const originalFetch = globalThis.fetch

beforeEach(() => {
  turns = []
  models = []
  resetBreaker()
  ;(globalThis as { Deno?: unknown }).Deno = {
    env: {
      get: (key: string) => (key === 'OPENROUTER_API_KEY' ? 'test-key' : undefined),
    },
  }
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { model: string }
    models.push(body.model)
    const turn = turns.shift() ?? { content: '{"ok":true}' }
    if (turn.status && turn.status >= 400) {
      return {
        ok: false,
        status: turn.status,
        text: async () => 'refused',
      } as unknown as Response
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: { content: turn.content ?? '{"ok":true}' },
            finish_reason: turn.finishReason ?? 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      }),
    } as unknown as Response
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
  delete (globalThis as { Deno?: unknown }).Deno
  resetBreaker()
})

const call = () =>
  chat({
    freeModel: 'free/model',
    paidModel: 'paid/model',
    system: 'system',
    user: 'user',
    maxTokens: 400,
  })

describe('chat', () => {
  it('returns the free answer when it finished', async () => {
    turns = [{ content: '{"line":"good"}' }]
    const result = await call()
    expect(result.content).toBe('{"line":"good"}')
    expect(result.usedFree).toBe(true)
    // No paid call. The free attempt worked, so nothing was spent proving it.
    expect(models).toEqual(['free/model'])
  })

  it('falls through to the paid model when the free one ran out of room', async () => {
    // The 2026-08-15 shape: the free model thinks until the ceiling and stops
    // mid-object. A truncated free answer is a failed optimisation, and the
    // documented rule for those is that they cost latency, never the result.
    turns = [
      { content: '{"headline":"Solid we', finishReason: 'length' },
      { content: '{"headline":"Solid week"}' },
    ]
    const result = await call()
    expect(result.content).toBe('{"headline":"Solid week"}')
    expect(result.usedFree).toBe(false)
    expect(models).toEqual(['free/model', 'paid/model'])
  })

  it('never hands a fragment upward as if it were an answer', async () => {
    // The whole defect in one assertion. Before this, the half-object below was
    // returned with `finishReason: 'length'` attached, two of the three callers
    // ignored that field, and the user was told their review was unreadable.
    turns = [
      { content: '{"headline":"Solid we', finishReason: 'length' },
      { content: '{"sections":{"adherence":{"line":"You trai', finishReason: 'length' },
    ]
    const error = await call().catch((e: ModelError) => e)
    expect(error).toBeInstanceOf(ModelError)
    expect((error as ModelError).code).toBe('truncated')
  })

  it('says how much room there was, so the fix is a number and not a guess', async () => {
    turns = [
      { content: 'cut', finishReason: 'length' },
      { content: 'cut', finishReason: 'length' },
    ]
    await expect(call()).rejects.toThrow('max_tokens=400')
  })

  it('reports an empty answer under its own code rather than the HTTP status', async () => {
    turns = [{ content: '' }, { content: '' }]
    await expect(call().catch((e: ModelError) => e.code)).resolves.toBe('no_content')
  })

  it("does not carry the free attempt's reason onto the paid attempt", async () => {
    // The free model truncates; the paid one is rate-limited. These are
    // different problems with different fixes, and only the second one is why
    // the call failed. Without clearing the code per attempt this threw
    // `truncated` for a 429 — which made generate-routine tell the user to try
    // fewer days for a rate limit, and wrote a token cap into the ledger as the
    // cause of a throttle.
    turns = [{ content: 'cut', finishReason: 'length' }, { status: 429 }]
    const error = await call().catch((e: ModelError) => e)
    expect((error as ModelError).code).toBe('provider_429')
    expect((error as ModelError).status).toBe(429)
  })

  it('still reports a provider refusal as a provider refusal', async () => {
    // The new codes are more specific than the status, not a replacement for
    // it: a 429 is still a 429 and still the thing that means "slow down".
    turns = [{ status: 429 }, { status: 429 }]
    const error = await call().catch((e: ModelError) => e)
    expect((error as ModelError).code).toBe('provider_429')
    expect((error as ModelError).status).toBe(429)
  })
})
