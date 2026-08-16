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

export interface VolumeWeek {
  start: Date
  volumeKg: number
}

/**
 * Volume per week, oldest first, including empty weeks.
 *
 * Weeks rather than the months the old Volume tab used: design v2.1's trend
 * chart is "one point per week", and a lifter's decisions are weekly. A month
 * bucket hides the deload that a week bucket shows.
 */
export function weeklyVolume(
  rows: SessionVolumeRow[],
  weeks = 12,
  now = new Date(),
): VolumeWeek[] {
  const totals = new Map<number, number>()
  for (const row of rows) {
    const key = weekStart(new Date(row.started_at)).getTime()
    totals.set(key, (totals.get(key) ?? 0) + num(row.volume_kg))
  }

  const current = weekStart(now)
  const out: VolumeWeek[] = []
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = new Date(current)
    start.setDate(start.getDate() - i * 7)
    out.push({ start, volumeKg: totals.get(start.getTime()) ?? 0 })
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
 * Five steps of one hue: rest, then four by volume. A sequential scale is one
 * hue getting lighter or darker, never a second colour.
 *
 * Shared by the History heatmap and the home's week row so the two cannot
 * disagree about what a heavy day looks like — which they would within a
 * week of being written separately.
 */
export const HEAT_RAMP = [
  'var(--color-tile-2)',
  'var(--color-accent-900)',
  'var(--color-accent-800)',
  'var(--color-accent-600)',
  'var(--color-accent-500)',
]

export interface WeekDay extends CalendarDay {
  /** 0-4 heat, relative to the busiest day of THIS week. 0 = nothing. */
  level: number
  /** Marked separately by the design: a white cell with an ember ring. */
  today: boolean
  /** Later this week. Drawn as a rest day, but it has not happened yet. */
  ahead: boolean
}

/**
 * The seven days of the current week, for the home feed's bar row.
 *
 * Monday-started, like every other week boundary in this app: `weekStart`,
 * `trainingCalendar`, ProgressScreen's own tile, and `weekly_streak`'s
 * `date_trunc('week')` in SQL. The design draws the row Sunday-started
 * (S M T W T F S), and following it here would put the home card and the
 * streak pill six inches apart disagreeing about how many sessions the week
 * has had.
 *
 * All seven days, unlike `trainingCalendar`, which stops at today: the design
 * shows the rest of the week as empty cells, and a row that grew a column a
 * day would be a strange thing to look at on a Tuesday.
 */
export function thisWeek(rows: SessionVolumeRow[], now = new Date()): WeekDay[] {
  const byDay = new Map<string, number>()
  for (const row of rows) {
    const key = dayKey(row.started_at)
    byDay.set(key, (byDay.get(key) ?? 0) + num(row.volume_kg))
  }

  const start = weekStart(now)
  const todayKey = dayKey(now.toISOString())
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(start)
    date.setDate(date.getDate() + i)
    const key = dayKey(date.toISOString())
    return { date, key, volumeKg: byDay.get(key) ?? 0 }
  })

  // Scaled to this week alone, not to all history: the card answers "how has
  // this week gone", and a light week next to a heavy one last month would
  // otherwise render as seven identical stubs.
  const max = Math.max(...days.map((d) => d.volumeKg))
  return days.map(({ date, key, volumeKg }) => ({
    date,
    volumeKg,
    level: heatStep(volumeKg, max),
    today: key === todayKey,
    ahead: date > now && key !== todayKey,
  }))
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

/**
 * Where a group's weekly sets sit relative to the productive band.
 *
 * Three states carried by one hue, per design v2.1: under the band is a
 * neutral (it is not an error, just quiet), in the band is the accent, and
 * over it is the darkest step of the same ramp. No red, no green — the ramp
 * carries the meaning, which is what keeps the one-accent rule intact while
 * saying three different things.
 */
export type BandState = 'under' | 'in' | 'over'

export function bandState(sets: number): BandState {
  if (sets < SET_BAND[0]) return 'under'
  if (sets > SET_BAND[1]) return 'over'
  return 'in'
}

