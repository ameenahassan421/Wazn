import { describe, expect, it } from 'vitest'

import { weekStartUtc } from '../../supabase/functions/_shared/week.ts'

/**
 * `weekStartUtc` lives in `supabase/functions/_shared/` because an Edge
 * Function needs it and this repo has no Deno test harness. Vitest reaches it
 * because it is plain TypeScript with no Deno APIs, which is the same rule
 * `has-training-data.ts` states and the same reason eleven other `_shared`
 * modules are already tested from here.
 */
describe('weekStartUtc', () => {
  it('returns the Monday of the containing week, from any day in it', () => {
    // 2026-08-24 is a Monday. Every day of that week must answer with it.
    for (const day of [
      '2026-08-24T00:00:00Z',
      '2026-08-24T23:59:59Z',
      '2026-08-27T12:00:00Z',
      '2026-08-30T23:59:59Z', // Sunday, the last day of the same week
    ]) {
      expect(weekStartUtc(day)).toBe('2026-08-24')
    }
  })

  it('puts Sunday and the Monday after it in DIFFERENT weeks', () => {
    // The whole point, at the exact timestamp production held: a review written
    // late on Sunday is not about the week that starts the next morning.
    expect(weekStartUtc('2026-08-23T21:52:54Z')).toBe('2026-08-17')
    expect(weekStartUtc('2026-08-24T09:00:00Z')).toBe('2026-08-24')
  })

  it('rolls back across a month and a year boundary', () => {
    // 2026-03-01 is a SUNDAY, so this one actually crosses. An earlier version
    // of this test used 2026-03-02, which is itself a Monday: the assertion was
    // an identity that a broken implementation would still pass.
    expect(weekStartUtc('2026-03-01T00:00:00Z')).toBe('2026-02-23')
    expect(weekStartUtc('2026-01-01T12:00:00Z')).toBe('2025-12-29')
  })

  it('answers null for an unreadable instant rather than throwing', () => {
    // The caller reads a stored timestamp on the path that serves a cached
    // review. A throw there is a 500 in place of a graceful degrade.
    expect(weekStartUtc('not a date')).toBeNull()
    expect(weekStartUtc(Number.NaN)).toBeNull()
  })
})
