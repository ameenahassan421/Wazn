import { describe, expect, it } from 'vitest'
import { FREEZES_PER_MONTH, streakState } from './streak'
import type { WeekBucket } from './progress'

const NOW = new Date('2026-08-14T09:00:00') // a Friday

/**
 * Weeks ending with the one in progress, most recent last — the shape
 * `sessionsPerWeek()` returns.
 */
function weeks(counts: number[], now: Date = NOW): WeekBucket[] {
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  current.setDate(current.getDate() - ((current.getDay() + 6) % 7))
  return counts.map((sessions, i) => {
    const start = new Date(current)
    start.setDate(start.getDate() - (counts.length - 1 - i) * 7)
    return { start, sessions }
  })
}

describe('the streak counts weeks against the lifter’s own target', () => {
  it('counts a run of weeks that met it', () => {
    expect(streakState(weeks([3, 3, 3, 3]), 3, NOW).weeks).toBe(4)
  })

  it('does not count a week that came up short with no freeze left', () => {
    // Two freezes are spent on the first two short weeks; the third ends it.
    const s = streakState(weeks([1, 1, 1, 3, 3]), 3, NOW)
    expect(s.weeks).toBe(2)
  })

  it('reports this week’s sessions and the target beside them', () => {
    const s = streakState(weeks([3, 3, 2]), 3, NOW)
    expect(s.thisWeek).toBe(2)
    expect(s.target).toBe(3)
  })
})

describe('the week in progress can extend a run but never end one', () => {
  it('does not break the streak on a Tuesday with one of three logged', () => {
    // Calling a week a failure while five days of it are left is exactly the
    // anxiety the freeze system exists to avoid.
    const s = streakState(weeks([3, 3, 3, 1]), 3, NOW)
    expect(s.weeks).toBe(3)
  })

  it('extends the run the moment the target is met', () => {
    expect(streakState(weeks([3, 3, 3, 3]), 3, NOW).weeks).toBe(4)
  })
})

describe('freezes', () => {
  it('grants two a month', () => {
    expect(streakState(weeks([3, 3, 3]), 3, NOW).freezesLeft).toBe(FREEZES_PER_MONTH)
  })

  it('spends one silently to hold a short week', () => {
    const s = streakState(weeks([3, 3, 1, 3]), 3, NOW)
    expect(s.weeks).toBe(4)
    expect(s.freezesLeft).toBeLessThan(FREEZES_PER_MONTH)
  })

  it('names the hold afterwards rather than asking first', () => {
    // The most recent completed week fell short and the run still stands.
    const s = streakState(weeks([3, 3, 3, 1, 0]), 3, NOW)
    expect(s.heldByFreeze).toBe(true)
  })

  it('does not claim a hold when the week met the target on its own', () => {
    expect(streakState(weeks([3, 3, 3, 0]), 3, NOW).heldByFreeze).toBe(false)
  })

  it('runs out after two in the same month', () => {
    // Every short week here is in August: completed weeks are 07-27, 08-03,
    // 08-10, 08-17, with 08-24 in progress.
    const late = new Date('2026-08-28T09:00:00')
    const s = streakState(weeks([3, 1, 1, 1, 0], late), 3, late)
    expect(s.freezesLeft).toBe(0)
    // The third short week is where the run actually ends.
    expect(s.weeks).toBe(0)
  })

  it('grants a fresh two when the calendar turns over', () => {
    // The same four short weeks, straddling July and August: two freezes come
    // out of each month, so the run stands where a single month's would not.
    // The allowance is per calendar month by design — a bad fortnight that
    // happens to span the 1st is not a worse fortnight.
    const s = streakState(weeks([3, 1, 1, 1, 0]), 3, NOW)
    expect(s.weeks).toBe(4)
    expect(s.freezesLeft).toBe(1)
  })
})

describe('copy gets a record to state, never a loss', () => {
  it('carries the best run in the series', () => {
    const s = streakState(weeks([3, 3, 3, 3, 3, 0, 0, 0, 3, 0]), 3, NOW)
    expect(s.best).toBeGreaterThanOrEqual(5)
  })

  it('still reports a best after the current run has ended', () => {
    // Three short weeks all inside August, so both of that month's freezes are
    // spent and the third genuinely ends the run.
    const late = new Date('2026-08-28T09:00:00')
    const s = streakState(weeks([3, 3, 0, 0, 0, 0], late), 3, late)
    expect(s.weeks).toBe(0)
    expect(s.best).toBe(4)
  })
})

describe('edges', () => {
  it('answers for an account with no weeks at all', () => {
    const s = streakState([], 3, NOW)
    expect(s).toMatchObject({ weeks: 0, thisWeek: 0, best: 0, heldByFreeze: false })
    expect(s.freezesLeft).toBe(FREEZES_PER_MONTH)
  })

  it('refuses a target of zero rather than making every week a success', () => {
    // A target of zero would make a week with nothing in it a week that met
    // its target, and the streak would count forever.
    const late = new Date('2026-08-28T09:00:00')
    const s = streakState(weeks([0, 0, 0, 0, 0], late), 0, late)
    expect(s.target).toBe(1)
    // Two freezes hold two of the four completed weeks; the run still ends.
    expect(s.weeks).toBe(0)
  })

  it('sorts an out-of-order series before reading it', () => {
    const ordered = weeks([3, 3, 1])
    const shuffled = [ordered[2], ordered[0], ordered[1]]
    expect(streakState(shuffled, 3, NOW)).toEqual(streakState(ordered, 3, NOW))
  })
})
