import { describe, expect, it } from 'vitest'
import { earnedRest, effortPercent } from './rest'
import { MODE_BEHAVIOUR } from './coach-mode'
import {
  DEFAULT_REST_SECONDS,
  REST_MAX_SECONDS,
  clampRest,
  describeRest,
  resolveRest,
  stepRest,
} from './rest'

describe('resolveRest', () => {
  it('prefers the user override over everything', () => {
    expect(resolveRest(90, 45)).toBe(45)
  })

  it('falls back to the catalogue default when the user has set nothing', () => {
    expect(resolveRest(90, null)).toBe(90)
    expect(resolveRest(90, undefined)).toBe(90)
  })

  it('falls back to the app default when neither exists', () => {
    expect(resolveRest(null, null)).toBe(DEFAULT_REST_SECONDS)
  })

  it('treats an override of zero as a decision, not as absent', () => {
    // "No timer on curls" has to survive the ?? chain — this is exactly the
    // bug a `||` here would introduce.
    expect(resolveRest(120, 0)).toBe(0)
  })
})

describe('clampRest', () => {
  it('holds the range the stepper offers', () => {
    expect(clampRest(-30)).toBe(0)
    expect(clampRest(99_999)).toBe(REST_MAX_SECONDS)
    expect(clampRest(90)).toBe(90)
  })

  it('falls back rather than storing NaN', () => {
    expect(clampRest(Number.NaN)).toBe(DEFAULT_REST_SECONDS)
  })
})

describe('stepRest', () => {
  it('snaps to the increment instead of adding to an odd number', () => {
    expect(stepRest(95, 1, 15)).toBe(105)
    expect(stepRest(95, -1, 15)).toBe(90)
  })

  it('steps cleanly from a value already on the grid', () => {
    expect(stepRest(120, 1, 15)).toBe(135)
    expect(stepRest(120, -1, 15)).toBe(105)
  })

  it('stops at the ends of the range', () => {
    expect(stepRest(0, -1, 15)).toBe(0)
    expect(stepRest(REST_MAX_SECONDS, 1, 15)).toBe(REST_MAX_SECONDS)
  })
})

describe('describeRest', () => {
  it('reads as a gym clock', () => {
    expect(describeRest(120)).toBe('2:00')
    expect(describeRest(45)).toBe('0:45')
    expect(describeRest(90)).toBe('1:30')
  })

  it('says off rather than showing 0:00', () => {
    expect(describeRest(0)).toBe('off')
  })
})

describe('effortPercent', () => {
  it('reads a top set against the lift’s own best estimate', () => {
    expect(effortPercent(100, 112.5)).toBe(89)
  })

  it('is null when either half is missing — and null is what stops the claim', () => {
    // Doctrine 1 applies to the rest bar's chip exactly as it applies to a
    // coach's sentence: no number, no reason line.
    expect(effortPercent(null, 112.5)).toBeNull()
    expect(effortPercent(100, null)).toBeNull()
    expect(effortPercent(100, 0)).toBeNull()
    expect(effortPercent(0, 112.5)).toBeNull()
  })
})

describe('earnedRest — mode and effort aware', () => {
  const strength = MODE_BEHAVIOUR.strength.rest
  const hypertrophy = MODE_BEHAVIOUR.hypertrophy.rest

  it('gives a heavy single the top of the band', () => {
    // "heavy single at 95% e1RM earns 4 min"
    expect(earnedRest(95, strength, 'normal')).toBe(240)
  })

  it('gives easy work the floor of the band', () => {
    expect(earnedRest(60, strength, 'normal')).toBe(120)
  })

  it('scales in between, in fifteen-second steps', () => {
    const mid = earnedRest(78, strength, 'normal') as number
    expect(mid).toBeGreaterThan(120)
    expect(mid).toBeLessThan(240)
    expect(mid % 15).toBe(0)
  })

  it('gives a warm-up 90 seconds whatever the mode', () => {
    // "a warm-up earns 90 s" — and a ramp set that earned four minutes would
    // turn a ten-minute warm-up into half an hour.
    expect(earnedRest(95, strength, 'warmup')).toBe(90)
    expect(earnedRest(null, strength, 'warmup')).toBe(90)
  })

  it('never exceeds a warm-up’s band in a short-rest mode', () => {
    expect(earnedRest(95, hypertrophy, 'warmup')).toBe(60)
  })

  it('honours the mode’s band rather than one global scale', () => {
    expect(earnedRest(95, hypertrophy, 'normal')).toBe(120)
    expect(earnedRest(60, hypertrophy, 'normal')).toBe(60)
  })

  it('clamps past the ends rather than extrapolating', () => {
    expect(earnedRest(140, strength, 'normal')).toBe(240)
    expect(earnedRest(20, strength, 'normal')).toBe(120)
  })

  it('is null with no effort reading, so the per-exercise value stands', () => {
    // Manual override always wins and is remembered per exercise; guessing a
    // duration from no evidence is how a rest timer stops being believed.
    expect(earnedRest(null, strength, 'normal')).toBeNull()
  })
})
