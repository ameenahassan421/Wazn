import { toDisplayWeight } from './units'
import type { Unit } from './units'

const DAY = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

const DAY_WITH_YEAR = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const TIME = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

export function formatWorkoutDate(iso: string): string {
  const date = new Date(iso)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return sameYear ? DAY.format(date) : DAY_WITH_YEAR.format(date)
}

export function formatTime(iso: string): string {
  return TIME.format(new Date(iso))
}

export function formatShortDate(iso: string): string {
  return DAY_WITH_YEAR.format(new Date(iso))
}

const MONTH = new Intl.DateTimeFormat(undefined, { month: 'short' })

/**
 * A `Date` rather than an ISO string, deliberately: the training calendar's
 * cells are local midnights, and `toISOString()` on a local midnight lands on
 * the day before in every timezone east of UTC. The heatmap would label the
 * wrong day for half the planet.
 */
export function formatDayLabel(date: Date): string {
  return DAY.format(date)
}

export function formatMonthLabel(date: Date): string {
  return MONTH.format(date)
}

/** "3 days ago" / "today" — the only context needed above a set input. */
export function formatRelativeDay(iso: string): string {
  const then = new Date(iso)
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(new Date()) - startOfDay(then)) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'last week'
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  return `${Math.round(days / 30)} months ago`
}

export function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return 'in progress'
  const minutes = Math.max(
    0,
    Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000),
  )
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

export function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/* ─── Numbers ───────────────────────────────────────────────────────────────
   One grouper for every large number in the app. Before this there was none:
   volume rendered `52393` and `90830.5` in the same column, and there was no
   `Intl.NumberFormat` anywhere in `src/` at all.

   Locale-aware, because Stage 5 turns the app Arabic and the separator should
   follow — but with the digits pinned to Latin. Left alone, `ar` would render
   `٩٠٬٨٣١`, and §2.4 pins numerals to Latin so a weight reads the same to a
   lifter in Cairo and one in Minnesota. `numberingSystem: 'latn'` keeps the
   separator local and the digits universal.

   The formatters are built once and cached: constructing an
   `Intl.NumberFormat` is the expensive part, and History renders one per row.
   ───────────────────────────────────────────────────────────────────────── */
const GROUPERS = new Map<string, Intl.NumberFormat>()

function grouper(locale: string | undefined): Intl.NumberFormat {
  const key = locale ?? ''
  let format = GROUPERS.get(key)
  if (!format) {
    format = new Intl.NumberFormat(locale, {
      numberingSystem: 'latn',
      maximumFractionDigits: 0,
    })
    GROUPERS.set(key, format)
  }
  return format
}

/**
 * Whole counts — sets, reps, sessions, workouts.
 *
 * `locale` exists so the tests can pin one; nothing in the app passes it, and
 * `undefined` means "whatever the device is set to".
 */
export function formatCount(value: number, locale?: string): string {
  return grouper(locale).format(value)
}

/**
 * Session volume, grouped and deliberately without its fraction.
 *
 * Whether a half-kg on a five-figure total is information or noise was the
 * open question in the L6 finding. It is noise, for three reasons:
 *
 * 1. It is below the resolution of the input. Plates come in 1.25 kg pairs,
 *    and the bar plus the lifter's own day-to-day mass vary by more than
 *    half a kilo between sets.
 * 2. It is not measured, it is converted. The same session renders `90830.5`
 *    in kg and a whole number in lbs purely because of the conversion factor —
 *    a digit that changes with a display toggle is not a fact about training.
 * 3. It costs a glyph at arm's length under load, and the one law says
 *    glanceability wins.
 *
 * So volume is a grouped integer everywhere. Set weights keep their 0.25 kg /
 * 0.5 lb precision (`formatWeight` in `units.ts`) because there the fraction
 * *is* the information: 62.5 and 62 are different bars. This function never
 * touches a stored value — kg storage is exact, as always.
 */
export function formatVolume(kg: number | null, unit: Unit, locale?: string): string {
  if (kg === null) return '—'
  return grouper(locale).format(toDisplayWeight(kg, unit))
}

export function formatVolumeWithUnit(
  kg: number | null,
  unit: Unit,
  locale?: string,
): string {
  if (kg === null) return '—'
  return `${formatVolume(kg, unit, locale)} ${unit}`
}
