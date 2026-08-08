import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  formatCount,
  formatDuration,
  formatRelativeDay,
  formatSeconds,
  formatDayLabel,
  formatMonthLabel,
  formatShortDate,
  formatSyncedAt,
  formatTime,
  formatVolume,
  formatVolumeWithUnit,
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

/**
 * `Intl.DateTimeFormat.format` throws `RangeError: Invalid time value` rather
 * than returning anything, and a formatter that throws during render unmounts
 * its tab. The Coach screen proved it: one response without `generatedAt` and
 * the whole screen was replaced by the error boundary.
 *
 * So every date formatter degrades to an em dash, the way `formatVolume`
 * already did for a null volume. These cases are the guard, not the maths.
 */
describe('formatSyncedAt', () => {
  const now = new Date('2026-08-08T15:00:00Z')

  it('gives a time for a sync that happened today', () => {
    const earlier = new Date('2026-08-08T09:30:00Z')
    expect(formatSyncedAt(earlier.getTime(), now)).toBe(
      formatTime(earlier.toISOString()),
    )
  })

  /**
   * "Synced 14:32" reads as this afternoon whether it was or not, and the
   * whole point of the stamp is that the user can tell how old the data is.
   */
  it('gives a date for anything older, rather than a misleading time', () => {
    const yesterday = new Date('2026-08-07T14:32:00Z')
    expect(formatSyncedAt(yesterday.getTime(), now)).toBe(
      formatShortDate(yesterday.toISOString()),
    )
  })

  it('dashes an unusable value instead of throwing under the workout', () => {
    expect(formatSyncedAt(Number.NaN, now)).toBe('—')
    expect(formatSyncedAt(Number.POSITIVE_INFINITY, now)).toBe('—')
  })
})

describe('unrenderable dates', () => {
  const junk = ['', 'not a date', '2026-13-45T99:99:99Z']

  it('never throws, whatever arrives on the wire', () => {
    for (const value of junk) {
      expect(formatWorkoutDate(value)).toBe('—')
      expect(formatShortDate(value)).toBe('—')
      expect(formatTime(value)).toBe('—')
      expect(formatRelativeDay(value)).toBe('—')
    }
  })

  it('survives a missing value the types say cannot happen', () => {
    // The Coach tab's actual crash: `notes.generatedAt` was undefined because
    // the response did not carry it, and TypeScript had been told it would.
    expect(formatWorkoutDate(undefined as unknown as string)).toBe('—')
    expect(formatTime(null as unknown as string)).toBe('—')
  })

  it('dashes an unusable duration instead of rendering NaN', () => {
    expect(formatDuration('not a date', '2026-08-08T10:00:00Z')).toBe('—')
    expect(formatDuration('2026-08-08T09:00:00Z', 'not a date')).toBe('—')
  })

  it('guards the calendar labels, which take a Date and not a string', () => {
    expect(formatDayLabel(new Date('nope'))).toBe('—')
    expect(formatMonthLabel(new Date('nope'))).toBe('—')
  })
})
