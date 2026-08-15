/**
 * The second dataset — design v3.0 §13, the Body tab.
 *
 * What training moves besides the bar. Four series, one round trip
 * (`body_overview`, migration 0027), and every derivation here so the screen
 * draws rather than computes.
 *
 * ── WHAT IS DELIBERATELY ABSENT ─────────────────────────────────────────────
 * Calories, macros beyond protein, body-fat estimates, and any surface for raw
 * biometrics. The spec's overrule of full nutrition is not a scoping
 * convenience: "photo-calorie estimation is a second product with its own
 * failure modes", and sleep/HRV are "inputs, not a product" — they feed
 * `readiness.ts` and appear on this screen as one mono footer line and nowhere
 * else. Progress photos are camera-only and never leave the device, which is
 * why nothing in this module or in 0027 has a column for one.
 */

export interface WeighIn {
  /** ISO date, `YYYY-MM-DD`. */
  on: string
  /** Kilograms, always. The header's lb toggle is display only. */
  kg: number | string
}

export interface ProteinDay {
  on: string
  g: number | string
  /** The target this day was logged against, stamped on the row. */
  target: number | string | null
}

export interface Measurement {
  site: string
  cm: number | string
  on: string
  /** The closest reading at least 28 days older, or null. */
  previous_cm: number | string | null
}

