import { describe, expect, it } from 'vitest'
import {
  formatEstimate,
  formatWeight,
  formatWeightWithUnit,
  fromDisplayWeight,
  kgToLbs,
  lbsToKg,
  toDisplayWeight,
} from './units'

describe('unit conversion', () => {
  it('round-trips a display value through kg storage', () => {
    const kg = fromDisplayWeight(135, 'lbs')
    expect(toDisplayWeight(kg, 'lbs')).toBe(135)
  })

  it('uses the same factor as the importer', () => {
    expect(lbsToKg(100)).toBeCloseTo(45.3592, 4)
    expect(kgToLbs(45.3592)).toBeCloseTo(100, 6)
  })

  it('leaves kg untouched when kg is the display unit', () => {
    expect(fromDisplayWeight(60, 'kg')).toBe(60)
    expect(toDisplayWeight(60, 'kg')).toBe(60)
  })
})

describe('display rounding', () => {
  it('rounds to the nearest 0.5 lb', () => {
    // 58.97 kg is 130.0 lb; 59.2 kg lands between halves and must snap.
    expect(toDisplayWeight(58.97, 'lbs')).toBe(130)
    expect(toDisplayWeight(59.2, 'lbs')).toBe(130.5)
    expect(toDisplayWeight(22.68, 'lbs')).toBe(50)
  })

  it('rounds to the nearest 0.25 kg', () => {
    expect(toDisplayWeight(58.97, 'kg')).toBe(59)
    expect(toDisplayWeight(58.9, 'kg')).toBe(59)
    expect(toDisplayWeight(58.6, 'kg')).toBe(58.5)
    expect(toDisplayWeight(58.7, 'kg')).toBe(58.75)
  })

  it('never mutates the stored kilograms', () => {
    const stored = 58.967
    toDisplayWeight(stored, 'lbs')
    expect(stored).toBe(58.967)
  })
})

describe('formatting', () => {
  it('drops trailing zeros but keeps real fractions', () => {
    expect(formatWeight(58.97, 'lbs')).toBe('130')
    expect(formatWeight(59.2, 'lbs')).toBe('130.5')
    expect(formatWeight(58.75, 'kg')).toBe('58.75')
    expect(formatWeight(0, 'kg')).toBe('0')
  })

  it('renders a missing weight as an em dash', () => {
    expect(formatWeight(null, 'lbs')).toBe('—')
  })

  it('calls a missing weight bodyweight when the unit is appended', () => {
    expect(formatWeightWithUnit(null, 'lbs')).toBe('bodyweight')
    expect(formatWeightWithUnit(58.97, 'lbs')).toBe('130 lbs')
  })
})

describe('formatEstimate', () => {
  /**
   * Seen on a simulator 2026-08-21: the weekly review's STALLED section drew
   * its trend as a 30px "−0", which reads as a broken render rather than as
   * "this lift is flat". Every near-zero CHANGE this function formats has the
   * same shape, and it formats gains and deltas as well as values.
   */
  it('never prints a negative zero', () => {
    expect(formatEstimate(-0.01, 'lbs')).toBe('0')
    expect(formatEstimate(-0.001, 'kg')).toBe('0')
    expect(formatEstimate(-0, 'kg')).toBe('0')
  })

  it('still prints a real negative', () => {
    expect(formatEstimate(-1.4, 'kg')).toBe('-1.4')
    expect(formatEstimate(-0.06, 'kg')).toBe('-0.1')
  })

  it('rounds to one decimal and never to a plate step', () => {
    expect(formatEstimate(116.7, 'kg')).toBe('116.7')
    expect(formatEstimate(null, 'kg')).toBe('\u2014')
  })
})
