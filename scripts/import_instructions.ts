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
import 'dotenv/config'
import { bestMatch } from './match_exercise_images'
import type { FreeExercise, OurExercise } from './match_exercise_images'

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

async function main() {
  const dry = process.argv.includes('--dry')

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
    process.exit(1)
  }

  const db = createClient(url, key, { auth: { persistSession: false } })

  // Seeded rows only. A custom exercise someone typed is theirs, and guessing
  // instructions for it would be inventing content under their own name.
  const { data: rows, error } = await db
    .from('exercises')
    .select('id, name, muscle_group, equipment, instructions')
    .is('owner_id', null)
    .order('name')

  if (error) throw new Error(`Could not read exercises: ${error.message}`)

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

  const pool: FreeExercise[] = await fetch(DB_URL).then((r) => r.json())
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
