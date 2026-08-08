import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  formatDuration,
  formatRelativeDay,
  formatSeconds,
  formatWorkoutDate,
} from './format'

/**
 * The date maths, pinned at a fixed instant.
 *
 * Everything here is boundary arithmetic, which is the kind that reads fine
 * and is wrong by one: "today" at 00:05, "yesterday" across a month end, a
 * duration that rounds to 60 minutes. `formatDayLabel` already carries a
 * comment about `toISOString()` on a local midnight landing on the previous
 * day east of UTC — this file is the rest of that lesson.
 *
 * Assertions deliberately avoid checking rendered month names, because
 * `Intl.DateTimeFormat` output varies with the runtime's locale and this suite
 * must pass on a laptop and on a CI runner alike.
 *
 * For the same reason every instant here is built in **local** time rather
 * than written as a `Z` literal. `formatRelativeDay` compares local calendar
 * days, so `'2026-08-07T16:00:00Z'` is yesterday in London and today in
 * Tokyo — the first draft of this file passed under `TZ=UTC` and failed under
 * `TZ=Asia/Tokyo`. Pinning `TZ` in the test command would have hidden that
 * instead of fixing it, and would have left the assertions lying about what
 * the function actually does.
 */

/** A local-time instant, as the ISO string the formatters take. */
const local = (
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0,
): string => new Date(year, month - 1, day, hour, minute).toISOString()

const NOW = new Date(2026, 7, 8, 12, 0)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('formatRelativeDay', () => {
  const at = (iso: string) => formatRelativeDay(iso)

  it('calls the current day today, whatever the hour', () => {
    expect(at(local(2026, 8, 8, 0, 5))).toBe('today')
    expect(at(local(2026, 8, 8, 23, 50))).toBe('today')
  })

  it('reads a future timestamp as today rather than a negative count', () => {
    // Clock skew between a phone and Postgres is real, and "in -1 days" is
    // the sort of thing that ends up in a screenshot.
    expect(at(local(2026, 8, 9, 9))).toBe('today')
  })

  it('names yesterday', () => {
    expect(at(local(2026, 8, 7))).toBe('yesterday')
  })

  it('counts days up to a week', () => {
    expect(at(local(2026, 8, 5))).toBe('3 days ago')
    expect(at(local(2026, 8, 2))).toBe('6 days ago')
  })

  it('crosses into weeks, then months', () => {
    expect(at(local(2026, 8, 1))).toBe('last week')
    expect(at(local(2026, 7, 18))).toBe('3 weeks ago')
    expect(at(local(2026, 5, 8))).toBe('3 months ago')
  })

  it('compares whole days, not elapsed hours', () => {
    // 14 hours earlier but a different calendar day: a set logged at 22:00
    // last night is "yesterday", not "today", to the person who logged it.
    expect(at(local(2026, 8, 7, 22))).toBe('yesterday')
  })
})

describe('formatDuration', () => {
  it('reads an unfinished workout as in progress', () => {
    expect(formatDuration(local(2026, 8, 8, 10), null)).toBe('in progress')
  })

  it('gives minutes under an hour', () => {
    expect(formatDuration(local(2026, 8, 8, 10), local(2026, 8, 8, 10, 47))).toBe(
      '47 min',
    )
  })

  it('switches to hours and minutes at the hour', () => {
    expect(formatDuration(local(2026, 8, 8, 10), local(2026, 8, 8, 11))).toBe('1h 0m')
    expect(formatDuration(local(2026, 8, 8, 10), local(2026, 8, 8, 12, 23))).toBe(
      '2h 23m',
    )
  })

  it('never reports a negative duration', () => {
    // An ended_at before started_at is a clock-skew artefact, not "-5 min".
    expect(formatDuration(local(2026, 8, 8, 10), local(2026, 8, 8, 9, 55))).toBe(
      '0 min',
    )
  })
})

describe('formatSeconds', () => {
  it('pads the seconds so the timer does not jump width', () => {
    // A rest timer that renders 1:5 then 1:05 shifts under the eye of someone
    // who is watching it and not much else.
    expect(formatSeconds(65)).toBe('1:05')
    expect(formatSeconds(9)).toBe('0:09')
    expect(formatSeconds(600)).toBe('10:00')
  })

  it('handles zero', () => {
    expect(formatSeconds(0)).toBe('0:00')
  })
})

describe('formatWorkoutDate', () => {
  it('includes the year only for another year', () => {
    // Locale-independent: assert on the presence of the year, not the words.
    expect(formatWorkoutDate(local(2026, 3, 2))).not.toMatch(/2026/)
    expect(formatWorkoutDate(local(2024, 3, 2))).toMatch(/2024/)
  })
})
