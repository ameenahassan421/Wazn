import { describe, expect, it } from 'vitest'
import { warmupRamp } from './warmup'

describe('warmupRamp', () => {
  it('ramps 40/60/80% rounded to loadable weights', () => {
    const r = warmupRamp(225, 'lbs', 45)!
    expect(r.map((s) => s.weight)).toEqual([90, 135, 180])
    expect(r.map((s) => s.reps)).toEqual([8, 5, 3])
  })

  it('never suggests less than the bar', () => {
    const r = warmupRamp(95, 'lbs', 45)!
    expect(Math.min(...r.map((s) => s.weight))).toBeGreaterThanOrEqual(45)
  })

  it('drops duplicate steps rather than repeating a number', () => {
    const r = warmupRamp(60, 'lbs', 45)!
    expect(new Set(r.map((s) => s.weight)).size).toBe(r.length)
  })

  it('returns null when there is nothing to ramp through', () => {
    expect(warmupRamp(45, 'lbs', 45)).toBeNull()
    expect(warmupRamp(0, 'lbs', 45)).toBeNull()
  })

  it('rounds to 2.5 kg steps in kg', () => {
    const r = warmupRamp(100, 'kg', 20)!
    expect(r.map((s) => s.weight)).toEqual([40, 60, 80])
  })
})
