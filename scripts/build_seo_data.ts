/**
 * STEP 1 of F2: Snapshot seeded exercises from Supabase into a committed
 * JSON file that the page generator consumes at build time.
 *
 * Run manually (NOT wired to `npm run build`):
 *
 *   npx tsx scripts/build_seo_data.ts             # snapshot from Supabase
 *   npx tsx scripts/build_seo_data.ts --offline   # re-apply Arabic copy only
 *
 * Reads through supabase-js with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY,
 * the same pair import_instructions.ts uses. It was written against the
 * Management API personal-access-token instead, which is a second credential
 * to keep alive for no benefit: that token expired and returned
 * "JWT could not be decoded", while the service-role key already in
 * .env.local worked. The key is script-only and never reaches the client.
 *
 * Output: build/seo/exercises.json
 * The JSON carries a top-level "_draft" marker because every Arabic name
 * in it was machine-drafted and never reviewed by a native speaker.
 *
 * HERMETIC RULE: the page generator reads only this JSON. It never calls
 * Supabase at build time, so CI (which has no credentials) works fine
 * once the snapshot exists.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'

loadEnv({ path: ['.env.local', '.env'] })

import { assignSlugs } from './seo_slugs'
import {
  draftArabicName,
  ARABIC_MUSCLE_GROUPS,
  ARABIC_EQUIPMENT,
} from './arabic_exercises'
import { arabicInstructions } from './arabic_instructions'

// ---------------------------------------------------------------------------
// Supabase read (service role, same as import_instructions.ts)
// ---------------------------------------------------------------------------

function client() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local. ' +
        'The service-role key is script-only: never put it in a VITE_ var.',
    )
    process.exit(1)
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

interface ExerciseRow {
  id: string
  name: string
  muscle_group: string
  equipment: string
  instructions: string[] | null
}

interface ExerciseSnapshot {
  id: string
  slug: string
  name_en: string
  name_ar: string
  muscle_group: string
  muscle_group_ar: string
  equipment: string
  equipment_ar: string
  instructions: string[]
  /** null until translated. No Arabic steps means no Arabic page. */
  instructions_ar: string[] | null
}

interface OutputFile {
  _draft: string
  generatedAt: string
  count: number
  exercises: ExerciseSnapshot[]
}

/**
 * Re-apply the local Arabic layer to an existing snapshot, with no network.
 *
 * Names and instruction translations live in `arabic_exercises.ts` and
 * `arabic_instructions.ts`, which are ordinary files in this repo. Requiring a
 * Supabase round trip to pick up a copy edit meant a credential and a reachable
 * host for a change that touches neither, and Arabic copy will be edited far
 * more often than the exercise catalogue changes.
 */
function offlineMerge() {
  const outPath = resolve('build/seo', 'exercises.json')
  if (!existsSync(outPath)) {
    console.error(
      `${outPath} does not exist. Run without --offline once to snapshot the ` +
        'catalogue from Supabase, then --offline picks up copy edits.',
    )
    process.exit(1)
  }
  const file = JSON.parse(readFileSync(outPath, 'utf8')) as OutputFile
  let names = 0
  let steps = 0
  for (const ex of file.exercises) {
    const nameAr = draftArabicName(ex.name_en, ex.muscle_group, ex.equipment)
    if (nameAr !== ex.name_ar) names++
    ex.name_ar = nameAr
    ex.muscle_group_ar = ARABIC_MUSCLE_GROUPS[ex.muscle_group] ?? ex.muscle_group
    ex.equipment_ar = ARABIC_EQUIPMENT[ex.equipment] ?? ex.equipment
    const before = ex.instructions_ar?.length ?? 0
    ex.instructions_ar = arabicInstructions(ex.name_en)
    if ((ex.instructions_ar?.length ?? 0) !== before) steps++
  }
  const translated = file.exercises.filter((e) => e.instructions_ar).length
  writeFileSync(outPath, JSON.stringify(file, null, 2) + '\n')
  console.log(
    `Offline merge: ${names} name(s) changed, ${steps} instruction set(s) changed. ` +
      `${translated}/${file.exercises.length} now have Arabic instructions.`,
  )
}

async function main() {
  if (process.argv.includes('--offline')) {
    offlineMerge()
    return
  }

  console.log('Querying Supabase for seeded exercises...')

  const { data, error } = await client()
    .from('exercises')
    .select('id, name, muscle_group, equipment, instructions')
    .eq('is_custom', false)
    .is('archived_at', null)
    .order('name')

  if (error) {
    console.error(`Supabase read failed: ${error.message}`)
    process.exit(1)
  }
  const rows = (data ?? []) as ExerciseRow[]

  if (!Array.isArray(rows) || rows.length === 0) {
    console.error(
      'No rows returned. Is the token valid and the exercises table populated?',
    )
    process.exit(1)
  }

  console.log(`Fetched ${rows.length} exercises. Building slugs...`)

  const slugMap = assignSlugs(rows.map((r) => r.name))

  const exercises: ExerciseSnapshot[] = rows.map((row) => ({
    id: row.id,
    slug: slugMap.get(row.name) ?? '',
    name_en: row.name,
    name_ar: draftArabicName(row.name, row.muscle_group, row.equipment),
    muscle_group: row.muscle_group,
    muscle_group_ar: ARABIC_MUSCLE_GROUPS[row.muscle_group] ?? row.muscle_group,
    equipment: row.equipment,
    equipment_ar: ARABIC_EQUIPMENT[row.equipment] ?? row.equipment,
    instructions: row.instructions ?? [],
    instructions_ar: arabicInstructions(row.name),
  }))

  const output: OutputFile = {
    _draft: 'Arabic names are machine-drafted, unreviewed',
    generatedAt: new Date().toISOString(),
    count: exercises.length,
    exercises,
  }

  const outDir = resolve('build/seo')
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'exercises.json')
  writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n')

  console.log(`Wrote ${exercises.length} exercises to ${outPath}`)
  console.log('Done. The page generator will read this file at build time.')
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
