/**
 * Forecasts and the plateau card — design v3.0 §08.
 *
 * "Forecasts only surface with ≥8 weeks of data on that lift and are stated
 * with a date, not a promise." Both halves of that sentence are enforced here
 * rather than in a component, because both are ways for the app to lie:
 *
 *  - Under eight weeks, `forecastE1rm` returns null and the row renders the
 *    muted `FORECAST AT WK n OF 8` placeholder. A regression over three
 *    sessions is a straight line through noise, and a date computed from it is
 *    a number a lifter will check once and never trust again.
 *  - Past a year, it returns null too. A slope of 0.05 kg/week technically
 *    reaches 120 kg — in 2043. "A date, not a promise" cuts both ways: a date
 *    nobody will live to see is worse than no line at all.
 *
 * Nothing here is phrased. Every function returns figures; the component
 * translates and formats, so an Arabic build gets a forecast rather than an
 * English sentence with Arabic chrome around it.
 */

/** The window a lift needs before it may be forecast at all. */
export const FORECAST_MIN_WEEKS = 8

/** Beyond this, the projection stops being a forecast and becomes a wish. */
export const FORECAST_MAX_WEEKS = 52

/** A plateau needs at least this many weeks of flat e1RM to be named. */
export const PLATEAU_MIN_WEEKS = 6

/** Inside this band, an e1RM has not moved. One increment over six weeks is
 *  noise in the estimate, not progress. */
const FLAT_KG = 2.5

export interface E1rmPoint {
  /** ISO timestamp of the session. */
  started_at: string
  /** Best estimated 1RM that session, in kg. Nulls are dropped. */
  kg: number | string | null
}

interface CleanPoint {
  at: number
  kg: number
}

function clean(points: E1rmPoint[]): CleanPoint[] {
  return points
    .map((p) => ({
      at: new Date(p.started_at).getTime(),
      kg: typeof p.kg === 'string' ? Number.parseFloat(p.kg) : (p.kg ?? 0),
    }))
    .filter((p) => Number.isFinite(p.at) && Number.isFinite(p.kg) && p.kg > 0)
    .sort((a, b) => a.at - b.at)
}

const WEEK_MS = 7 * 86_400_000

/**
 * Weeks between the first and last session in the series.
 *
 * Deliberately the SPAN and not the count: eight sessions crammed into a
 * fortnight is two weeks of evidence, and a lifter who trains twice a week
 * should not get a forecast four weeks sooner than one who trains once.
 */
export function weeksOfData(points: E1rmPoint[]): number {
  const rows = clean(points)
  if (rows.length < 2) return 0
  return Math.floor((rows[rows.length - 1].at - rows[0].at) / WEEK_MS)
}

/** Ordinary least squares on (weeks, kg). Null when there is nothing to fit. */
export function slopePerWeek(points: E1rmPoint[]): number | null {
  const rows = clean(points)
  if (rows.length < 2) return null
  const origin = rows[0].at
  const xs = rows.map((r) => (r.at - origin) / WEEK_MS)
  const ys = rows.map((r) => r.kg)
  const n = xs.length
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - meanX) * (ys[i] - meanY)
    den += (xs[i] - meanX) ** 2
  }
  if (den === 0) return null
  return num / den
}

/**
 * The next round number worth chasing, in whatever unit it is handed.
 *
 * Computed in DISPLAY units on purpose. A milestone is a number a lifter says
 * out loud — "I want a hundred and forty" — and the next round kilogram is not
 * a round pound. Converting a kg milestone for display gives 264.6 lb, which
 * nobody has ever wanted.
 */
export function nextMilestone(current: number, step = 10): number {
  if (!Number.isFinite(current) || current <= 0) return step
  return Math.floor(current / step) * step + step
}

export interface Forecast {
  /** The milestone being chased, in the unit `current` was given in. */
  target: number
  /** When the fit says it lands. Local midnight. */
  by: Date
  /** Weeks from now. */
  weeks: number
  /**
   * True while the last four weeks are moving at least as fast as the window
   * the forecast was fitted over. "On pace" is a claim about the present, not
   * a restatement of the fit — a lift that stalled a month ago still has a
   * flattering twelve-week slope, and saying ON PACE about it is the exact
   * cheerleading the doctrine forbids.
   */
  onPace: boolean
}

/**
 * Where this lift's estimate is heading, or null when the app should not say.
 *
 * `toDisplay` converts kg to whatever the reader is looking at; the milestone
 * and the target come back in that unit, and only the arithmetic happens in kg.
 */
