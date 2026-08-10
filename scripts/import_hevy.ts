/**
 * One-time import of a cleaned Hevy export into Supabase.
 *
 *   npm run import:hevy -- --user <auth-user-uuid> [--csv workouts_corrected.csv]
 *
 * Runs server-side only, with the service-role key. Sign in to the app once
 * before running this: the auth user has to exist so its id can own the data.
 *
 * Re-running is safe. Workouts are keyed on (user_id, started_at); on re-run a
 * workout's sets are deleted and reinserted rather than upserted one by one,
 * because set_index is not unique within a workout (exercises can repeat).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse/sync'
import { createClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'
import type { MuscleGroup } from '../src/lib/types'
import { deriveEquipment, EXTRA_EXERCISES, MUSCLE_GROUPS } from './muscle_groups'

/*
 * `.env.local` FIRST, then `.env`.
 *
 * This was `import 'dotenv/config'`, which reads `.env` and only `.env`. This
 * project keeps its secrets in `.env.local`, because that is the file Vite
 * loads for the `VITE_*` vars and nobody maintains two, so the script failed
 * with "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required" while both
 * sat a few lines away on disk. `supabase_admin.ts` was fixed for exactly
 * this; these three were missed.
 *
 * Earlier entries win in dotenv, and neither file overrides a variable already
 * exported in the shell, so CI and any sandbox injecting real env vars are
 * unaffected.
 */
loadEnv({ path: ['.env.local', '.env'] })

export const LBS_TO_KG = 0.453592
export const MILES_TO_METERS = 1609.34
export const SOURCE_TIMEZONE = 'America/Chicago'

const SET_TYPES = new Set(['normal', 'warmup', 'failure'])

/** Columns used from the export. description and exercise_notes are still
 *  ignored — no columns for them until Stage 2B. */
export interface CsvRow {
  title: string
  start_time: string
  end_time: string
  exercise_title: string
  superset_id: string
  set_index: string
  set_type: string
  weight_lbs: string
  reps: string
  distance_miles: string
  duration_seconds: string
  rpe: string
}

export interface Session {
  name: string | null
  startedAt: string
  endedAt: string | null
  rows: CsvRow[]
}

export interface ExerciseSeed {
  name: string
  muscle_group: MuscleGroup
  equipment: string
  is_custom: boolean
  owner_id: null
}

export interface SetSeed {
  workout_id: string
  exercise_id: string
  set_number: number
  weight_kg: number | null
  reps: number | null
  rpe: number | null
  duration_seconds: number | null
  distance_meters: number | null
  set_type: string
  superset_group: number | null
}

export class ImportError extends Error {}

function fail(message: string): never {
  throw new ImportError(message)
}

// ---------------------------------------------------------------------------
// Pure transforms
// ---------------------------------------------------------------------------

/** Offset of a timezone at a given instant, in milliseconds. */
function timezoneOffset(timestampMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(timestampMs))

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  const hour = get('hour') % 24
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour,
    get('minute'),
    get('second'),
  )
  return asUtc - timestampMs
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/** "Jul 19, 2026, 7:01 PM" read as America/Chicago -> ISO instant. */
export function parseHevyDate(value: string): string | null {
  const raw = value?.trim()
  if (!raw) return null

  const match = raw.match(
    /^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i,
  )
  if (!match) {
    fail(
      `Unrecognised date "${raw}". Expected the Hevy format "Jul 19, 2026, 7:01 PM".`,
    )
  }

  const month = MONTHS.findIndex((m) => m.toLowerCase() === match[1].toLowerCase())
  if (month < 0) fail(`Unrecognised month in "${raw}".`)

  const day = Number(match[2])
  const year = Number(match[3])
  const meridiem = match[6].toUpperCase()
  let hour = Number(match[4]) % 12
  if (meridiem === 'PM') hour += 12
  const minute = Number(match[5])

  // Interpret the wall clock in the source zone, then resolve it to an instant.
  // The second pass fixes the hour on days that cross a DST boundary.
  const naive = Date.UTC(year, month, day, hour, minute)
  const firstOffset = timezoneOffset(naive, SOURCE_TIMEZONE)
  let instant = naive - firstOffset
  const secondOffset = timezoneOffset(instant, SOURCE_TIMEZONE)
  if (secondOffset !== firstOffset) instant = naive - secondOffset

  return new Date(instant).toISOString()
}

