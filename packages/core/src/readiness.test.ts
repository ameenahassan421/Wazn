import { describe, expect, it } from 'vitest'
import {
  asCheckIn,
  computeReadiness,
  loadFactor,
  readinessChip,
  setsToTrim,
  sleepDebtMinutes,
} from './readiness'

describe('the degraded path is the common path', () => {
  // Nobody has granted a wearable and almost nobody taps the row. This is
  // Tuesday, not an error branch.
  it('is normal with no inputs at all', () => {
    expect(computeReadiness({})).toBe('normal')
  })

  it('has no chip to show with no inputs, so no claim may be made', () => {
    expect(readinessChip({}, format)).toBeNull()
  })

  it('treats a skipped check-in as Normal, silently', () => {
    expect(computeReadiness({ checkIn: null })).toBe('normal')
    expect(computeReadiness({ checkIn: 'normal' })).toBe('normal')
  })
})

describe('sleep debt', () => {
  it('is positive when the night ran short', () => {
    expect(sleepDebtMinutes({ sleepMinutes: 340 })).toBe(80)
  })

  it('is negative after a long night', () => {
    expect(sleepDebtMinutes({ sleepMinutes: 540 })).toBe(-120)
  })

  it('reads against the lifter’s own baseline when there is one', () => {
    expect(sleepDebtMinutes({ sleepMinutes: 360, sleepBaselineMinutes: 360 })).toBe(0)
  })

  it('is null with no reading — which is not the same as zero', () => {
    expect(sleepDebtMinutes({})).toBeNull()
    expect(sleepDebtMinutes({ sleepMinutes: 0 })).toBeNull()
  })
})

describe('the three states', () => {
  it('goes light on a drained tap', () => {
    expect(computeReadiness({ checkIn: 'drained' })).toBe('light')
  })

  it('goes light on a short night alone', () => {
    // 5:40 against a 7h baseline: the design's own light-readiness example.
    expect(computeReadiness({ sleepMinutes: 340 })).toBe('light')
  })

  it('is loaded when fresh, rested and slept', () => {
    expect(
      computeReadiness({ checkIn: 'fresh', sleepMinutes: 540, daysRested: 5 }),
    ).toBe('loaded')
  })

  it('lets rest offset a drained tap rather than letting one input decide', () => {
    // Drained after eight days off is bored, not broken.
    expect(computeReadiness({ checkIn: 'drained', daysRested: 8 })).toBe('normal')
  })

  it('is asymmetric on purpose — easing is cheaper than pushing', () => {
    // −2 reaches light; +2 does not reach loaded.
    expect(computeReadiness({ checkIn: 'drained' })).toBe('light')
    expect(computeReadiness({ checkIn: 'fresh' })).toBe('normal')
  })

  it('ignores sleep noise — a phone guessing when you fell asleep', () => {
    expect(computeReadiness({ sleepMinutes: 400 })).toBe('normal')
  })
})

const format = {
  duration: (minutes: number) =>
    `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`,
  sleep: (value: string) => `sleep ${value}`,
  checkIn: (state: string) => `felt ${state}`,
  rested: (days: number) => `rested ${days}d`,
}

describe('the chip that entitles the claim', () => {
  it('cites sleep only when it was actually measured and actually short', () => {
    expect(readinessChip({ sleepMinutes: 340 }, format)).toBe('sleep 5:40')
    expect(readinessChip({ sleepMinutes: 400 }, format)).toBeNull()
  })

  it('names a check-in as the tap it was, never as a number', () => {
    expect(readinessChip({ checkIn: 'drained' }, format)).toBe('felt drained')
  })

  it('says nothing about a Normal tap — that is the absence of a signal', () => {
    expect(readinessChip({ checkIn: 'normal' }, format)).toBeNull()
  })

  it('joins what it has, in one line', () => {
    expect(
      readinessChip({ sleepMinutes: 340, checkIn: 'drained', daysRested: 4 }, format),
    ).toBe('sleep 5:40 · felt drained · rested 4d')
  })
})

describe('what a light day costs', () => {
  it('trims a set from a block that can spare one', () => {
    expect(setsToTrim('light', 4)).toBe(1)
    expect(setsToTrim('light', 3)).toBe(1)
  })

  it('never trims a block down to nothing', () => {
    expect(setsToTrim('light', 2)).toBe(0)
    expect(setsToTrim('light', 1)).toBe(0)
  })

  it('adds nothing on a loaded day — proposing more work unasked is a nag', () => {
    expect(setsToTrim('loaded', 4)).toBe(0)
    expect(loadFactor('loaded')).toBe(1)
    expect(loadFactor('normal')).toBe(1)
  })

  it('eases the bar a notch on a light day', () => {
    expect(loadFactor('light')).toBeLessThan(1)
  })
})

describe('asCheckIn', () => {
  it('accepts the three taps and refuses anything else', () => {
    expect(asCheckIn('fresh')).toBe('fresh')
    expect(asCheckIn('drained')).toBe('drained')
    expect(asCheckIn('tired')).toBeNull()
    expect(asCheckIn(undefined)).toBeNull()
  })
})