/** Groups that have sat under the band, worst first. */
export function underBand(rows: MuscleGroupSets[]): string[] {
  return rows
    .filter((r) => num(r.set_count) < SET_BAND[0])
    .sort((a, b) => num(a.set_count) - num(b.set_count))
    .map((r) => r.muscle_group)
}

/**
 * What a lift's estimated-1RM series says about whether it is going anywhere.
 *
 * GATE U4 is "can I answer 'is my bench actually progressing?' from one
 * screen in under five seconds". A line answers it only if you read a line;
 * this is the sentence next to the line. Both come off the same series, so
 * they cannot disagree.
 *
 * `delta_kg` is latest minus earliest across the whole series, which is the
 * question people actually mean. `best_kg` is carried separately because a
 * lift can be up over the window and still below its best, and hiding that
 * would make the sentence a cheerleader rather than an instrument.
 */
export interface E1rmProgress {
  latest_kg: number
  earliest_kg: number
  delta_kg: number
  since_at: string
  best_kg: number
  best_at: string
  sessions: number
}

export function e1rmProgress(
  points: { started_at: string; best_1rm_kg: number | string | null }[],
): E1rmProgress | null {
  const clean = points
    .map((p) => ({ started_at: p.started_at, kg: num(p.best_1rm_kg) }))
    .filter((p) => p.kg > 0)
    .sort((a, b) =>
      a.started_at < b.started_at ? -1 : a.started_at > b.started_at ? 1 : 0,
    )

  if (clean.length === 0) return null

  const first = clean[0]
  const latest = clean[clean.length - 1]
  // Earliest wins a tie: a record stands from the first time it was set, the
  // same rule the rep-max ladder uses.
  let best = first
  for (const p of clean) if (p.kg > best.kg) best = p

  return {
    latest_kg: latest.kg,
    earliest_kg: first.kg,
    delta_kg: latest.kg - first.kg,
    since_at: first.started_at,
    best_kg: best.kg,
    best_at: best.started_at,
    sessions: clean.length,
  }
}

/** The rep counts the ladder reports, ascending. */
export const LADDER_RUNGS = [1, 3, 5, 8, 10]

/**
 * One set as the ladder needs it: the PostgREST column names, because that is
 * what `ExerciseDetail` already selects from `workout_sets`. Deliberately not
 * a camelCase shape — a mapping layer between the query and this function is
 * a place for the two to disagree.
 */
export interface LadderSet {
  weight_kg: number | null
  reps: number | null
  set_type: string
  /** `started_at` of the workout the set belongs to. */
  started_at: string
}

export interface LadderRung {
  reps: number
  best_weight_kg: number
  /** When it was first done, so the row can say how long the rung has stood. */
  achieved_at: string
}

/**
 * Best weight for each rep count in `rungs`.
 *
 * A set counts toward every rung at or below its rep count: 100 kg × 8 proves
 * a 5-rep max of at least 100 kg. That is what makes the ladder readable as a
 * strength curve rather than five unrelated numbers.
 *
 * Exclusions match every other record surface in the app (plan §5): warm-ups
 * never count, and a set missing weight or reps is not a performance. Zero and
 * negative values are refused too — the database permits them and a
 * bodyweight set stores null, so a 0 here is bad data rather than a light set.
 *
 * Ties go to the earliest date: the first time you did it is when you did it.
 *
 * NOTE ON SCOPE: this is "best in the sets you pass it", not a guaranteed
 * all-time record. `ExerciseDetail` caps its query, so a lift with more sets
 * than that cap has a ladder over a window. Migration 0019's `records_ladder`
 * would answer it in SQL over everything, and it is deliberately unapplied —
 * see DECISIONS.md.
 */
/**
 * Records, newest first, for the Progress tab's all-time list.
 *
 * The flags are the database's own (`pr_weight` / `pr_e1rm`, migration 0009,
 * maintained by a trigger and never by the client), so this shapes rather than
 * computes. A record set is a fact about the past: nothing here recalculates
 * whether it was one, because the row that says so was written when it happened
 * and `recompute_pr_flags` is what fixes it if history is edited.
 *
 * Both flags on one set is one entry, not two: it is one set, and printing it
 * twice would make a good day look like two.
 */
