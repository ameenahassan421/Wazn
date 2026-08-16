import { parseCsvRecords } from './csv'
import type { SetType } from './types'

/**
 * Reading a Hevy export in the browser, for the switcher's first session.
 *
 * `scripts/import_hevy.ts` already does this — it built Ameen's nine months of
 * history — and this module deliberately does NOT reuse it. Three reasons, all
 * of them about who the file belongs to:
 *
 *  1. **The script aborts; this reports.** Every problem in the script calls
 *     `fail()` and throws, which is right for a one-off run by the person who
 *     can go and fix the CSV. A stranger's export will contain exercises Wazn
 *     has never heard of, and refusing the whole import over one of them would
 *     be the app throwing away someone's training history to protect a lookup
 *     table. Problems come back as data.
 *  2. **The script's timezone is Ameen's.** `SOURCE_TIMEZONE` is hardcoded to
 *     `America/Chicago` because that is where the seed data was logged. A
 *     switcher's export is in their own timezone, so this reads the browser's.
 *  3. **The script's weight column is `weight_lbs`.** Hevy names it after the
 *     account's unit, so an export from a kg account has `weight_kg` and the
 *     script would silently read every weight as null.
 *
 * Nothing here writes. It turns a file into a plan the user can look at before
 * anything happens, because this is the one flow where a surprise is
 * unforgivable — it is somebody's training history.
 */

export const LBS_TO_KG = 0.453592
export const MILES_TO_METERS = 1609.34

/** Hevy set types, mapped onto ours. Anything else becomes a normal set. */
const SET_TYPES: Record<string, SetType> = {
  normal: 'normal',
  warmup: 'warmup',
  failure: 'failure',
  drop: 'drop',
}

/** Columns that must exist, or this is not a Hevy export at all. */
const REQUIRED = ['start_time', 'exercise_title'] as const

export interface PlannedSet {
  setNumber: number
  weightKg: number | null
  reps: number | null
  rpe: number | null
  durationSeconds: number | null
  distanceMeters: number | null
  setType: SetType
  supersetGroup: number | null
  /** Catalogue name, resolved to an id at write time. */
  exerciseName: string
}

export interface PlannedWorkout {
  name: string | null
  startedAt: string
  endedAt: string | null
  sets: PlannedSet[]
}

export interface ImportPlan {
  workouts: PlannedWorkout[]
  /** Exercise names in the file that already exist in the user's catalogue. */
  matched: string[]
  /** Names Wazn has never seen. Offered as custom exercises, never dropped. */
  unmatched: string[]
  setCount: number
  /** ISO dates of the earliest and latest session, or null for an empty plan. */
  range: { from: string; to: string } | null
  /**
   * Non-fatal things worth showing before the user commits: rows skipped, a
   * date that would not parse. Never silent.
   */
  problems: string[]
  /** Set when the file is not a Hevy export. Nothing can be imported. */
  fatal: string | null
  /**
   * Sessions in the file that are already in the log, matched on the exact
   * start instant. Removed from `workouts` — never written twice.
   */
  duplicates: number
  /**
   * The newest session already in the log, or null for an empty account.
   *
   * This is what the cutoff below is offered against, and it is the only
   * defence that survives a timezone difference. The exact-instant match above
   * catches a re-import of the same file from the same device; it does NOT
   * catch a file whose times were first imported under a different zone —
   * `scripts/import_hevy.ts` hardcodes `America/Chicago` and this module reads
   * the browser's, so the same session can arrive hours off and match nothing.
   * A date cutoff does not care.
   */
  latestLogged: string | null
  /**
   * Sessions at or before `latestLogged` that did NOT match an existing start
   * instant. Kept in `workouts`, because they may be real sessions this app
   * has never seen — but counted, because they are also what a timezone shift
   * looks like, and the user is the one who can tell which.
   */
  overlapping: number
}

const EMPTY: ImportPlan = {
  workouts: [],
  matched: [],
  unmatched: [],
  setCount: 0,
  range: null,
  problems: [],
  fatal: null,
  duplicates: 0,
  latestLogged: null,
  overlapping: 0,
}

function num(value: string | undefined): number | null {
  const raw = value?.trim()
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
]

/** Minutes that `timeZone` is ahead of UTC at `timestampMs`. */
function timezoneOffset(timestampMs: number, timeZone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(timestampMs)).map((p) => [p.type, p.value]),
    )
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute),
      Number(parts.second),
    )
    return asUtc - timestampMs
  } catch {
    return 0
  }
}

