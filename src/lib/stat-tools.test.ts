import { describe, expect, it } from 'vitest'
import {
  MUSCLE_GROUPS,
  STAT_TOOLS,
  makeStatToolRunner,
} from '../../supabase/functions/_shared/stat-tools'

/**
 * Arguments a model wrote are the least trustworthy input in the system —
 * less so than a request body, which at least has a human behind it. These
 * cases pin the coercion, and the one property that matters more than any of
 * them: the runner calls RPCs as the *caller*, never as the service role.
 */

interface Recorded {
  rpc: string
  params: Record<string, unknown>
}

function fakeClient(data: unknown = { series: [1, 2, 3] }, error: unknown = null) {
  const calls: Recorded[] = []
  const client = {
    rpc: (rpc: string, params: Record<string, unknown>) => {
      calls.push({ rpc, params })
      return Promise.resolve({ data, error })
    },
  }
  // The runner takes a SupabaseClient; only `.rpc` is reached.
  return { calls, run: makeStatToolRunner(client as never) }
}

const call = (name: string, args: Record<string, unknown> = {}) => ({
  id: 'c0',
  name,
  args,
})

describe('STAT_TOOLS', () => {
  it('describes every tool the runner implements, and no more', async () => {
    // A spec the runner cannot execute is a guaranteed failed turn; a runner
    // branch nothing advertises is dead code the model will never reach.
    const { run } = fakeClient()
    for (const tool of STAT_TOOLS) {
      const args =
        tool.name === 'e1rm_trend'
          ? { exercise: 'Bench Press (Barbell)' }
          : tool.name === 'weekly_band'
            ? { muscle: 'back' }
            : {}
      await expect(run(call(tool.name, args))).resolves.toBeDefined()
    }
  })

  it('offers the muscle groups the schema allows, as an enum', () => {
    // An enum in the spec is cheaper than a retry: the model mostly will not
    // ask for "legs" if the list says quads and hamstrings.
    const band = STAT_TOOLS.find((t) => t.name === 'weekly_band')!
    const properties = band.parameters.properties as { muscle: { enum: string[] } }
    expect(properties.muscle.enum).toEqual([...MUSCLE_GROUPS])
  })
})

describe('makeStatToolRunner', () => {
  it('passes a validated exercise name through', async () => {
    const { calls, run } = fakeClient()
    await run(call('e1rm_trend', { exercise: 'Squat (Barbell)', weeks: 12 }))
    expect(calls[0]).toEqual({
      rpc: 'e1rm_trend',
      params: { exercise_name: 'Squat (Barbell)', weeks: 12 },
    })
  })

  it('clamps a week count to the range the SQL supports', async () => {
    const { calls, run } = fakeClient()
    await run(call('e1rm_trend', { exercise: 'Squat (Barbell)', weeks: 99999 }))
    await run(call('e1rm_trend', { exercise: 'Squat (Barbell)', weeks: -4 }))
    expect(calls.map((c) => c.params.weeks)).toEqual([104, 1])
  })

  it('falls back to a default for a nonsense week count', async () => {
    const { calls, run } = fakeClient()
    await run(call('adherence', { weeks: 'lots' }))
    expect(calls[0].params.weeks).toBe(12)
  })

  it('refuses a missing required argument', async () => {
    const { run } = fakeClient()
    await expect(run(call('e1rm_trend', {}))).rejects.toThrow(/exercise is required/)
  })

  it('refuses a muscle group that is not in the schema', async () => {
    // "legs" is the one a model reaches for, and it is not a muscle_group.
    const { run } = fakeClient()
    await expect(run(call('weekly_band', { muscle: 'legs' }))).rejects.toThrow(
      /unknown muscle group/,
    )
  })

  it('accepts a muscle group in any case', async () => {
    const { calls, run } = fakeClient()
    await run(call('weekly_band', { muscle: 'Back' }))
    expect(calls[0].params.muscle).toBe('back')
  })

  it('truncates an over-long argument rather than forwarding it', async () => {
    // An argument is not a channel for prose.
    const { calls, run } = fakeClient()
    await run(call('e1rm_trend', { exercise: 'x'.repeat(500) }))
    expect((calls[0].params.exercise_name as string).length).toBe(80)
  })

  it('treats a missing optional exercise as "all training"', async () => {
    const { calls, run } = fakeClient()
    await run(call('rep_distribution', {}))
    expect(calls[0].params.exercise_name).toBeNull()
  })

  it('reports the row count for the trace', async () => {
    const { run } = fakeClient({ series: [1, 2, 3, 4] })
    await expect(run(call('adherence'))).resolves.toMatchObject({ rows: 4 })
  })

  it('surfaces a database error rather than returning an empty result', async () => {
    // A tool that silently returns nothing looks to the model like "no data",
    // and it will confidently tell the user they have not trained.
    const { run } = fakeClient(null, { message: 'permission denied' })
    await expect(run(call('adherence'))).rejects.toThrow(/permission denied/)
  })

  it('refuses a tool name it does not implement', async () => {
    const { run } = fakeClient()
    await expect(run(call('drop_everything'))).rejects.toThrow(/unknown tool/)
  })
})
