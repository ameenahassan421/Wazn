/**
 * Match our exercise catalogue to free-exercise-db and download one image each.
 *
 *   npx tsx scripts/match_exercise_images.ts --dry     # report matches, download nothing
 *   npx tsx scripts/match_exercise_images.ts           # download + write image_url
 *
 * Source: https://github.com/yuhonas/free-exercise-db (public domain).
 * Images are copied into public/exercises/, never hotlinked.
 *
 * Deliberately conservative: a wrong image on a lift is worse than no image,
 * because the picker is scanned at a glance mid-workout. Anything below
 * MIN_SCORE stays null and renders as a muscle-group initial tile.
 *
 * Files are written as .jpg on purpose. vite-plugin-pwa precaches
 * `**\/*.{js,css,html,svg,png,ico,woff2}` — putting ~100 images in as .png would
 * pull megabytes into the install and slow first paint on the hot path. .jpg
 * falls outside that glob and loads lazily over the network instead.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import 'dotenv/config'

/**
 * Thumbnail width. Sources are 850x567; the picker renders them small, so
 * shipping the originals meant 7 MB across 110 files at ~63 KB each. This app
 * is aimed at Egyptian mobile data — a picker that pulls a megabyte on open is
 * a real cost to a real user. 240px covers a ~120px slot at 2x.
 */
const THUMB_WIDTH = 240
const THUMB_QUALITY = 72

const DB_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'
const IMG_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises'
const OUT_DIR = 'public/exercises'

/**
 * Below this, leave image_url null rather than guess. Set at 0.60 because
 * everything that landed in the 0.55-0.59 band was wrong on inspection
 * (machine chest fly -> *Leverage Chest Press*, Pendlay row -> *T-Bar Row*).
 */
const MIN_SCORE = 0.6

/**
 * Gym vocabulary that shares no tokens with the source database, so no amount
 * of fuzzy matching reaches it. Keyed by our exact name -> their exact name.
 * Keep this small and obvious; it is a gap-filler, not a mapping layer.
 */
const ALIASES: Record<string, string> = {
  'Chest Fly (Machine)': 'Butterfly',
  'Pendlay Row (Barbell)': 'Bent Over Barbell Row',
  'Triceps Pressdown': 'Triceps Pushdown',
  'Chest Dip': 'Dips - Chest Version',
  'Bicycle Crunch': 'Air Bike',
}

/**
 * Exported so Stage 2B's instruction import can reuse `bestMatch` rather than
 * writing a second matcher. Two matchers would eventually disagree about which
 * free-exercise-db entry an exercise is, and the user would get one lift's
 * photo above another lift's steps. One matcher, both columns.
 */
export interface FreeExercise {
  name: string
  equipment: string | null
  primaryMuscles: string[]
  images: string[]
  instructions?: string[]
}

export interface OurExercise {
  id: string
  name: string
  muscle_group: string
  equipment: string
}

/**
 * Hevy writes "Bench Press (Barbell)"; free-exercise-db writes "Barbell Bench
 * Press - Medium Grip". Reduce both to a token bag.
 *
 * Words that carry no movement meaning. `seated` and `standing` are
 * deliberately NOT here: dropping `seated` let "Seated Cable Row - V Grip"
 * match *Upright Cable Row* at a perfect 1.00, because the only word telling
 * the two apart had been thrown away.
 */
const NOISE = new Set([
  'the',
  'a',
  'with',
  'and',
  'or',
  'to',
  'grip',
  'medium',
  'version',
  'alternate',
  'alternating',
  'exercise',
])

/** Crude singulariser so "Rows" matches "Row". Long enough to skip "abs". */
function stem(t: string): string {
  if (t.length > 3 && t.endsWith('ies')) return `${t.slice(0, -3)}y`
  if (t.length > 3 && t.endsWith('es') && !t.endsWith('ses')) return t.slice(0, -2)
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1)
  return t
}

/**
 * free-exercise-db muscle names -> our muscle_group enum.
 *
 * This gate exists because name similarity alone produced confidently wrong
 * matches: "Back Extension (Machine)" scored 0.56 against *Machine Triceps
 * Extension*, and "Seated Cable Row - V Grip" scored a perfect 1.00 against
 * *Upright Cable Row* — a shoulder movement sitting near the top of the
 * picker. Sharing tokens is not sharing a muscle.
 */
const MUSCLE_MAP: Record<string, string> = {
  chest: 'chest',
  lats: 'back',
  'middle back': 'back',
  'lower back': 'back',
  traps: 'back',
  neck: 'back',
  shoulders: 'shoulders',
  biceps: 'biceps',
  forearms: 'biceps',
  triceps: 'triceps',
  quadriceps: 'quads',
  hamstrings: 'hamstrings',
  glutes: 'glutes',
  adductors: 'quads',
  abductors: 'glutes',
  calves: 'calves',
  abdominals: 'core',
}

/** True when their primary muscles can plausibly serve our muscle_group. */
export function muscleAgrees(ourGroup: string, theirs: FreeExercise): boolean {
  // Cardio has no muscle analogue in the source data; fall back to name only.
  if (ourGroup === 'cardio') return true
  const mapped = theirs.primaryMuscles
    .map((m) => MUSCLE_MAP[m.toLowerCase()])
    .filter(Boolean)
  if (mapped.length === 0) return false
  return mapped.includes(ourGroup)
}

