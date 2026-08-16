import { describe, expect, it } from 'vitest'
import {
  FORECAST_MIN_WEEKS,
  detectPlateau,
  forecastE1rm,
  isoWeek,
  nextMilestone,
  projectionSegment,
  slopePerWeek,
  weeksOfData,
} from './forecast'

/** A session every `everyDays` days, climbing `stepKg` each time. */
function series(
  count: number,
  { startKg = 100, stepKg = 1, everyDays = 7, from = '2026-01-05' } = {},
) {
  const start = new Date(`${from}T10:00:00`)
  return Array.from({ length: count }, (_, i) => {
    const at = new Date(start)
    at.setDate(at.getDate() + i * everyDays)
    return { started_at: at.toISOString(), kg: startKg + i * stepKg }
  })
}

describe('weeksOfData is a span, not a count', () => {
  it('measures first to last, so twice-a-week training earns no head start', () => {
    expect(weeksOfData(series(12, { everyDays: 7 }))).toBe(11)
    expect(weeksOfData(series(12, { everyDays: 3 }))).toBe(4)
  })

  it('is zero with fewer than two usable points', () => {
    expect(weeksOfData([])).toBe(0)
    expect(weeksOfData(series(1))).toBe(0)
    expect(weeksOfData([{ started_at: '2026-01-01', kg: null }])).toBe(0)
  })

  /**
   * The span is built in UTC and short by exactly the hour a spring-forward
   * costs, so this fails on a UTC runner as readily as on a laptop in CST.
   * That distinction is the whole reason the bug survived: the helper above
   * builds LOCAL times, so CI in UTC crossed no boundary and stayed green
   * while the same suite failed in any DST-observing timezone.
   */
  it('does not lose a week to a daylight-saving hour', () => {
    const eightWeeksLessAnHour = [
      { started_at: '2026-01-05T18:00:00.000Z', kg: 100 },
      { started_at: '2026-03-02T17:00:00.000Z', kg: 108 },
    ]
    expect(weeksOfData(eightWeeksLessAnHour)).toBe(8)
    expect(forecastE1rm(eightWeeksLessAnHour)).not.toBeNull()
  })
})

describe('the eight-week gate', () => {
  it('says nothing under the window, however tidy the line', () => {
    const short = series(5, { everyDays: 7 })
    expect(weeksOfData(short)).toBeLessThan(FORECAST_MIN_WEEKS)
    expect(forecastE1rm(short)).toBeNull()
  })

  it('answers once the window is met', () => {
    expect(
      forecastE1rm(series(12), { now: new Date('2026-03-30T10:00:00') }),
    ).not.toBeNull()
  })

  it('says nothing about a lift that is not moving', () => {
    expect(forecastE1rm(series(12, { stepKg: 0 }))).toBeNull()
  })

  it('says nothing about a lift that is going down', () => {
    expect(forecastE1rm(series(12, { stepKg: -1 }))).toBeNull()
  })
})

describe('a date, not a promise', () => {
  it('refuses a horizon past a year', () => {
    // 0.05 kg a week technically reaches the next milestone. In 2043.
    expect(forecastE1rm(series(20, { startKg: 100, stepKg: 0.05 }))).toBeNull()
  })

  it('chases the next round number above where the lift is now', () => {
    const f = forecastE1rm(series(13, { startKg: 100.5, stepKg: 1 }), {
      now: new Date('2026-04-06T10:00:00'),
    })
    expect(f?.target).toBe(120)
  })

  it('computes the milestone in the unit the reader is looking at', () => {
    // 112.5 kg is 248 lb; the next round number a lifter says out loud is 250,
    // not the 264.6 lb that a 120 kg milestone converts to.
    const f = forecastE1rm(series(13, { startKg: 100.5, stepKg: 1 }), {
      now: new Date('2026-04-06T10:00:00'),
      toDisplay: (kg) => Math.round(kg / 0.453592),
    })
    expect(f?.target).toBe(250)
  })

  it('reports on-pace from the RECENT slope, not the flattering one', () => {
    // Twelve weeks of climbing, then a month of nothing. The whole-window fit
    // still looks healthy; the lift has stopped.
    const climbing = series(10, { startKg: 100, stepKg: 1.5 })
    const flat = series(5, {
      startKg: 113.5,
      stepKg: 0,
      from: '2026-03-16',
    })
    const f = forecastE1rm([...climbing, ...flat], {
      now: new Date('2026-04-20T10:00:00'),
    })
    expect(f?.onPace).toBe(false)
  })
})

