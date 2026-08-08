import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * The tool loop's bounds.
 *
 * This is the retrieval mechanism every AI surface after B3 inherits
 * (`docs/INFRASTRUCTURE_AUDIT.md` §3-A1), and the things worth testing about
 * it are the ones that cost money or leak: does it stop, does it stop even
 * when the model keeps asking, what happens when the model invents a tool, and
 * what reaches the model when a lookup throws.
 *
 * Both `Deno.env` and `fetch` are stubbed, so this runs in the ordinary suite
 * with no network and no Deno — the same trick that lets vitest reach any of
 * `supabase/functions/_shared`.
 */

interface StubTurn {
  toolCalls?: { name: string; args?: Record<string, unknown> }[]
  content?: string
}

let turns: StubTurn[] = []
let requests: Record<string, unknown>[] = []
const originalFetch = globalThis.fetch

beforeEach(() => {
  turns = []
  requests = []
  ;(globalThis as { Deno?: unknown }).Deno = {
    env: {
      get: (key: string) => (key === 'OPENROUTER_API_KEY' ? 'test-key' : undefined),
    },
  }
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>
    requests.push(body)
    // A real model cannot ask for a tool it was not offered, so the stub does
    // not either. Getting this wrong hid the loop's actual behaviour on the
    // answering turn behind an impossible response.
    const turn = body.tools
      ? (turns.shift() ?? { content: '{"answer":"done"}' })
      : { content: '{"answer":"forced"}' }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: turn.content ?? null,
              tool_calls: turn.toolCalls?.map((call, i) => ({
                id: `call-${i}`,
                type: 'function',
                function: {
                  name: call.name,
                  arguments: JSON.stringify(call.args ?? {}),
                },
              })),
            },
            finish_reason: turn.toolCalls ? 'tool_calls' : 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      }),
    } as unknown as Response
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

const { converseWithTools, resetBreaker } =
  await import('../../supabase/functions/_shared/openrouter')

const TOOLS = [
  {
    name: 'e1rm_trend',
    description: 'Estimated 1RM over time for one exercise.',
    parameters: { type: 'object', properties: { exercise: { type: 'string' } } },
  },
  {
    name: 'weekly_band',
    description: 'Working sets per week for one muscle group.',
    parameters: { type: 'object', properties: { muscle: { type: 'string' } } },
  },
]

function loop(
  overrides: Partial<Parameters<typeof converseWithTools>[0]> = {},
): ReturnType<typeof converseWithTools> {
  resetBreaker()
  return converseWithTools({
    freeModel: undefined,
    paidModel: 'test/model',
    system: 'system',
    user: 'why is my bench stuck?',
    tools: TOOLS,
    run: async () => ({ rows: 3, result: [{ e1rm: 102.4 }] }),
    ...overrides,
  })
}

describe('converseWithTools', () => {
  it('answers directly when the model asks for nothing', async () => {
    turns = [{ content: '{"answer":"no tools needed"}' }]
    const result = await loop()
    expect(result.content).toContain('no tools needed')
    expect(result.trace).toEqual([])
  })

  it('runs a requested tool and feeds the result back', async () => {
    turns = [
      {
        toolCalls: [
          { name: 'e1rm_trend', args: { exercise: 'Bench Press (Barbell)' } },
        ],
      },
      { content: '{"answer":"it is flat"}' },
    ]
    const result = await loop()
    expect(result.trace).toEqual([
      { tool: 'e1rm_trend', args: { exercise: 'Bench Press (Barbell)' }, rows: 3 },
    ])
    expect(result.content).toContain('it is flat')

    // The tool result goes back as a `tool` message, not folded into the
    // system prompt — inlining it would invalidate the cached prefix.
    const second = requests[1].messages as { role: string }[]
    expect(second.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'tool'])
  })

  it('stops asking after the call budget and still answers', async () => {
    // A model that never stops asking is an unbounded bill. Twelve requests
    // offered, four allowed.
    turns = Array.from({ length: 12 }, () => ({
      toolCalls: [{ name: 'weekly_band', args: { muscle: 'back' } }],
    }))

    const result = await loop({ maxToolCalls: 4 })
    expect(result.trace).toHaveLength(4)
    expect(result.content).toContain('forced')
  })

  it('withholds the tools on the answering turn rather than asking nicely', async () => {
    // A model cannot call what it cannot see. Relying on a prompt instruction
    // to stop is how a loop becomes unbounded.
    turns = [
      { toolCalls: [{ name: 'weekly_band' }] },
      { toolCalls: [{ name: 'weekly_band' }] },
      { content: '{"answer":"done"}' },
    ]
    await loop({ maxToolCalls: 2 })
    const finalRequest = requests[requests.length - 1]
    expect(finalRequest.tools).toBeUndefined()
  })

  it('refuses a tool the model invented, without failing the turn', async () => {
    // A model told to pick from a list will still occasionally invent one —
    // the lesson validate-plan exists for.
    turns = [
      { toolCalls: [{ name: 'read_user_emails', args: {} }] },
      { content: '{"answer":"recovered"}' },
    ]
    const result = await loop()
    expect(result.trace[0]).toMatchObject({
      tool: 'read_user_emails',
      error: 'unknown tool',
    })
    expect(result.content).toContain('recovered')
  })

  it('never sends our error text to the model when a lookup throws', async () => {
    // An exception here could carry a column name, a policy name, or a stack.
    turns = [
      { toolCalls: [{ name: 'e1rm_trend' }] },
      { content: '{"answer":"carried on"}' },
    ]
    const result = await loop({
      run: async () => {
        throw new Error('relation "private.can_view" does not exist')
      },
    })
    expect(result.trace[0].error).toContain('private.can_view')

    const sentToModel = JSON.stringify(requests[1].messages)
    expect(sentToModel).not.toContain('private.can_view')
    expect(sentToModel).toContain('That lookup failed')
  })

  it('runs several tools requested in one turn', async () => {
    turns = [
      {
        toolCalls: [
          { name: 'e1rm_trend', args: { exercise: 'Squat (Barbell)' } },
          { name: 'weekly_band', args: { muscle: 'quads' } },
        ],
      },
      { content: '{"answer":"both"}' },
    ]
    const result = await loop()
    expect(result.trace.map((t) => t.tool)).toEqual(['e1rm_trend', 'weekly_band'])
  })

  it('treats unparseable tool arguments as empty rather than throwing', async () => {
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
      requests.push(JSON.parse(init.body))
      const first = requests.length === 1
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: first
                ? {
                    content: null,
                    tool_calls: [
                      {
                        id: 'c0',
                        type: 'function',
                        function: { name: 'weekly_band', arguments: '{not json' },
                      },
                    ],
                  }
                : { content: '{"answer":"ok"}' },
            },
          ],
        }),
      } as unknown as Response
    }) as typeof fetch

    const result = await loop()
    expect(result.trace[0].args).toEqual({})
  })
})
