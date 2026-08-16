import { describe, expect, it } from 'vitest'
import {
  RANGES,
  describeRange,
  describeSpan,
  rangeStart,
  volumeSpan,
  withinRange,
} from './range'

const NOW = new Date(2026, 7, 7, 12) // 2026-08-07

describe('RANGES', () => {
  it('offers four windows, widest last', () => {
    expect(RANGES.map((r) => r.key)).toEqual(['3M', '6M', '1Y', 'ALL'])
    expect(RANGES.at(-1)?.months).toBeNull()
  })
})

describe('rangeStart', () => {
  it('counts back calendar months, not 30-day blocks', () => {
    const start = rangeStart('3M', NOW)!
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(4) // May
    expect(start.getDate()).toBe(7)
  })

  it('crosses a year boundary', () => {
    const start = rangeStart('1Y', NOW)!
    expect(start.getFullYear()).toBe(2025)
    expect(start.getMonth()).toBe(7)
  })

  it('has no start for All', () => {
    expect(rangeStart('ALL', NOW)).toBeNull()
  })
})

describe('withinRange', () => {
  it('keeps a session inside the window and drops one outside it', () => {
    expect(withinRange(new Date(2026, 6, 1).toISOString(), '3M', NOW)).toBe(true)
    expect(withinRange(new Date(2026, 0, 1).toISOString(), '3M', NOW)).toBe(false)
  })

  it('keeps everything under All, including a null date', () => {
    expect(withinRange(new Date(2019, 0, 1).toISOString(), 'ALL', NOW)).toBe(true)
    expect(withinRange(null, 'ALL', NOW)).toBe(true)
  })

  it('excludes an undated row from a bounded window rather than guessing', () => {
    expect(withinRange(null, '6M', NOW)).toBe(false)
    expect(withinRange('not a date', '6M', NOW)).toBe(false)
  })
})

describe('volumeSpan', () => {
  it('buckets the short windows by week', () => {
    expect(volumeSpan('3M', null, NOW)).toEqual({ bucket: 'week', count: 13 })
    expect(volumeSpan('6M', null, NOW)).toEqual({ bucket: 'week', count: 26 })
  })

  it('switches to months once a year of weeks would be unreadable', () => {
    expect(volumeSpan('1Y', null, NOW)).toEqual({ bucket: 'month', count: 12 })
  })

  it('stretches All back to the first session, inclusive of its month', () => {
    const oldest = new Date(2025, 9, 21).toISOString() // Oct 2025 -> Aug 2026
    expect(volumeSpan('ALL', oldest, NOW)).toEqual({ bucket: 'month', count: 11 })
  })

  it('caps All so one ancient session cannot flatten the chart', () => {
    const ancient = new Date(2009, 0, 1).toISOString()
    expect(volumeSpan('ALL', ancient, NOW).count).toBe(36)
  })

  it('falls back to a year when there is nothing logged at all', () => {
    expect(volumeSpan('ALL', null, NOW)).toEqual({ bucket: 'month', count: 12 })
  })

  it('never returns a zero-bucket span', () => {
    const today = NOW.toISOString()
    expect(volumeSpan('ALL', today, NOW).count).toBe(1)
  })
})

describe('describeRange', () => {
  it('reads as a phrase a caption can use', () => {
    expect(describeRange('3M')).toBe('the last 3 months')
    expect(describeRange('1Y')).toBe('the last year')
    expect(describeRange('ALL')).toBe('all time')
  })
})

describe('describeSpan', () => {
  it('names the bucket the chart actually drew', () => {
    expect(describeSpan({ bucket: 'week', count: 26 })).toBe('last 26 weeks')
    expect(describeSpan({ bucket: 'month', count: 12 })).toBe('last 12 months')
    expect(describeSpan({ bucket: 'month', count: 1 })).toBe('last 1 month')
  })
})
