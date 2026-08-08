import { describe, expect, it } from 'vitest'
import { formatCount, formatVolume, formatVolumeWithUnit } from './format'

describe('formatCount', () => {
  it('groups thousands', () => {
    expect(formatCount(3201, 'en-US')).toBe('3,201')
    expect(formatCount(90831, 'en-US')).toBe('90,831')
  })

  it('leaves anything under a thousand alone', () => {
    expect(formatCount(0, 'en-US')).toBe('0')
    expect(formatCount(52, 'en-US')).toBe('52')
    expect(formatCount(999, 'en-US')).toBe('999')
  })

  it('takes the separator from the locale', () => {
    expect(formatCount(90831, 'de-DE')).toBe('90.831')
  })

  it('keeps digits Latin in Arabic, per the design system', () => {
    // Stage 5 turns the app Arabic. §2.4 pins numerals to Latin — a weight
    // must read the same to a lifter in Cairo and one in Minnesota — so the
    // locale may move the separator but never the digits.
    expect(formatCount(90831, 'ar-EG')).toBe('90,831')
  })
})

describe('formatVolume', () => {
  it('groups and drops the fraction', () => {
    // The two numbers from the visual pass that started this.
    expect(formatVolume(52393, 'kg', 'en-US')).toBe('52,393')
    expect(formatVolume(90830.5, 'kg', 'en-US')).toBe('90,831')
  })

  it('gives one precision for the whole column', () => {
    // The defect was `48722` sitting beside `90830.5` in the same column.
    expect(formatVolume(48722, 'kg', 'en-US')).toBe('48,722')
    expect(formatVolume(15873.5, 'kg', 'en-US')).toBe('15,874')
  })

  it('converts to the display unit before grouping', () => {
    // 1000 kg is 2204.6 lb.
    expect(formatVolume(1000, 'kg', 'en-US')).toBe('1,000')
    expect(formatVolume(1000, 'lbs', 'en-US')).toBe('2,205')
  })

  it('never mutates the stored kilograms', () => {
    const stored = 90830.5
    formatVolume(stored, 'lbs', 'en-US')
    expect(stored).toBe(90830.5)
  })

  it('renders a missing volume as an em dash', () => {
    expect(formatVolume(null, 'kg', 'en-US')).toBe('—')
  })

  it('shows a real zero rather than an em dash', () => {
    // A workout with no weighted sets has zero volume, which is a fact, not a
    // missing value. Only null is unknown.
    expect(formatVolume(0, 'kg', 'en-US')).toBe('0')
  })

  it('appends the unit when asked', () => {
    expect(formatVolumeWithUnit(90830.5, 'kg', 'en-US')).toBe('90,831 kg')
    expect(formatVolumeWithUnit(null, 'kg', 'en-US')).toBe('—')
  })
})