function num(value: number | string | null | undefined): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : (value ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** Local midnight for a `YYYY-MM-DD`, so a date never drifts a day westward. */
function localDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

/**
 * The weight series for the chart, oldest first, one point per weigh-in.
 *
 * Not resampled to a fixed cadence. A lifter who weighs in twice one week and
 * not at all the next has a line with two close points and a gap, and that is
 * the truth about how they weighed themselves — inventing Wednesday's weight
 * to make the x-axis even would be the app drawing a measurement it never took.
 */
export function weightSeries(weights: WeighIn[]): { on: Date; kg: number }[] {
  return weights
    .map((w) => ({ on: localDate(w.on), kg: num(w.kg) }))
    .filter((w) => !Number.isNaN(w.on.getTime()) && w.kg > 0)
    .sort((a, b) => a.on.getTime() - b.on.getTime())
}

/** The latest reading, which is the card's hero figure. */
export function latestWeightKg(weights: WeighIn[]): number | null {
  const series = weightSeries(weights)
  return series.length === 0 ? null : series[series.length - 1].kg
}

/**
 * The trailing average over `days`, or null.
 *
 * The chip says `bw 82.1 avg`, not `bw 82.1` — because a single morning's
 * reading swings a kilo on water alone, and a cross-signal claim resting on
 * one weigh-in is a claim resting on how salty dinner was.
 */
export function averageWeightKg(
  weights: WeighIn[],
  days = 28,
  now = new Date(),
): number | null {
  const cutoff = now.getTime() - days * 86_400_000
  const rows = weightSeries(weights).filter((w) => w.on.getTime() >= cutoff)
  if (rows.length === 0) return null
  return Number((rows.reduce((a, b) => a + b.kg, 0) / rows.length).toFixed(1))
}

/**
 * Has weight held steady over the window?
 *
 * A kilogram either way over four weeks is a stable lifter, not a trend. The
 * band is generous on purpose: the cross-signal line only fires when the app
 * can say something a chart cannot, and a false "recomposition is working"
 * is the most flattering thing this app could possibly get wrong.
 */
export function weightSteady(
  weights: WeighIn[],
  {
    days = 28,
    bandKg = 1,
    now = new Date(),
  }: { days?: number; bandKg?: number; now?: Date } = {},
): boolean {
  const cutoff = now.getTime() - days * 86_400_000
  const rows = weightSeries(weights).filter((w) => w.on.getTime() >= cutoff)
  if (rows.length < 2) return false
  const spanDays =
    (rows[rows.length - 1].on.getTime() - rows[0].on.getTime()) / 86_400_000
  // Two weigh-ins a day apart do not prove four weeks of anything.
  if (spanDays < days * 0.5) return false
  return Math.abs(rows[rows.length - 1].kg - rows[0].kg) <= bandKg
}

export type ProteinState = 'met' | 'under' | 'empty'

export interface ProteinBar {
  date: Date
  grams: number | null
  targetG: number | null
  state: ProteinState
  /** 0–1 against the target, for the bar's height. Clamped at 1. */
  fraction: number
}

/**
 * Seven bars, Monday to Sunday, for the week containing `now`.
 *
 * Monday-started like every other week boundary in this app, and the same
 * reason: the home's WEEK tile, the streak and `date_trunc('week')` in SQL all
 * agree, and a Sunday-started row here would put two surfaces an inch apart
 * disagreeing about which sessions were "this week".
 *
 * `empty` is a third state, not zero grams. A day nobody logged is not a day
 * somebody ate nothing, and colouring it as a miss would be the app inventing
 * a failure — doctrine 3, no guilt vocabulary, applied to a bar chart.
 */
export function proteinWeek(
  days: ProteinDay[],
  { target, now = new Date() }: { target: number | null; now?: Date },
): ProteinBar[] {
  const byDay = new Map<string, ProteinDay>()
  for (const d of days) byDay.set(d.on, d)

  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(start)
    date.setDate(date.getDate() + i)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`
    const row = byDay.get(key)
    if (!row) {
      return {
        date,
        grams: null,
        targetG: target,
        state: 'empty' as const,
        fraction: 0,
      }
    }
    const grams = num(row.g)
    // The row's own target wins over the current preference: raising the
    // target on Friday must not recolour Monday as a miss.
    const targetG = row.target === null ? target : num(row.target)
    const met = targetG !== null && targetG > 0 && grams >= targetG
    return {
      date,
      grams,
      targetG,
      state: met ? ('met' as const) : ('under' as const),
      fraction:
        targetG !== null && targetG > 0
          ? Math.min(1, grams / targetG)
          : grams > 0
            ? 1
            : 0,
    }
  })
}

export interface MeasurementRow {
  site: string
  cm: number
  /** Change against the reading ~4 weeks back. Null when there isn't one. */
  deltaCm: number | null
}

/** The list, with its four-week deltas. Sites with one reading get no delta. */
export function measurementRows(rows: Measurement[]): MeasurementRow[] {
  return rows
    .map((r) => {
      const cm = num(r.cm)
      const previous = r.previous_cm === null ? null : num(r.previous_cm)
      return {
        site: r.site,
        cm,
        // Rounded to the tenth the column is stored at, so `104 cm ▲ 1` never
        // renders `▲ 0.9999999999999`.
        deltaCm: previous === null ? null : Number((cm - previous).toFixed(1)),
      }
    })
    .filter((r) => r.cm > 0)
}

export interface CrossSignal {
  /** Which sentence to render. The component holds the words. */
  kind: 'recomposition' | 'gaining' | 'cutting-holding'
  weeks: number
  averageKg: number
  strengthGainKg: number
}

/**
 * The line at the top of the Body tab, or null.
 *
 * "Weight steady four weeks while bench climbed — recomposition is working."
 * The value of this card is that it reads two datasets at once, which is the
 * one thing neither chart below it can do. So it fires only when BOTH have
 * something to say: no weigh-ins, or no strength movement, and it renders
 * nothing rather than half a claim.
 */
export function crossSignal(
  weights: WeighIn[],
  strengthGainKg: number | null,
  { days = 28, now = new Date() }: { days?: number; now?: Date } = {},
): CrossSignal | null {
  const average = averageWeightKg(weights, days, now)
  if (average === null || strengthGainKg === null) return null
  // Under one plate over four weeks is inside the estimate's own error.
  if (Math.abs(strengthGainKg) < 2.5) return null

  const weeks = Math.round(days / 7)
  const steady = weightSteady(weights, { days, now })

  if (steady && strengthGainKg > 0) {
    return { kind: 'recomposition', weeks, averageKg: average, strengthGainKg }
  }
  if (!steady && strengthGainKg > 0) {
    return { kind: 'gaining', weeks, averageKg: average, strengthGainKg }
  }
  // Strength holding or easing while weight comes down is the other honest
  // read, and it is stated as a fact rather than as a warning: there is no
  // vocabulary here for having done something wrong.
  return { kind: 'cutting-holding', weeks, averageKg: average, strengthGainKg }
}
