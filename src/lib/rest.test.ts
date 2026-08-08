import { describe, expect, it } from 'vitest'
import {
  REST_MAX_SECONDS,
  clampRest,
  describeRest,
  resolveRest,
  stepRest,
} from './rest'
import { DEFAULT_REST_SECONDS } from './use-rest-timer'

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