export function forecastE1rm(
  points: E1rmPoint[],
  {
    now = new Date(),
    toDisplay = (kg: number) => kg,
    step = 10,
  }: { now?: Date; toDisplay?: (kg: number) => number; step?: number } = {},
): Forecast | null {
  if (weeksOfData(points) < FORECAST_MIN_WEEKS) return null

  const slope = slopePerWeek(points)
  if (slope === null || slope <= 0) return null

  const rows = clean(points)
  const latestKg = rows[rows.length - 1].kg
  const current = toDisplay(latestKg)
  const target = nextMilestone(current, step)
  // The gap in display units, walked at a slope converted to the same units.
  // Converting the slope rather than the dates keeps one division in the whole
  // function and no chance of mixing the two scales.
  const slopeDisplay = toDisplay(latestKg + slope) - current
  if (slopeDisplay <= 0) return null

  const weeks = Math.ceil((target - current) / slopeDisplay)
  if (!Number.isFinite(weeks) || weeks <= 0 || weeks > FORECAST_MAX_WEEKS) return null

  const by = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  by.setDate(by.getDate() + weeks * 7)

  // Recent pace: the fit over the last four weeks of sessions, against the
  // whole window. Two points minimum, or there is no recent slope to compare.
  const cutoff = rows[rows.length - 1].at - 4 * WEEK_MS
  const recent = rows.filter((r) => r.at >= cutoff)
  const recentSlope =
    recent.length >= 2
      ? slopePerWeek(
          recent.map((r) => ({ started_at: new Date(r.at).toISOString(), kg: r.kg })),
        )
      : null

  return {
    target,
    by,
    weeks,
    onPace: recentSlope === null ? true : recentSlope >= slope * 0.75,
  }
}

/**
 * The dashed continuation for the chart, in the same units the series is in.
 *
 * Returns `steps` points starting one step PAST the last real one. The caller
 * joins it to the last real point, so the dashed segment leaves the solid line
 * exactly where the data stops — which is the whole grammar: dashed means "not
 * yet real", and a projection that starts anywhere else is drawing over a
 * measurement.
 */
export function projectionSegment(values: number[], steps = 2): number[] {
  if (values.length < 2 || steps <= 0) return []
  // Fitted over the series' own index, which is what the chart plots against.
  const n = values.length
  const meanX = (n - 1) / 2
  const meanY = values.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i += 1) {
    num += (i - meanX) * (values[i] - meanY)
    den += (i - meanX) ** 2
  }
  if (den === 0) return []
  const slope = num / den
  const last = values[n - 1]
  return Array.from({ length: steps }, (_, i) => last + slope * (i + 1))
}

export interface Plateau {
  /** How long it has been flat. */
  weeks: number
  /** kg at the start and end of the flat stretch — identical is the point. */
  fromKg: number
  toKg: number
  /** ISO week numbers, for the chip's `wk 26–34`. */
  fromWeek: number
  toWeek: number
}

/**
 * ISO-8601 week number. Monday-started, like every other week boundary in this
 * app (`weekStart`, `trainingCalendar`, `weekly_streak`).
 */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  // Thursday decides the year, which is the whole trick of ISO weeks.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

/**
 * A lift that has stopped moving, or null.
 *
 * "Flat e1RM ≥6 weeks with steady volume." Volume is passed in rather than
 * derived here: a lift that flattened because the lifter cut its sets in half
 * is not plateaued, it is deloaded, and prescribing a change for it would be
 * the coach telling somebody off for a decision they made on purpose.
 *
 * Only the TAIL is considered. A flat stretch last spring is history; the card
 * exists to name what is happening now.
 */
export function detectPlateau(
  points: E1rmPoint[],
  {
    steadyVolume = true,
    minWeeks = PLATEAU_MIN_WEEKS,
  }: { steadyVolume?: boolean; minWeeks?: number } = {},
): Plateau | null {
  if (!steadyVolume) return null
  const rows = clean(points)
  if (rows.length < 2) return null

  const last = rows[rows.length - 1]
  // Walk back while the estimate stays inside the flat band of the latest.
  let first = rows.length - 1
  for (let i = rows.length - 2; i >= 0; i -= 1) {
    if (Math.abs(rows[i].kg - last.kg) > FLAT_KG) break
    first = i
  }

  const weeks = Math.floor((last.at - rows[first].at) / WEEK_MS)
  if (weeks < minWeeks) return null

  return {
    weeks,
    fromKg: rows[first].kg,
    toKg: last.kg,
    fromWeek: isoWeek(new Date(rows[first].at)),
    toWeek: isoWeek(new Date(last.at)),
  }
}
