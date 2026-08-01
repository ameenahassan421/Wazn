import { describe, expect, it } from 'vitest'
import { platesFor, describePlates, DEFAULT_BAR } from './plates'

describe('platesFor', () => {
  it('loads a 135 lb bench the way a lifter would', () => {
    const r = platesFor(135, 'lbs')!
    expect(r.perSide).toEqual([{ plate: 45, count: 1 }])
    expect(r.achievable).toBe(135)
    expect(r.remainder).toBe(0)
  })

  it('combines plates for 225', () => {
    const r = platesFor(225, 'lbs')!
    expect(r.perSide).toEqual([{ plate: 45, count: 2 }])
    expect(r.achievable).toBe(225)
  })

  it('uses smaller plates when the number is not round', () => {
    const r = platesFor(190, 'lbs')!
    expect(describePlates(r)).toBe('45, 25, 2.5')
    expect(r.achievable).toBe(190)
  })

  it('reports a remainder when the plates cannot make the number', () => {
    // 46 lb on a 45 lb bar needs 0.5 per side; the lightest plate is 2.5.
    const r = platesFor(46, 'lbs')!
    expect(r.perSide).toEqual([])
    expect(r.achievable).toBe(45)
    expect(r.remainder).toBe(1)
  })

  it('returns an empty bar rather than nothing at exactly bar weight', () => {
    const r = platesFor(45, 'lbs')!
    expect(r.perSide).toEqual([])
    expect(describePlates(r)).toBe('Empty bar')
  })

  it('returns null below the bar instead of throwing mid-workout', () => {
    expect(platesFor(30, 'lbs')).toBeNull()
    expect(platesFor(Number.NaN, 'lbs')).toBeNull()
  })

  it('works in kg with a 20 kg bar', () => {
    const r = platesFor(100, 'kg')!
    expect(r.perSide).toEqual([
      { plate: 25, count: 1 },
      { plate: 15, count: 1 },
    ])
    expect(r.achievable).toBe(100)
  })

  it('honours a non-default bar', () => {
    const r = platesFor(75, 'lbs', 35)!
    expect(r.bar).toBe(35)
    expect(r.perSide).toEqual([{ plate: 10, count: 2 }])
    expect(r.achievable).toBe(75)
  })

  it('avoids floating point dropping a plate', () => {
    // 2.5 kg plates repeatedly subtracted used to leave 0.9999… and lose one.
    const r = platesFor(47.5, 'kg')!
    expect(r.achievable).toBe(47.5)
    expect(r.remainder).toBe(0)
  })

  it('defaults match the common bars', () => {
    expect(DEFAULT_BAR.lbs).toBe(45)
    expect(DEFAULT_BAR.kg).toBe(20)
  })
})
