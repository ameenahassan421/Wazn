// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Crash reporting has two ways to make things worse, and both are tested here
 * rather than reasoned about.
 *
 * The first is volume: a component that throws on every render would insert a
 * row per attempt, so the reporter can take down the database it reports to.
 * The second is the one that matters more — Wazn's invite links carry a token
 * in the query string, and Supabase's OAuth and recovery redirects land with
 * an access token in the **hash**. The obvious "which page was it on" field is
 * `location.href`, and shipping that would have written live credentials into
 * a table.
 */

const inserted: Record<string, unknown>[] = []
let hasSession = true

vi.mock('./supabase', () => ({
  describeError: (context: string) => context,
  supabase: {
    from: () => ({
      insert: (payload: Record<string, unknown>) => {
        inserted.push(payload)
        return Promise.resolve({ error: null })
      },
    }),
    auth: {
      getSession: () =>
        Promise.resolve({
          data: { session: hasSession ? { user: { id: 'u' } } : null },
        }),
    },
  },
}))

const { reportError, resetReportingForTests } = await import('./report-error')

beforeEach(() => {
  inserted.length = 0
  hasSession = true
  resetReportingForTests()
  window.history.replaceState({}, '', '/')
})

describe('reportError', () => {
  it('records the message and the boundary that caught it', async () => {
    await reportError({ error: new TypeError('x is undefined'), boundary: 'progress' })
    expect(inserted).toHaveLength(1)
    expect(inserted[0].message).toBe('TypeError: x is undefined')
    expect(inserted[0].boundary).toBe('progress')
  })

  it('never sends the query string — invite links carry a token there', async () => {
    window.history.replaceState({}, '', '/?invite=abc123secret')
    await reportError({ error: new Error('boom'), boundary: 'friends' })
    expect(inserted[0].path).toBe('/')
    expect(JSON.stringify(inserted[0])).not.toContain('abc123secret')
  })

  it('never sends the hash — OAuth and recovery land an access token there', async () => {
    window.history.replaceState({}, '', '/#access_token=live-token-value')
    await reportError({ error: new Error('boom'), boundary: 'root' })
    expect(inserted[0].path).toBe('/')
    expect(JSON.stringify(inserted[0])).not.toContain('live-token-value')
  })

  it('sends an identical failure once, however many times it throws', async () => {
    // A render loop is the normal way a boundary trips repeatedly.
    for (let i = 0; i < 20; i++) {
      await reportError({ error: new Error('same'), boundary: 'log' })
    }
    expect(inserted).toHaveLength(1)
  })

  it('caps a session even when every failure is different', async () => {
    for (let i = 0; i < 20; i++) {
      await reportError({ error: new Error(`different ${i}`), boundary: 'log' })
    }
    expect(inserted).toHaveLength(5)
  })

  it('separates the same message caught by different boundaries', async () => {
    await reportError({ error: new Error('same'), boundary: 'log' })
    await reportError({ error: new Error('same'), boundary: 'root' })
    expect(inserted).toHaveLength(2)
  })

  it('writes nothing when signed out', async () => {
    // There is no auth.uid() for the row to belong to, and the insert policy
    // would refuse it — so this would be a guaranteed-failing round trip.
    hasSession = false
    await reportError({ error: new Error('boom'), boundary: 'root' })
    expect(inserted).toHaveLength(0)
  })

  it('survives a non-Error being thrown', async () => {
    // `throw 'string'` is legal JavaScript and libraries do it.
    await reportError({ error: 'just a string', boundary: 'log' })
    expect(inserted[0].message).toBe('just a string')
  })

  it('never rejects, so a caller can ignore the promise', async () => {
    hasSession = true
    await expect(
      reportError({ error: new Error('boom'), boundary: 'log' }),
    ).resolves.toBeUndefined()
  })
})
