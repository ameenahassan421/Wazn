/**
 * Derivations behind the Progress tab's Volume and Balance sub-tabs.
 *
 * All of it is computed from one series — `session_volume_history` returns a
 * row per finished workout — so four charts cost one round trip. Kept pure
 * and out of the component so the bucketing can be tested without a chart.
 */

export interface SessionVolumeRow {
  workout_id: string
  started_at: string
  volume_kg: number | string
  set_count: number | string
}

export interface MuscleGroupSets {
  muscle_group: string
  set_count: number | string
}

export interface ExerciseBest {
  exercise_id: string
  name: string
  best_e1rm_kg: number | string
}

/** Postgres numerics arrive as strings through PostgREST. */
function num(value: number | string | null | undefined): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : (value ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** Local midnight, so a 6am and an 11pm session on one day share a bucket. */
function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

/** Monday of the week containing `date`, at local midnight. */
export function weekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  // getDay() is 0 for Sunday; shift so Monday is 0.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

export interface WeekBucket {
  start: Date
  sessions: number
}

/**
 * Sessions per week for the last `weeks` weeks, oldest first, including weeks
 * with nothing in them — a gap is the point of the chart.
 */
export function sessionsPerWeek(
  rows: SessionVolumeRow[],
  weeks = 13,
  now = new Date(),
): WeekBucket[] {
  const counts = new Map<number, number>()
  for (const row of rows) {
    const key = weekStart(new Date(row.started_at)).getTime()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const current = weekStart(now)
  const out: WeekBucket[] = []
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = new Date(current)
    start.setDate(start.getDate() - i * 7)
    out.push({ start, sessions: counts.get(start.getTime()) ?? 0 })
  }
  return out
}

export interface MonthBucket {
  start: Date
  volumeKg: number
}

/** Total load moved per calendar month, oldest first, gaps included. */
export function monthlyVolume(
  rows: SessionVolumeRow[],
  months = 7,
  now = new Date(),
): MonthBucket[] {
  const totals = new Map<number, number>()
  for (const row of rows) {
    const d = new Date(row.started_at)
    const key = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
    totals.set(key, (totals.get(key) ?? 0) + num(row.volume_kg))
  }

  const out: MonthBucket[] = []
  for (let i = months - 1; i >= 0; i -= 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({ start, volumeKg: totals.get(start.getTime()) ?? 0 })
  }
  return out
}

export interface CalendarDay {
  date: Date
  volumeKg: number
}

/**
 * A day-per-cell grid ending on today, laid out in whole Monday-started
 * weeks so the columns line up.
 */
export function trainingCalendar(
  rows: SessionVolumeRow[],
  weeks = 13,
  now = new Date(),
): CalendarDay[] {
  const byDay = new Map<string, number>()
  for (const row of rows) {
    const key = dayKey(row.started_at)
    byDay.set(key, (byDay.get(key) ?? 0) + num(row.volume_kg))
  }

  const start = weekStart(now)
  start.setDate(start.getDate() - (weeks - 1) * 7)

  const out: CalendarDay[] = []
  for (let i = 0; i < weeks * 7; i += 1) {
    const date = new Date(start)
    date.setDate(date.getDate() + i)
    if (date > now) break
    out.push({ date, volumeKg: byDay.get(dayKey(date.toISOString())) ?? 0 })
  }
  return out
}

/**
 * Five heat steps: rest day, then four by volume relative to the busiest day
 * in view. Returns 0-4, where 0 is "nothing logged".
 */
export function heatStep(volumeKg: number, max: number): number {
  if (volumeKg <= 0) return 0
  if (max <= 0) return 1
  const ratio = volumeKg / max
  if (ratio > 0.75) return 4
  if (ratio > 0.5) return 3
  if (ratio > 0.25) return 2
  return 1
}

/**
 * Anchor lifts, and what each should be relative to the deadlift.
 *
 * These are the usual strength-standards ratios, not a claim about any one
 * lifter — the chart says "predicted", and the point is to surface a lift
 * that has fallen behind the others, not to set a target.
 */
export const ANCHOR_LIFTS: { label: string; match: RegExp; ratio: number }[] = [
  { label: 'Deadlift', match: /^deadlift \(barbell\)$/i, ratio: 1 },
  { label: 'Squat', match: /^(full )?squat( \(barbell\))?$/i, ratio: 0.85 },
  { label: 'Bench', match: /^bench press \(barbell\)$/i, ratio: 0.75 },
  {
    label: 'Overhead',
    match: /^(overhead press|shoulder press) \(barbell\)$/i,
    ratio: 0.45,
  },
]

export interface BalanceRow {
  label: string
  measuredKg: number | null
  predictedKg: number | null
}

/** Measured best e1RM per anchor lift, against what the deadlift predicts. */
export function liftBalance(bests: ExerciseBest[]): BalanceRow[] {
  const bestFor = (match: RegExp): number | null => {
    let top: number | null = null
    for (const row of bests) {
      if (!match.test(row.name.trim())) continue
      const value = num(row.best_e1rm_kg)
      if (top === null || value > top) top = value
    }
    return top
  }

  const deadlift = bestFor(ANCHOR_LIFTS[0].match)
  return ANCHOR_LIFTS.map(({ label, match, ratio }) => ({
    label,
    measuredKg: bestFor(match),
    predictedKg: deadlift === null ? null : deadlift * ratio,
  }))
}

/** The productive weekly range the Balance tab shades behind the bars. */
export const SET_BAND: [number, number] = [10, 20]

/** Groups that have sat under the band, worst first. */
export function underBand(rows: MuscleGroupSets[]): string[] {
  return rows
    .filter((r) => num(r.set_count) < SET_BAND[0])
    .sort((a, b) => num(a.set_count) - num(b.set_count))
    .map((r) => r.muscle_group)
}