export function num(value: string | undefined): number | null {
  const raw = value?.trim()
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

export function readCsv(path: string): CsvRow[] {
  let file: string
  try {
    file = readFileSync(path, 'utf8')
  } catch {
    fail(`Cannot read "${path}". Pass the path with --csv, or run from the repo root.`)
  }
  const rows = parse(file, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as CsvRow[]
  if (rows.length === 0) fail(`"${path}" has no data rows.`)
  return rows
}

/** Every distinct CSV exercise plus the program lifts missing from the export. */
export function catalogueNames(rows: CsvRow[]): string[] {
  const csvNames = rows.map((r) => r.exercise_title.trim())
  return [...new Set([...csvNames, ...EXTRA_EXERCISES])].sort()
}

export function buildCatalogue(names: string[]): ExerciseSeed[] {
  const unmapped = names.filter((name) => !MUSCLE_GROUPS[name])
  if (unmapped.length > 0) {
    fail(
      `No muscle group mapped for: ${unmapped.join(', ')}. Add them to ` +
        'scripts/muscle_groups.ts using one of the eleven allowed groups.',
    )
  }

  return names.map((name) => {
    const group = MUSCLE_GROUPS[name]
    return {
      name,
      muscle_group: group,
      equipment: deriveEquipment(name, group),
      is_custom: false,
      owner_id: null,
    }
  })
}

/** Rows grouped into workouts by start_time, in file order. */
export function buildSessions(rows: CsvRow[]): Session[] {
  const sessions = new Map<string, Session>()

  for (const row of rows) {
    const key = row.start_time?.trim()
    if (!key) fail('A row is missing start_time; every set must belong to a workout.')

    let session = sessions.get(key)
    if (!session) {
      session = {
        name: row.title?.trim() || null,
        startedAt: parseHevyDate(row.start_time)!,
        endedAt: parseHevyDate(row.end_time),
        rows: [],
      }
      sessions.set(key, session)
    }
    session.rows.push(row)
  }

  return [...sessions.values()]
}

export function buildSetRows(
  session: Session,
  workoutId: string,
  exerciseIds: Map<string, string>,
): SetSeed[] {
  return session.rows.map((row) => {
    const name = row.exercise_title.trim()
    const exerciseId = exerciseIds.get(name)
    if (!exerciseId) fail(`No exercise id for "${name}".`)

    const setType = row.set_type?.trim().toLowerCase() || 'normal'
    if (!SET_TYPES.has(setType)) {
      fail(`Unknown set_type "${row.set_type}". Expected normal, warmup or failure.`)
    }

    const weightLbs = num(row.weight_lbs)
    const distanceMiles = num(row.distance_miles)

    // Hevy's superset_id is per-export, not per-workout, but it is only ever
    // compared within one workout so the wider scope is harmless.
    const supersetGroup = num(row.superset_id)

    return {
      workout_id: workoutId,
      exercise_id: exerciseId,
      set_number: num(row.set_index) ?? 0,
      weight_kg: weightLbs === null ? null : Number((weightLbs * LBS_TO_KG).toFixed(2)),
      reps: num(row.reps),
      rpe: num(row.rpe),
      duration_seconds: num(row.duration_seconds),
      distance_meters:
        distanceMiles === null ? null : Math.round(distanceMiles * MILES_TO_METERS),
      set_type: setType,
      superset_group: supersetGroup,
    }
  })
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function readArgs() {
  const argv = process.argv.slice(2)
  const flag = (name: string) => {
    const index = argv.indexOf(`--${name}`)
    return index >= 0 ? argv[index + 1] : undefined
  }

  const userId = flag('user') ?? process.env.IMPORT_USER_ID
  const csvPath = flag('csv') ?? process.env.IMPORT_CSV ?? 'workouts_corrected.csv'
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    fail(
      'SUPABASE_URL is not set. Add it to .env (Project Settings > API > Project URL).',
    )
  }
  if (!serviceKey) {
    fail(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env (Project Settings > API > ' +
        'service_role key). Never put this key in a VITE_ variable — it bypasses RLS.',
    )
  }
  if (!userId) {
    fail(
      'No target user. Sign in to the app once to create your auth user, copy its id ' +
        'from Supabase > Authentication > Users, then re-run with ' +
        '`npm run import:hevy -- --user <uuid>` (or set IMPORT_USER_ID).',
    )
  }
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    fail(
      `"${userId}" is not a user UUID. Copy the id from Supabase > Authentication > Users.`,
    )
  }

  return { userId, csvPath: resolve(process.cwd(), csvPath), url, serviceKey }
}

async function main() {
  const { userId, csvPath, url, serviceKey } = readArgs()

  const rows = readCsv(csvPath)
  console.log(`Read ${rows.length} rows from ${csvPath}`)

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // --- 1. Exercises -------------------------------------------------------
  const names = catalogueNames(rows)
  const catalogue = buildCatalogue(names)
  console.log(`Exercises referenced: ${names.length}`)

  // The uniqueness index on seeded names is partial (owner_id is null), which
  // PostgREST cannot infer for an upsert, so insert only what is missing.
  const { data: existing, error: existingError } = await supabase
    .from('exercises')
    .select('id, name')
    .is('owner_id', null)
  if (existingError)
    fail(`Reading existing exercises failed — ${existingError.message}`)

  const known = new Set((existing ?? []).map((e) => e.name as string))
  const missing = catalogue.filter((e) => !known.has(e.name))

  if (missing.length > 0) {
    const { error: exerciseError } = await supabase.from('exercises').insert(missing)
    if (exerciseError) fail(`Seeding exercises failed — ${exerciseError.message}`)
    console.log(`Seeded ${missing.length} new exercises`)
  } else {
    console.log('Exercise catalogue already seeded')
  }

  const { data: seeded, error: seededError } = await supabase
    .from('exercises')
    .select('id, name')
    .is('owner_id', null)
  if (seededError) fail(`Reading back exercises failed — ${seededError.message}`)

  const exerciseIds = new Map(
    (seeded ?? []).map((e) => [e.name as string, e.id as string]),
  )

  // --- 2. Workouts --------------------------------------------------------
  const sessions = buildSessions(rows)
  console.log(`Workouts to import: ${sessions.length}`)

  const { data: workouts, error: workoutError } = await supabase
    .from('workouts')
    .upsert(
      sessions.map((s) => ({
        user_id: userId,
        name: s.name,
        started_at: s.startedAt,
        ended_at: s.endedAt,
      })),
      { onConflict: 'user_id,started_at' },
    )
    .select('id, started_at')
  if (workoutError) {
    fail(
      `Importing workouts failed — ${workoutError.message}. If this mentions a foreign ` +
        `key on user_id, the user ${userId} does not exist yet: sign in to the app first.`,
    )
  }

  const workoutIds = new Map(
    (workouts ?? []).map((w) => [
      new Date(w.started_at as string).toISOString(),
      w.id as string,
    ]),
  )

  // --- 3. Sets ------------------------------------------------------------
  // Delete first: set_index repeats within a workout when an exercise is
  // revisited, so there is no stable per-set key to upsert on.
  const ids = [...workoutIds.values()]
  for (let i = 0; i < ids.length; i += 100) {
    const { error: deleteError } = await supabase
      .from('workout_sets')
      .delete()
      .in('workout_id', ids.slice(i, i + 100))
    if (deleteError) fail(`Clearing existing sets failed — ${deleteError.message}`)
  }

  const setPayload: SetSeed[] = []
  for (const session of sessions) {
    const workoutId = workoutIds.get(session.startedAt)
    if (!workoutId) fail(`No workout id came back for ${session.startedAt}.`)
    setPayload.push(...buildSetRows(session, workoutId, exerciseIds))
  }

  for (let i = 0; i < setPayload.length; i += 500) {
    const chunk = setPayload.slice(i, i + 500)
    const { error: setError } = await supabase.from('workout_sets').insert(chunk)
    if (setError) fail(`Importing sets failed at row ${i} — ${setError.message}`)
    process.stdout.write(
      `\rSets imported: ${Math.min(i + chunk.length, setPayload.length)}/${setPayload.length}`,
    )
  }

  console.log('\n')
  console.log('Import complete.')
  console.log(`  exercises: ${exerciseIds.size}`)
  console.log(`  workouts:  ${workoutIds.size}`)
  console.log(`  sets:      ${setPayload.length}`)
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isDirectRun) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`\nImport aborted: ${message}\n`)
    process.exit(1)
  })
}
