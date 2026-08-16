/**
 * The time window a Progress block is showing.
 *
 * Kept out of the components because two blocks share it and because the
 * bucket decision — weeks or months — is arithmetic, not layout: 52 weekly
 * points on a 320-unit chart is 6px apart, which is a texture rather than a
 * trend. Past half a year the same series is drawn per month instead.
 *
 * Neither `session_volume_history()` nor `strength_summary()` takes a window
 * argument. Both already return everything the caller is allowed to see, so
 * the range is applied here, on data that is already in hand — no second
 * round trip, and no migration standing between this code and production.
 * See DECISIONS.md.
 */

export type RangeKey = '3M' | '6M' | '1Y' | 'ALL'

export interface Range {
  key: RangeKey
  label: string
  /** Calendar months back from today; null is "everything logged". */
  months: number | null
}

export const RANGES: Range[] = [
  { key: '3M', label: '3M', months: 3 },
  { key: '6M', label: '6M', months: 6 },
  { key: '1Y', label: '1Y', months: 12 },
  { key: 'ALL', label: 'All', months: null },
]

export const DEFAULT_RANGE: RangeKey = '6M'

/** Longest span the All chart will draw, so one very old session cannot
 *  squeeze five years of months into 320 pixels. */
const MAX_MONTHS = 36

function monthsOf(key: RangeKey): number | null {
  return RANGES.find((r) => r.key === key)?.months ?? null
}

/**
 * First instant inside the range, or null for "everything".
 *
 * Calendar months rather than 30-day blocks: on the 7th, "3M" means since the
 * 7th three months ago, which is what the chip says to a reader.
 */
export function rangeStart(key: RangeKey, now = new Date()): Date | null {
  const months = monthsOf(key)
  if (months === null) return null
  return new Date(now.getFullYear(), now.getMonth() - months, now.getDate())
}

/** Whether a timestamp falls inside the range. Undated rows are excluded. */
export function withinRange(
  iso: string | null | undefined,
  key: RangeKey,
  now = new Date(),
): boolean {
  const start = rangeStart(key, now)
  if (start === null) return true
  if (!iso) return false
  const at = new Date(iso)
  return Number.isFinite(at.getTime()) && at >= start
}

/** Whole calendar months from `iso` to `now`, floored at 0. */
function monthsSince(iso: string, now: Date): number {
  const then = new Date(iso)
  if (!Number.isFinite(then.getTime())) return 0
  const months =
    (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth())
  return Math.max(0, months)
}

export interface VolumeSpan {
  bucket: 'week' | 'month'
  /** How many buckets the chart draws, oldest first, empty ones included. */
  count: number
}

/**
 * How to bucket the volume series for a range.
 *
 * Weeks up to six months — a lifter's decisions are weekly and a deload has
 * to be visible. Months beyond it, because a year of weeks stops being
 * readable before it stops fitting.
 */
export function volumeSpan(
  key: RangeKey,
  oldestIso: string | null,
  now = new Date(),
): VolumeSpan {
  const months = monthsOf(key)

  if (months !== null && months <= 6) {
    // 3 months is 13 weeks, 6 is 26 — round, so neither gains a stub week.
    const weeks = Math.round((months * 365) / 12 / 7)
    return { bucket: 'week', count: Math.max(1, weeks) }
  }
  if (months !== null) return { bucket: 'month', count: months }

  // All: back to the first session, inclusive of the month it happened in.
  if (!oldestIso) return { bucket: 'month', count: 12 }
  const span = monthsSince(oldestIso, now) + 1
  return { bucket: 'month', count: Math.min(MAX_MONTHS, Math.max(1, span)) }
}

/** The window as a phrase, for captions that have to say what was filtered. */
export function describeRange(key: RangeKey): string {
  const months = monthsOf(key)
  if (months === null) return 'all time'
  if (months === 12) return 'the last year'
  return `the last ${months} months`
}

/** "last 26 weeks" / "last 12 months" — the chart says what it is showing. */
export function describeSpan(span: VolumeSpan): string {
  const noun = span.bucket === 'week' ? 'week' : 'month'
  return `last ${span.count} ${noun}${span.count === 1 ? '' : 's'}`
}
