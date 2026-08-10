/**
 * Stage 2B: fill exercises.instructions from free-exercise-db.
 *
 *   npm run import:instructions -- --dry     # report coverage, write nothing
 *   npm run import:instructions              # write
 *
 * Runs server-side only, with the service-role key: there is no insert/update
 * policy on public.exercises for `authenticated`, so instructions are writable
 * by this script and nothing else.
 *
 * The match is not recomputed here. It reuses `bestMatch` from the Stage 0D
 * image importer, so an exercise's photo and its steps always come from the
 * same free-exercise-db entry. A second matcher would drift, and the failure
 * mode is one lift's picture above another lift's instructions — which reads
 * as authoritative and is worse than showing nothing.
 *
 * Re-running is safe and idempotent: it recomputes every match and writes the
 * rows whose text actually changed.
 */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'
import { bestMatch } from './match_exercise_images'
import type { FreeExercise, OurExercise } from './match_exercise_images'

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

const DB_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'

/** Steps longer than this are almost always a run-on paragraph, not a step. */
const MAX_STEP_LENGTH = 600

export interface Resolved {
  exercise: OurExercise
  instructions: string[] | null
  matchedName: string | null
  score: number
}

/**
 * free-exercise-db instruction arrays carry stray whitespace, a few empty
 * strings, and the occasional duplicated line. Clean without rewording: this
 * is public-domain reference text and paraphrasing it would make it ours to
 * be wrong about.
 */
export function cleanInstructions(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null

  const seen = new Set<string>()
  const steps: string[] = []

  for (const item of raw) {
    if (typeof item !== 'string') continue
    const step = item.replace(/\s+/g, ' ').trim()
    if (step === '' || step.length > MAX_STEP_LENGTH) continue
    const key = step.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    steps.push(step)
  }

  return steps.length > 0 ? steps : null
}

/** True when the stored value differs from what we would write now. */
export function needsUpdate(
  current: string[] | null | undefined,
  next: string[] | null,
): boolean {
  if (next === null) return false // never clear text that is already there
  if (!Array.isArray(current)) return true
  if (current.length !== next.length) return true
  return current.some((step, i) => step !== next[i])
}

/** Pure core, so coverage can be checked without a database or a network. */
export function resolveAll(ours: OurExercise[], pool: FreeExercise[]): Resolved[] {
  return ours.map((exercise) => {
    const match = bestMatch(exercise, pool)
    return {
      exercise,
      instructions: match ? cleanInstructions(match.hit.instructions) : null,
      matchedName: match?.hit.name ?? null,
      score: match?.score ?? 0,
    }
  })
}

export function summarise(resolved: Resolved[]): {
  total: number
  withSteps: number
  noMatch: number
  matchedButNoSteps: number
} {
  let withSteps = 0
  let noMatch = 0
  let matchedButNoSteps = 0

  for (const r of resolved) {
    if (r.instructions !== null) withSteps += 1
    else if (r.matchedName === null) noMatch += 1
    else matchedButNoSteps += 1
  }

  return { total: resolved.length, withSteps, noMatch, matchedButNoSteps }
}

/**
 * Fetch the free-exercise-db catalogue with a status check and a timeout.
 *
 * `fetch(DB_URL).then(r => r.json())` trusted the response: a 404 or a 502 from
 * raw.githubusercontent went to `.json()` and failed as an unexpected-token
 * parse error naming neither the URL nor the status, and a stalled connection
 * hung with no output at all.
 */
async function fetchCatalogue(): Promise<FreeExercise[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  try {
    const response = await fetch(DB_URL, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(
        `free-exercise-db returned ${response.status} ${response.statusText} for ${DB_URL}`,
      )
    }
    return (await response.json()) as FreeExercise[]
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `free-exercise-db did not respond within 60s (${DB_URL}). ` +
          'Check the connection and re-run; nothing was written.',
        { cause: error },
      )
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  const dry = process.argv.includes('--dry')

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
    process.exit(1)
  }

  // A timeout on every request this client makes. Without one, an unreachable
  // host or a dead key can leave the read hanging with no output and no error,
  // which is indistinguishable from a slow query.
  const db = createClient(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(20_000) }),
    },
  })

  // Progress, because everything below is two network round trips and the
  // first report only prints once both have finished. Without these lines the
  // command looks hung for several seconds and then prints everything at
  // once, which reads as a broken script rather than a slow one.
  console.log(dry ? 'Dry run. Reading exercises...' : 'Reading exercises...')

  // Seeded rows only. A custom exercise someone typed is theirs, and guessing
  // instructions for it would be inventing content under their own name.
  const { data: rows, error } = await db
    .from('exercises')
    .select('id, name, muscle_group, equipment, instructions')
    .is('owner_id', null)
    .order('name')

  if (error) {
    throw new Error(
      `Could not read exercises: ${error.message}. ` +
        'A timeout here usually means SUPABASE_URL is unreachable or ' +
        'SUPABASE_SERVICE_ROLE_KEY is stale (rotating the key invalidates the ' +
        'one in .env.local).',
      { cause: error },
    )
  }

  const current = new Map<string, string[] | null>(
    (rows ?? []).map((r) => [
      r.id as string,
      (r.instructions ?? null) as string[] | null,
    ]),
  )
  const ours: OurExercise[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    muscle_group: r.muscle_group as string,
    equipment: r.equipment as string,
  }))

  // The slow half, and it used to be silent: several MB from raw.githubusercontent
  // with no status check and no timeout, so a 404 surfaced as a JSON parse error
  // and a stalled connection looked like a hung script.
  console.log('Fetching free-exercise-db (a few MB)...')
  const pool: FreeExercise[] = await fetchCatalogue()
  const resolved = resolveAll(ours, pool)
  const stats = summarise(resolved)

  const pending = resolved.filter((r) =>
    needsUpdate(current.get(r.exercise.id), r.instructions),
  )

  console.log(
    `\n${stats.withSteps}/${stats.total} exercises have instructions ` +
      `(${stats.noMatch} unmatched, ${stats.matchedButNoSteps} matched but the ` +
      `entry carries no steps).`,
  )
  console.log(`${pending.length} row(s) would change.\n`)

  if (dry) {
    for (const r of resolved.filter((x) => x.instructions === null)) {
      console.log(
        `  no steps  ${r.exercise.name}` +
          (r.matchedName ? `  ->  ${r.matchedName}` : '  ->  (no confident match)'),
      )
    }
    console.log('\nDry run — nothing written.\n')
    return
  }

  let written = 0
  for (const r of pending) {
    const { error: updateError } = await db
      .from('exercises')
      .update({ instructions: r.instructions })
      .eq('id', r.exercise.id)
    if (updateError) {
      throw new Error(`Could not update ${r.exercise.name}: ${updateError.message}`)
    }
    written += 1
  }

  console.log(`Wrote instructions for ${written} exercise(s).\n`)
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isDirectRun) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`\nInstruction import aborted: ${message}\n`)
    process.exit(1)
  })
}
