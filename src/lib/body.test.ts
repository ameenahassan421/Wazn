import { describe, expect, it } from 'vitest'
import {
  averageWeightKg,
  crossSignal,
  latestWeightKg,
  measurementRows,
  proteinWeek,
  weightSeries,
  weightSteady,
} from './body'

const NOW = new Date('2026-08-14T09:00:00')

/** `days` ago, as the `YYYY-MM-DD` the table stores. */
function ago(days: number): string {
  const d = new Date(NOW)
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

describe('weightSeries', () => {
  it('sorts oldest first and drops what is not a weight', () => {
    const s = weightSeries([
      { on: ago(0), kg: '82.1' },
      { on: ago(14), kg: 82.6 },
      { on: 'nonsense', kg: 80 },
      { on: ago(7), kg: 0 },
    ])
    expect(s.map((r) => r.kg)).toEqual([82.6, 82.1])
  })

  it('windows to `sinceDays` when the caller asks, and to nothing when it does not', () => {
    const rows = [
      { on: ago(200), kg: 90 },
      { on: ago(30), kg: 84 },
      { on: ago(1), kg: 82 },
    ]
    // The default is every row ever written — `latestWeightKg` and the two
    // averages depend on it.
    expect(weightSeries(rows)).toHaveLength(3)
    // 12 weeks is what the chart's label promises, so 200 days ago is out.
    expect(weightSeries(rows, { sinceDays: 84, now: NOW }).map((r) => r.kg)).toEqual([
      84, 82,
    ])
  })

  it('does not resample — a gap in the weigh-ins is the truth about them', () => {
    const s = weightSeries([
      { on: ago(20), kg: 83 },
      { on: ago(1), kg: 82 },
    ])
    expect(s).toHaveLength(2)
  })

  it('carries the latest reading as the card’s hero figure', () => {
    expect(
      latestWeightKg([
        { on: ago(3), kg: 81 },
        { on: ago(0), kg: 82.1 },
      ]),
    ).toBe(82.1)
    expect(latestWeightKg([])).toBeNull()
  })
})

describe('averageWeightKg — the chip says "avg" for a reason', () => {
  it('averages the window rather than trusting one salty dinner', () => {
    const weights = [
      { on: ago(21), kg: 82 },
      { on: ago(14), kg: 82.4 },
      { on: ago(7), kg: 81.9 },
      { on: ago(0), kg: 82.1 },
    ]
    expect(averageWeightKg(weights, 28, NOW)).toBe(82.1)
  })

  it('ignores readings outside the window', () => {
    expect(
      averageWeightKg(
        [
          { on: ago(200), kg: 95 },
          { on: ago(2), kg: 82 },
          { on: ago(1), kg: 82 },
        ],
        28,
        NOW,
      ),
    ).toBe(82)
  })

  it('is null with nothing in the window', () => {
    expect(averageWeightKg([{ on: ago(200), kg: 95 }], 28, NOW)).toBeNull()
  })

  it('is null on ONE reading — the mean of one is that one, wearing a label', () => {
    expect(averageWeightKg([{ on: ago(1), kg: 88.5 }], 28, NOW)).toBeNull()
    // And the claim built on top of it does not fire either: one weigh-in
    // cannot show a weight that moved.
    expect(crossSignal([{ on: ago(1), kg: 88.5 }], 5, { now: NOW })).toBeNull()
  })

  it('says nothing about four weeks from two consecutive mornings', () => {
    // Two readings, so the average is real — and they span one day, so
    // `weightSteady` is false for lack of evidence rather than for movement.
    // Reading that as "weight moved" is how this shipped "your weight moved
    // over four weeks" off a 0.1kg difference between Monday and Tuesday.
    const twoMornings = [
      { on: ago(2), kg: 88.5 },
      { on: ago(1), kg: 88.6 },
    ]
    expect(averageWeightKg(twoMornings, 28, NOW)).not.toBeNull()
    expect(crossSignal(twoMornings, 5, { now: NOW })).toBeNull()
  })
})

describe('weightSteady', () => {
  const spread = [
    { on: ago(27), kg: 82.3 },
    { on: ago(13), kg: 82.0 },
    { on: ago(0), kg: 82.1 },
  ]

  it('is true inside a kilogram over the window', () => {
    expect(weightSteady(spread, { now: NOW })).toBe(true)
  })

  it('is false when the lifter actually moved', () => {
    expect(
      weightSteady(
        [
          { on: ago(27), kg: 79 },
          { on: ago(0), kg: 82.1 },
        ],
        { now: NOW },
      ),
    ).toBe(false)
  })

  it('refuses to call two adjacent weigh-ins four weeks of anything', () => {
    expect(
      weightSteady(
        [
          { on: ago(1), kg: 82 },
          { on: ago(0), kg: 82.1 },
        ],
        { now: NOW },
      ),
    ).toBe(false)
  })

  it('is false with a single reading', () => {
    expect(weightSteady([{ on: ago(0), kg: 82.1 }], { now: NOW })).toBe(false)
  })
})

describe('proteinWeek', () => {
  it('draws seven Monday-started bars', () => {
    const bars = proteinWeek([], { target: 160, now: NOW })
    expect(bars).toHaveLength(7)
    expect(bars[0].date.getDay()).toBe(1)
    expect(bars[6].date.getDay()).toBe(0)
  })

  it('distinguishes a day nobody logged from a day that fell short', () => {
    // Doctrine 3 applied to a bar chart: an unlogged day is not a miss.
    const bars = proteinWeek([{ on: ago(0), g: 140, target: 160 }], {
      target: 160,
      now: NOW,
    })
    const today = bars.find((b) => b.grams !== null)
    expect(today?.state).toBe('under')
    expect(bars.filter((b) => b.state === 'empty')).toHaveLength(6)
  })

  it('marks a day that met its target', () => {
    const bars = proteinWeek([{ on: ago(0), g: 168, target: 160 }], {
      target: 160,
      now: NOW,
    })
    expect(bars.find((b) => b.grams !== null)?.state).toBe('met')
  })

  it('measures a day against the target it was LOGGED against', () => {
    // Raising the target on Friday must not recolour Monday as a miss.
    const bars = proteinWeek([{ on: ago(0), g: 150, target: 140 }], {
      target: 200,
      now: NOW,
    })
    expect(bars.find((b) => b.grams !== null)?.state).toBe('met')
  })

  it('clamps the bar height at the target rather than drawing past the card', () => {
    const bars = proteinWeek([{ on: ago(0), g: 400, target: 160 }], {
      target: 160,
      now: NOW,
    })
    expect(bars.find((b) => b.grams !== null)?.fraction).toBe(1)
  })
})

describe('measurementRows', () => {
  it('computes the four-week delta and rounds it to the stored precision', () => {
    expect(
      measurementRows([{ site: 'chest', cm: 104, on: ago(0), previous_cm: 103 }]),
    ).toEqual([{ site: 'chest', cm: 104, deltaCm: 1 }])
  })

  it('leaves a site with one reading without a delta rather than inventing zero', () => {
    expect(
      measurementRows([{ site: 'waist', cm: 84, on: ago(0), previous_cm: null }]),
    ).toEqual([{ site: 'waist', cm: 84, deltaCm: null }])
  })

  it('drops a row that is not a measurement', () => {
    expect(
      measurementRows([{ site: 'arm', cm: 0, on: ago(0), previous_cm: null }]),
    ).toEqual([])
  })
})

describe('crossSignal — the one thing neither chart below it can say', () => {
  const steady = [
    { on: ago(27), kg: 82.3 },
    { on: ago(13), kg: 82.0 },
    { on: ago(0), kg: 82.1 },
  ]

  it('names recomposition when weight held and strength climbed', () => {
    expect(crossSignal(steady, 4, { now: NOW })).toEqual({
      kind: 'recomposition',
      weeks: 4,
      averageKg: 82.1,
      strengthGainKg: 4,
    })
  })

  it('says nothing with no weigh-ins — half a claim is not a claim', () => {
    expect(crossSignal([], 4, { now: NOW })).toBeNull()
  })

  it('says nothing with no strength movement to pair against', () => {
    expect(crossSignal(steady, null, { now: NOW })).toBeNull()
  })

  it('says nothing about a gain inside the estimate’s own error', () => {
    expect(crossSignal(steady, 1, { now: NOW })).toBeNull()
  })

  it('states an easing lift as a fact, with no vocabulary for fault', () => {
    const dropping = [
      { on: ago(27), kg: 85 },
      { on: ago(0), kg: 82 },
    ]
    expect(crossSignal(dropping, -3, { now: NOW })?.kind).toBe('cutting-holding')
  })
})
