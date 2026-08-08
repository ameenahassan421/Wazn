import { describe, expect, it } from 'vitest'
import {
  parseUnit,
  toDisplayBlock,
} from '../../supabase/functions/_shared/display-units'
import { formatEstimate, formatWeight } from './units'

/**
 * The coach's unit conversion, and the one property that actually matters:
 * **it must agree with the client's formatters, exactly.**
 *
 * The briefing card renders a model-written sentence and a chip side by side.
 * The sentence is phrased server-side from a converted block; the chip is
 * composed client-side by `formatWeight` / `formatEstimate`. If the two round
 * differently, the card contradicts itself in a single glance — "226 lbs × 5"
 * above "225.5 lbs × 5" — and the whole point of the chip is that it can be
 * trusted against the charts.
 *
 * So these tests reach across the workspace boundary and compare the Edge
 * Function's arithmetic against the client's, the same way `quota.test.ts`
 * reaches `_shared/quota.ts`. Two implementations of one rounding rule is one
 * implementation that drifts.
 */

const brief = {
  unit: 'kg',
  days_since_last: 2,
  target: {
    exercise: 'Bench Press (Barbell)',
    last_weight_kg: 100,
    last_reps: 5,
    last_e1rm: 116.7,
    best_e1rm: 116.7,
    next_weight_kg: 102.5,
    next_e1rm: 119.6,
  },
  low_bands: [{ muscle: 'calves', sets: 0 }],
}

describe('toDisplayBlock', () => {
  it('leaves a kilogram block completely alone', () => {
    // Storage is kg and so is the block. The no-op case has to be a true
    // no-op, or every kg user pays a rounding pass for nothing.
    expect(toDisplayBlock(brief, 'kg')).toBe(brief)
  })

  it('converts loads and estimates by different rules', () => {
    const out = toDisplayBlock(brief, 'lbs') as typeof brief
    expect(out.unit).toBe('lbs')
    // A load snaps to the nearest half pound, because it is something you put
    // on a bar: 102.5 kg is 225.97 lb, shown as 226.
    expect(out.target.next_weight_kg).toBe(226)
    expect(out.target.last_weight_kg).toBe(220.5)
    // An estimate does not snap. Nobody racks an e1RM.
    expect(out.target.best_e1rm).toBe(257.3)
    expect(out.target.next_e1rm).toBe(263.7)
  })

  it('never touches anything that is not a weight', () => {
    const out = toDisplayBlock(brief, 'lbs') as typeof brief
    expect(out.days_since_last).toBe(2)
    expect(out.target.last_reps).toBe(5)
    expect(out.low_bands).toEqual([{ muscle: 'calves', sets: 0 }])
    expect(out.target.exercise).toBe('Bench Press (Barbell)')
  })

  it('agrees with the client formatters to the digit', () => {
    // The load-bearing assertion. The server converts the number; the client
    // formats the same kg. They must print the same string.
    for (const kg of [20, 60, 62.5, 100, 102.5, 140, 182.5, 240]) {
      const converted = toDisplayBlock({ target: { last_weight_kg: kg } }, 'lbs') as {
        target: { last_weight_kg: number }
      }
      expect(String(converted.target.last_weight_kg), `${kg} kg as a load`).toBe(
        formatWeight(kg, 'lbs'),
      )
    }

    for (const kg of [73.3, 93.3, 116.7, 119.6, 154, 162.5]) {
      const converted = toDisplayBlock({ target: { best_e1rm: kg } }, 'lbs') as {
        target: { best_e1rm: number }
      }
      expect(String(converted.target.best_e1rm), `${kg} kg as an estimate`).toBe(
        formatEstimate(kg, 'lbs'),
      )
    }
  })

  it('converts the debrief anchor and the session volume', () => {
    const out = toDisplayBlock(
      {
        unit: 'kg',
        volume_kg: 12480.5,
        anchor: {
          exercise: 'Lat Pulldown (Cable)',
          top_weight_kg: 70,
          top_reps: 10,
          e1rm: 93.3,
          gain_since_last_e1rm: 3.3,
          progression_streak: 4,
        },
      },
      'lbs',
    ) as {
      volume_kg: number
      anchor: { top_weight_kg: number; e1rm: number; progression_streak: number }
    }
    expect(out.anchor.top_weight_kg).toBe(154.5)
    expect(out.anchor.e1rm).toBe(205.7)
    expect(out.volume_kg).toBe(27515)
    // A streak is a count of sessions, not a weight.
    expect(out.anchor.progression_streak).toBe(4)
  })

  it('converts every lift figure in the review', () => {
    const out = toDisplayBlock(
      {
        unit: 'kg',
        wins: [
          { exercise: 'Squat (Barbell)', e1rm_28d: 162.5, e1rm_before: 154, gain: 8.5 },
        ],
        plateaus: [
          { exercise: 'Squat (Barbell)', sessions: 6, first_e1rm: 154, last_e1rm: 154 },
        ],
        recommendation: { kind: 'hold', exercise: 'Squat (Barbell)', gain: 8.5 },
      },
      'lbs',
    ) as {
      wins: { e1rm_28d: number; gain: number }[]
      plateaus: { first_e1rm: number; sessions: number }[]
      recommendation: { gain: number }
    }
    expect(out.wins[0].e1rm_28d).toBe(358.3)
    expect(out.wins[0].gain).toBe(18.7)
    expect(out.plateaus[0].first_e1rm).toBe(339.5)
    // Sessions is a count.
    expect(out.plateaus[0].sessions).toBe(6)
    expect(out.recommendation.gain).toBe(18.7)
  })

  it('survives a block with none of the optional sections', () => {
    // `weekly_review()` returns empty arrays and a null target for a new
    // account, and this runs before every prompt.
    expect(() =>
      toDisplayBlock({ unit: 'kg', target: null, wins: [] }, 'lbs'),
    ).not.toThrow()
    expect(toDisplayBlock(null, 'lbs')).toBeNull()
  })
})

describe('parseUnit', () => {
  it('accepts only the two it knows, and defaults to storage', () => {
    // The value arrives from a request body. Anything unexpected has to land
    // on kg, which is what the database holds and therefore the only answer
    // that cannot be wrong by a factor of 2.2.
    expect(parseUnit('lbs')).toBe('lbs')
    expect(parseUnit('kg')).toBe('kg')
    expect(parseUnit('lb')).toBe('kg')
    expect(parseUnit('LBS')).toBe('kg')
    expect(parseUnit(undefined)).toBe('kg')
    expect(parseUnit({ toString: () => 'lbs' })).toBe('kg')
  })
})