/**
 * Hevy writes wall-clock local time with no offset — `"21 Oct 2025, 18:04"`
 * and, on some exports, `"2025-10-21 18:04:00"`. Either way the instant is
 * only recoverable by asking what that wall clock meant in the user's zone,
 * and the answer changes across a DST boundary, so the offset is resolved
 * twice: once against the naive instant and again against the corrected one.
 */
export function parseHevyDate(
  value: string | undefined,
  timeZone: string,
): string | null {
  const raw = value?.trim()
  if (!raw) return null

  let year: number, month: number, day: number, hour: number, minute: number

  const text = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4}),?\s+(\d{1,2}):(\d{2})/)
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/)

  if (text) {
    const monthIndex = MONTHS.indexOf(text[2].slice(0, 3).toLowerCase())
    if (monthIndex === -1) return null
    day = Number(text[1])
    month = monthIndex
    year = Number(text[3])
    hour = Number(text[4])
    minute = Number(text[5])
  } else if (iso) {
    year = Number(iso[1])
    month = Number(iso[2]) - 1
    day = Number(iso[3])
    hour = Number(iso[4])
    minute = Number(iso[5])
  } else {
    return null
  }

  const naive = Date.UTC(year, month, day, hour, minute)
  if (!Number.isFinite(naive)) return null

  const first = timezoneOffset(naive, timeZone)
  let instant = naive - first
  const second = timezoneOffset(instant, timeZone)
  if (second !== first) instant = naive - second

  const date = new Date(instant)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * Turn a Hevy CSV into a plan, against the catalogue the user actually has.
 *
 * `catalogue` is the exercise names already in the database. Matching is
 * case-insensitive on a trimmed name, because that is the only thing two
 * catalogues reliably agree on — anything cleverer would silently merge two
 * different lifts, which is worse than creating one custom exercise.
 */