export interface RecordSetRow {
  exercise_id: string
  weight_kg: number | string | null
  reps: number | null
  pr_weight: boolean
  pr_e1rm: boolean
  started_at: string
}

export interface RecordEntry {
  exercise_id: string
  name: string
  weight_kg: number
  reps: number
  at: string
  /** What was beaten: the load, the estimate, or both in one set. */
  kind: 'weight' | 'e1rm' | 'both'
}

export function recentRecords(
  rows: RecordSetRow[],
  nameFor: (exerciseId: string) => string | undefined,
  // Five, not eight: at eight rows the block pushed the muscle-balance chart
  // off a phone screen, and this is the reward surface rather than the report.
  // Depth per lift lives on the exercise page.
  limit = 5,
): RecordEntry[] {
  const entries: RecordEntry[] = []
  for (const row of rows) {
    if (!row.pr_weight && !row.pr_e1rm) continue
    const weight = num(row.weight_kg)
    // A bodyweight set stores null weight and cannot be a load record; a set
    // with no reps is not a performance. Both are excluded everywhere else in
    // the app and the list would be lying if it showed them.
    if (weight <= 0 || row.reps === null || row.reps <= 0) continue
    const name = nameFor(row.exercise_id)
    // An unknown exercise means the catalogue has not arrived yet. Skipping is
    // right: a row reading "undefined 102.5 kg" is worse than a shorter list.
    if (!name) continue
    entries.push({
      exercise_id: row.exercise_id,
      name,
      weight_kg: weight,
      reps: row.reps,
      at: row.started_at,
      kind: row.pr_weight && row.pr_e1rm ? 'both' : row.pr_weight ? 'weight' : 'e1rm',
    })
  }
  return entries
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit)
}

/** A ladder row after equal neighbours are merged. `1-5 rep`, `8 rep`. */
export interface LadderBand {
  label: string
  best_weight_kg: number
  achieved_at: string
}

/**
 * Merge consecutive rungs that share a weight into one row.
 *
 * Because a set counts toward every rung at or below its reps, the top of the
 * ladder ties constantly: one heavy set of five makes the 1, 3 and 5 rungs
 * identical. Rendered raw that is three rows carrying one fact, which is worse
 * than useless on a screen read at arm's length — it looks like a bug. The
 * merged row says the same thing once and truthfully: a 226 lb five is a
 * proven 226 lb single.
 *
 * Found by looking at the built screen, not by reading the function.
 */
export function ladderBands(rungs: LadderRung[]): LadderBand[] {
  const bands: LadderBand[] = []
  for (const rung of rungs) {
    const open = bands.at(-1)
    if (open && open.best_weight_kg === rung.best_weight_kg) {
      // Extend the open band. The date stays the band's first one: it is when
      // the weight was lifted, and that is what the whole band records.
      const from = open.label.split('-')[0]
      open.label = `${from}-${rung.reps}`
      continue
    }
    bands.push({
      label: String(rung.reps),
      best_weight_kg: rung.best_weight_kg,
      achieved_at: rung.achieved_at,
    })
  }
  return bands
}

export function repMaxLadder(
  sets: LadderSet[],
  rungs: number[] = LADDER_RUNGS,
): LadderRung[] {
  const qualifying = sets.filter(
    (s) =>
      s.set_type !== 'warmup' &&
      s.weight_kg !== null &&
      s.reps !== null &&
      s.weight_kg > 0 &&
      s.reps > 0,
  )

  const ladder: LadderRung[] = []

  for (const rung of [...rungs].sort((a, b) => a - b)) {
    let best: LadderSet | null = null
    for (const set of qualifying) {
      if ((set.reps as number) < rung) continue
      if (best === null) {
        best = set
        continue
      }
      const weight = set.weight_kg as number
      const bestWeight = best.weight_kg as number
      if (weight > bestWeight) best = set
      else if (weight === bestWeight && set.started_at < best.started_at) best = set
    }
    if (best === null) continue
    ladder.push({
      reps: rung,
      best_weight_kg: best.weight_kg as number,
      achieved_at: best.started_at,
    })
  }

  return ladder
}
