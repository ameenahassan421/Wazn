import { describe, expect, it } from 'vitest'

import { weekStartUtc } from '../../supabase/functions/_shared/week.ts'

/**
 * `weekStartUtc` lives in `supabase/functions/_shared/` because an Edge
 * Function needs it, and there is no Deno test harness in this repo. Vitest can
 * read the file directly because it has no imports of its own, so the arithmetic
 * gets a check rather than a `deno check`.
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
    // The whole point. A review written late on Sunday is not about the week
    // that starts the next morning, and treating those as one week is the
    // defect this function was extracted to fix.
    expect(weekStartUtc('2026-08-23T21:52:54Z')).toBe('2026-08-17')
    expect(weekStartUtc('2026-08-24T09:00:00Z')).toBe('2026-08-24')
    expect(weekStartUtc('2026-08-23T21:52:54Z')).not.toBe(
      weekStartUtc('2026-08-24T09:00:00Z'),
    )
  })

  it('crosses a month and a year boundary without drifting', () => {
    expect(weekStartUtc('2026-01-01T12:00:00Z')).toBe('2025-12-29')
    expect(weekStartUtc('2026-03-02T00:00:00Z')).toBe('2026-03-02')
  })
})
