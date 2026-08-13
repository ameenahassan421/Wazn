import { describe, expect, it } from 'vitest'
import {
  QUOTAS,
  quotaMessage,
  quotaWindowStart,
  remaining,
} from '../../supabase/functions/_shared/quota'

/**
 * Quota is UX and money at once, and until now it had no tests — not by
 * choice, but because the arithmetic lived inside `context.ts`, which imports
 * `Deno.env` and a remote client, so nothing in this suite could reach it
 * (`docs/INFRASTRUCTURE_AUDIT.md` §5-I1).
 *
 * The bug it has already produced was arithmetic in the surrounding logic:
 * two users spent their single weekly regenerate on an empty account and were
 * locked out for seven days, including after they started training. These are
 * the cases that pin the numbers that refusal is computed from.
 */

// A fixed instant, so the window boundaries are assertions rather than
// approximations. 2026-08-08T12:00:00Z.
const NOW = Date.UTC(2026, 7, 8, 12, 0, 0)

describe('quotaWindowStart', () => {
  it('opens the coach window exactly seven days back', () => {
    expect(quotaWindowStart('coach_notes', NOW)).toBe('2026-08-01T12:00:00.000Z')
  })

  it('opens the routine window exactly thirty days back', () => {
    expect(quotaWindowStart('routine', NOW)).toBe('2026-07-09T12:00:00.000Z')
  })

  it('is an ISO-8601 UTC string, which is what PostgREST gte compares', () => {
    expect(quotaWindowStart('coach_notes', NOW)).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    )
  })

  it('moves with the clock rather than snapping to a calendar boundary', () => {
    // A rolling window, not "since Monday". A user who regenerates on Sunday
    // night should wait seven days, not until the next Monday.
    const oneHourLater = quotaWindowStart('coach_notes', NOW + 3_600_000)
    expect(oneHourLater).toBe('2026-08-01T13:00:00.000Z')
  })
})

describe('remaining', () => {
  it('is the full limit when nothing has been used', () => {
    expect(remaining('coach_notes', 0)).toBe(QUOTAS.coach_notes.limit)
    expect(remaining('routine', 0)).toBe(QUOTAS.routine.limit)
  })

  it('counts down', () => {
    expect(remaining('routine', 1)).toBe(29)
    expect(remaining('routine', 29)).toBe(1)
  })

  it('is zero, never negative, past the limit', () => {
    // A limit lowered after the fact leaves users over it. "-2 left this
    // month" in the Coach footer is worse than the refusal it describes.
    expect(remaining('routine', 30)).toBe(0)
    expect(remaining('routine', 99)).toBe(0)
  })

  it('treats a nonsense negative count as none used', () => {
    expect(remaining('coach_notes', -5)).toBe(QUOTAS.coach_notes.limit)
  })
})

describe('quotaMessage', () => {
  it('names the real routine limit rather than a hardcoded number', () => {
    // The copy and the table have to agree: a refusal citing a limit the
    // table does not hold is how a limit starts reading as a fault.
    expect(quotaMessage('routine')).toContain(String(QUOTAS.routine.limit))
  })

  it('always leaves the user something they can still do', () => {
    // Under the one law, a dead end mid-session costs more than the limit
    // saves. Both messages point at a next action.
    expect(quotaMessage('routine')).toMatch(/by hand/)
    expect(quotaMessage('coach_notes')).toMatch(/refresh|log/)
  })

  it('is plain, with no exclamation and no apology', () => {
    for (const feature of ['routine', 'coach_notes'] as const) {
      expect(quotaMessage(feature)).not.toMatch(/!|sorry/i)
    }
  })
})