describe('nextMilestone', () => {
  it('steps past the current figure, never landing on it', () => {
    expect(nextMilestone(112.5)).toBe(120)
    expect(nextMilestone(140)).toBe(150)
    expect(nextMilestone(9)).toBe(10)
  })

  it('handles a lifter with nothing yet', () => {
    expect(nextMilestone(0)).toBe(10)
    expect(nextMilestone(Number.NaN)).toBe(10)
  })
})

describe('slopePerWeek', () => {
  it('recovers a clean rate', () => {
    expect(slopePerWeek(series(6, { stepKg: 2, everyDays: 7 }))).toBeCloseTo(2, 5)
  })

  it('is null when there is nothing to fit', () => {
    expect(slopePerWeek(series(1))).toBeNull()
    // Every session on the same day: no spread on the x-axis.
    expect(
      slopePerWeek([
        { started_at: '2026-01-05T10:00:00Z', kg: 100 },
        { started_at: '2026-01-05T18:00:00Z', kg: 102 },
      ]),
    ).not.toBeNull()
  })
})

describe('projectionSegment — dashed means not yet real', () => {
  it('continues from the last real point at the series’ own slope', () => {
    expect(projectionSegment([100, 102, 104, 106], 2)).toEqual([108, 110])
  })

  it('draws nothing from a flat series or a single point', () => {
    expect(projectionSegment([100], 2)).toEqual([])
    expect(projectionSegment([], 2)).toEqual([])
    expect(projectionSegment([100, 100, 100], 0)).toEqual([])
  })
})

describe('detectPlateau', () => {
  it('names a lift that has held for six weeks or more', () => {
    const p = detectPlateau(series(9, { stepKg: 0, startKg: 112.5 }))
    expect(p?.weeks).toBe(8)
    expect(p?.fromKg).toBe(112.5)
    expect(p?.toKg).toBe(112.5)
  })

  it('says nothing about a shorter flat stretch', () => {
    expect(detectPlateau(series(4, { stepKg: 0 }))).toBeNull()
  })

  it('says nothing about a lift that is still climbing', () => {
    expect(detectPlateau(series(12, { stepKg: 2 }))).toBeNull()
  })

  it('only looks at the tail — last spring is history', () => {
    const flatThenClimbing = [
      ...series(8, { stepKg: 0, startKg: 100 }),
      ...series(4, { startKg: 105, stepKg: 3, from: '2026-03-02' }),
    ]
    expect(detectPlateau(flatThenClimbing)).toBeNull()
  })

  it('refuses to call a deload a plateau', () => {
    // Volume was cut on purpose. Prescribing a fix would be telling somebody
    // off for a decision they made.
    expect(detectPlateau(series(9, { stepKg: 0 }), { steadyVolume: false })).toBeNull()
  })

  it('carries ISO week numbers for the chip', () => {
    const p = detectPlateau(series(9, { stepKg: 0, from: '2026-06-22' }))
    expect(p?.fromWeek).toBe(isoWeek(new Date('2026-06-22T10:00:00')))
    expect(p?.toWeek).toBeGreaterThan(p?.fromWeek ?? 0)
  })
})

describe('isoWeek', () => {
  it('is Monday-started, like every other week boundary in this app', () => {
    // 2026-01-05 is a Monday, in ISO week 2.
    expect(isoWeek(new Date('2026-01-05T10:00:00'))).toBe(2)
    expect(isoWeek(new Date('2026-01-11T23:00:00'))).toBe(2)
    expect(isoWeek(new Date('2026-01-12T00:30:00'))).toBe(3)
  })
})