export function analyse(
  text: string,
  catalogue: string[],
  timeZone: string = 'UTC',
  /**
   * `started_at` of every workout already in the log, as ISO strings.
   *
   * Defaulted to empty so the first-import case and every existing caller are
   * unchanged. Passing it is what turns a second import from a silent
   * doubling of the user's history into a decision they get to make.
   */
  existing: string[] = [],
): ImportPlan {
  let records: Record<string, string>[]
  try {
    records = parseCsvRecords(text)
  } catch {
    return { ...EMPTY, fatal: 'That file could not be read as a CSV.' }
  }

  if (records.length === 0) {
    return { ...EMPTY, fatal: 'That file has no rows in it.' }
  }

  const columns = new Set(Object.keys(records[0]))
  const missing = REQUIRED.filter((c) => !columns.has(c))
  if (missing.length > 0) {
    return {
      ...EMPTY,
      fatal:
        'That does not look like a Hevy export — it is missing the ' +
        `${missing.join(' and ')} column${missing.length > 1 ? 's' : ''}. ` +
        'In Hevy: Profile → Settings → Export Data.',
    }
  }

  // Hevy names the weight column after the account's unit. Reading the wrong
  // one is not an error, it is every weight silently arriving as null.
  const weightColumn = columns.has('weight_kg') ? 'weight_kg' : 'weight_lbs'
  const weightIsKg = weightColumn === 'weight_kg'

  const known = new Map(catalogue.map((name) => [name.trim().toLowerCase(), name]))
  const seen = new Map<string, string>()
  const problems: string[] = []
  const byStart = new Map<string, PlannedWorkout>()
  let skipped = 0
  let unparsedDates = 0
  let setCount = 0

  for (const row of records) {
    const exerciseName = row.exercise_title?.trim()
    const startedAt = parseHevyDate(row.start_time, timeZone)

    if (!exerciseName) {
      skipped += 1
      continue
    }
    if (!startedAt) {
      unparsedDates += 1
      continue
    }

    if (!seen.has(exerciseName.toLowerCase())) {
      seen.set(exerciseName.toLowerCase(), exerciseName)
    }

    let workout = byStart.get(startedAt)
    if (!workout) {
      workout = {
        name: row.title?.trim() || null,
        startedAt,
        endedAt: parseHevyDate(row.end_time, timeZone),
        sets: [],
      }
      byStart.set(startedAt, workout)
    }

    const weight = num(row[weightColumn])
    const distanceMiles = num(row.distance_miles)
    const distanceKm = num(row.distance_km)
    const setType = SET_TYPES[row.set_type?.trim().toLowerCase() ?? ''] ?? 'normal'

    workout.sets.push({
      // Hevy's set_index is zero-based; every set row in this app numbers from
      // one, and History renders the number straight through.
      setNumber: (num(row.set_index) ?? workout.sets.length) + 1,
      weightKg:
        weight === null
          ? null
          : Number((weightIsKg ? weight : weight * LBS_TO_KG).toFixed(2)),
      reps: num(row.reps),
      rpe: num(row.rpe),
      durationSeconds: num(row.duration_seconds),
      distanceMeters:
        distanceKm !== null
          ? Math.round(distanceKm * 1000)
          : distanceMiles === null
            ? null
            : Math.round(distanceMiles * MILES_TO_METERS),
      setType,
      // Hevy's superset_id is per-export rather than per-workout, but it is
      // only ever compared within one workout, so the wider scope is harmless.
      supersetGroup: num(row.superset_id),
      exerciseName,
    })
    setCount += 1
  }

  if (skipped > 0) {
    problems.push(
      `${skipped} row${skipped === 1 ? '' : 's'} had no exercise name and will be left out.`,
    )
  }
  if (unparsedDates > 0) {
    problems.push(
      `${unparsedDates} row${unparsedDates === 1 ? '' : 's'} had a date this app could not read and will be left out.`,
    )
  }

  const parsed = [...byStart.values()].sort((a, b) =>
    a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0,
  )

  // ── What the log already holds ──────────────────────────────────────────
  // The importer used to know nothing about it, and `writeWorkout` is a plain
  // insert with no unique constraint behind it, so a second import of the same
  // export silently doubled the user's entire history. Volume, e1RM, adherence
  // and every forecast built on them go with it.
  const logged = new Set(
    existing.map((iso) => new Date(iso).getTime()).filter((n) => Number.isFinite(n)),
  )
  const latestLogged =
    existing.length === 0 ? null : new Date(Math.max(...[...logged])).toISOString()

  const workouts = parsed.filter((w) => !logged.has(new Date(w.startedAt).getTime()))
  const duplicates = parsed.length - workouts.length

  // Kept, not dropped — see the note on `overlapping`. A session this app has
  // never seen is data, even when it sits inside a period the log covers.
  const overlapping =
    latestLogged === null
      ? 0
      : workouts.filter((w) => w.startedAt <= latestLogged).length

  if (duplicates > 0) {
    problems.push(
      `${duplicates} session${duplicates === 1 ? ' is' : 's are'} already in your log and will be skipped.`,
    )
  }
  if (overlapping > 0) {
    problems.push(
      `${overlapping} session${overlapping === 1 ? '' : 's'} in this file happened on or before your last logged workout but did not match one. Check the cutoff below before importing.`,
    )
  }

  // Recount against what will actually be written, or the preview promises a
  // number of sets it is not going to insert.
  setCount = workouts.reduce((n, w) => n + w.sets.length, 0)

  const names = [...seen.values()].sort((a, b) => a.localeCompare(b))
  const matched = names.filter((n) => known.has(n.toLowerCase()))
  const unmatched = names.filter((n) => !known.has(n.toLowerCase()))

  if (parsed.length === 0) {
    return {
      ...EMPTY,
      problems,
      fatal: 'Nothing in that file could be read as a workout.',
    }
  }

  // Every session in the file is already logged. Not a fault, and not an
  // error state: it is what re-importing the same export looks like, and
  // saying so plainly is better than an empty preview the user has to
  // interpret.
  if (workouts.length === 0) {
    return {
      ...EMPTY,
      matched,
      unmatched,
      problems,
      duplicates,
      latestLogged,
      fatal: 'Every session in that file is already in your log.',
    }
  }

  return {
    workouts,
    matched,
    unmatched,
    setCount,
    range: {
      from: workouts[0].startedAt,
      to: workouts[workouts.length - 1].startedAt,
    },
    problems,
    fatal: null,
    duplicates,
    latestLogged,
    overlapping,
  }
}

/**
 * Drop everything on or before `cutoff` — the "only what is new" control.
 *
 * Separate from `analyse` because it is the user's decision, taken after they
 * have seen the counts, and because it must be reversible without re-reading
 * the file. It is also the only defence that survives a timezone difference:
 * exact-instant matching cannot tell a re-import from a shifted one, and a
 * date can.
 */
export function afterCutoff(plan: ImportPlan, cutoff: string | null): ImportPlan {
  if (!cutoff) return plan
  const workouts = plan.workouts.filter((w) => w.startedAt > cutoff)
  if (workouts.length === plan.workouts.length) return plan
  return {
    ...plan,
    workouts,
    setCount: workouts.reduce((n, w) => n + w.sets.length, 0),
    overlapping: 0,
    range:
      workouts.length === 0
        ? null
        : {
            from: workouts[0].startedAt,
            to: workouts[workouts.length - 1].startedAt,
          },
  }
}