const EQUIP_ALIASES: Record<string, string[]> = {
  barbell: ['barbell', 'ez curl bar', 'olympic barbell', 'trap bar'],
  dumbbell: ['dumbbell'],
  machine: ['machine', 'leverage machine', 'sled machine'],
  cable: ['cable'],
  bodyweight: ['body only', 'none'],
  kettlebell: ['kettlebell'],
  band: ['bands', 'exercise ball', 'medicine ball', 'foam roll'],
  other: [],
}

export function tokens(raw: string): Set<string> {
  return new Set(
    raw
      .toLowerCase()
      .replace(/\(.*?\)/g, ' ')
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1 && !NOISE.has(t))
      .map(stem),
  )
}

/** Equipment named in the Hevy parenthetical, e.g. "(Barbell)" -> barbell. */
export function parenEquipment(name: string): string | null {
  const m = /\(([^)]+)\)\s*$/.exec(name)
  return m ? m[1].toLowerCase().trim() : null
}

/** Jaccard over name tokens, nudged by equipment agreement. */
export function score(ours: OurExercise, theirs: FreeExercise): number {
  const a = tokens(ours.name)
  const b = tokens(theirs.name)
  if (a.size === 0 || b.size === 0) return 0

  let shared = 0
  for (const t of a) if (b.has(t)) shared += 1
  const jaccard = shared / (a.size + b.size - shared)

  // Every one of our tokens present in theirs is a strong signal even when
  // their name carries extra qualifiers ("- Medium Grip", "Version 2").
  const coverage = shared / a.size

  let s = 0.55 * coverage + 0.45 * jaccard

  const want = EQUIP_ALIASES[ours.equipment] ?? []
  const got = (theirs.equipment ?? '').toLowerCase()
  if (want.length > 0) {
    if (want.includes(got)) s += 0.12
    else if (got) s -= 0.1
  }
  const paren = parenEquipment(ours.name)
  if (paren && got && (got.includes(paren) || paren.includes(got))) s += 0.05

  return Math.max(0, Math.min(1, s))
}

export function bestMatch(
  ours: OurExercise,
  pool: FreeExercise[],
): { hit: FreeExercise; score: number } | null {
  const alias = ALIASES[ours.name]
  if (alias) {
    const exact = pool.find((t) => t.name === alias)
    if (exact) return { hit: exact, score: 1 }
  }

  let hit: FreeExercise | null = null
  let best = 0
  for (const t of pool) {
    if (!muscleAgrees(ours.muscle_group, t)) continue
    const s = score(ours, t)
    if (s > best) {
      best = s
      hit = t
    }
  }
  return hit && best >= MIN_SCORE ? { hit, score: best } : null
}

async function main() {
  const dry = process.argv.includes('--dry')

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
    process.exit(1)
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const { data: ours, error } = await supabase
    .from('exercises')
    .select('id,name,muscle_group,equipment')
    .order('name')
  if (error) {
    console.error(`Reading exercises failed — ${error.message}`)
    process.exit(1)
  }

  const pool: FreeExercise[] = await fetch(DB_URL).then((r) => r.json())
  console.log(`ours: ${ours.length}   free-exercise-db: ${pool.length}`)

  if (!dry) mkdirSync(resolve(OUT_DIR), { recursive: true })

  const matched: { id: string; name: string; image_url: string; score: number }[] = []
  const unmatched: string[] = []

  for (const ex of ours as OurExercise[]) {
    const m = bestMatch(ex, pool)
    if (!m || m.hit.images.length === 0) {
      unmatched.push(ex.name)
      continue
    }
    const slug = ex.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    const file = `${slug}.jpg`
    const dest = resolve(OUT_DIR, file)

    if (!dry && !existsSync(dest)) {
      const res = await fetch(`${IMG_BASE}/${m.hit.images[0]}`)
      if (!res.ok) {
        unmatched.push(ex.name)
        continue
      }
      const thumb = await sharp(Buffer.from(await res.arrayBuffer()))
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: THUMB_QUALITY, progressive: true, mozjpeg: true })
        .toBuffer()
      writeFileSync(dest, thumb)
    }
    matched.push({
      id: ex.id,
      name: ex.name,
      image_url: `/exercises/${file}`,
      score: m.score,
    })
  }

  console.log(`\nmatched: ${matched.length}   unmatched: ${unmatched.length}`)

  // A wrong thumbnail is worse than none — the picker is scanned at a glance.
  // --explain prints what each name actually resolved to so matches can be
  // eyeballed before they ship.
  if (process.argv.includes('--explain')) {
    console.log('\nname -> free-exercise-db match:')
    for (const ex of ours as OurExercise[]) {
      const m = bestMatch(ex, pool)
      console.log(
        `  ${ex.name.padEnd(42)} ${m ? `${m.score.toFixed(2)}  ${m.hit.name}` : 'none (initial tile)'}`,
      )
    }
  }

  for (const m of [...matched].sort((a, b) => a.score - b.score).slice(0, 10)) {
    console.log(`  weakest  ${m.score.toFixed(2)}  ${m.name}`)
  }
  console.log('\nunmatched (render as initial tile):')
  for (const n of unmatched) console.log(`  ${n}`)

  if (dry) {
    console.log('\n--dry: nothing written')
    return
  }

  for (const m of matched) {
    const { error: upErr } = await supabase
      .from('exercises')
      .update({ image_url: m.image_url })
      .eq('id', m.id)
    if (upErr) console.error(`  update failed for ${m.name} — ${upErr.message}`)
  }
  console.log(`\nwrote image_url for ${matched.length} exercises`)
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isDirectRun) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
}
