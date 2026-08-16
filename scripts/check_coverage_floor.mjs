/**
 * Every logic module must have a test file, or an exemption with a written
 * reason. Since E1 that means BOTH roots: `packages/core/src` and `src/lib`.
 *
 * WHY A LIST AND NOT A PERCENTAGE
 *   `docs/INFRASTRUCTURE_AUDIT.md` §5-I6. The suite is large and green — that
 *   was never in doubt. What nothing reported was *which* modules had no test
 *   at all, and `src/lib/social.ts` was one of them, which is exactly where
 *   follows and likes silently failed for every user for the whole life of
 *   the feature. A coverage percentage would have read as high the entire
 *   time, because the untested module was small and the tested ones were not.
 *
 *   A percentage also rewards the wrong move: adding assertions to code that
 *   already has them. A list only closes when someone writes the missing file.
 *
 * WHY IT FAILS ON UNKNOWN MODULES
 *   A new module under either root lands in neither list, so this fails and
 *   the author has to decide: write the test, or write down why not. That is
 *   the whole mechanism. An exemption is cheap and honest; silence is what
 *   produced the bug.
 *
 * SCOPE
 *   `packages/core/src` and `src/lib`. That is where logic lives. Screens and
 *   components are covered by the Playwright smoke run instead, because what
 *   matters about them is that they render and what they send — not their
 *   internals.
 *
 *   EXEMPT is keyed by PATH, not basename: `supabase.ts` exists under both
 *   roots on purpose, and a basename key would let one entry excuse both.
 *
 *   Run: node scripts/check_coverage_floor.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Both logic roots, since E1 split them.
 *
 * `packages/core/src` holds the platform-free calculation engine; `src/lib`
 * holds what is left, which is the browser-bound layer plus the data access.
 * Scanning only the first would have been the silent failure: modules keep
 * their tests, the directory they live in shrinks, and the floor passes while
 * covering 32 fewer modules than it did the day before.
 */
const LIB_DIRS = ['packages/core/src', 'src/lib'].map((d) => path.join(ROOT, d))

/**
 * Modules that may ship without a test, each with the reason.
 *
 * Keep this short and keep the reasons real. "Hard to test" is not a reason —
 * `social.ts` was hard to test right up until someone wrote a fake client, and
 * the bug it was hiding had been in production for the life of the feature.
 */
const EXEMPT = {
  'packages/core/src/types.ts':
    'Type declarations only — no runtime behaviour to assert.',
  'packages/core/src/supabase.ts':
    'Client construction plus describeError. Constructing it is what every other test mocks away; describeError is exercised through the modules that call it.',
  'packages/core/src/ai.ts':
    'Thin functions.invoke wrappers with no branching beyond error passthrough. The contract they wrap is asserted in the Edge Function tests and the eval harness.',
  'packages/core/src/auth-alias.ts':
    'Thin functions.invoke wrapper. The logic it fronts is server-side in supabase/functions/auth-alias, where identical-response behaviour is the thing worth testing.',
  'packages/core/src/use-auth.ts':
    'A subscription to supabase.auth.onAuthStateChange. Faking the whole auth client to assert a passthrough would test the fake.',
  'src/lib/use-rest-timer.ts':
    'Wall-clock interval hook. Its arithmetic lives in rest.ts, which is tested; what is left is setInterval.',
  'src/lib/use-wake-lock.ts':
    'A guarded navigator.wakeLock call. Absent in jsdom and in most browsers, so the test would assert the fallback path only.',
  'src/lib/share-card.ts':
    'Canvas rendering. jsdom has no canvas; asserting the drawing calls would pin the implementation rather than the image.',
  'packages/core/src/routines.ts':
    'PostgREST query shapes with no client-side branching. The ordering caveat it documents is a database behaviour.',
  'packages/core/src/cache-names.ts':
    'One string constant, shared between vite.config.ts and device-reset.ts so the two cannot disagree. There is no behaviour to assert.',
  'packages/core/src/exercise-taxonomy.ts':
    'Two frozen vocabularies and nothing else. exercise-guess.test.ts asserts against them, which is the only claim they make.',
  'src/lib/supabase.ts':
    'The web adapter: reads import.meta.env and hands the client to the core. Its only branch is the config error, and the seam it feeds is exercised by every module that calls db().',
}

const files = LIB_DIRS.flatMap((dir) =>
  fs
    .readdirSync(dir)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f))
    .sort()
    .map((f) => ({ file: f, dir, shown: `${path.relative(ROOT, dir)}/${f}` })),
)

const missing = []
const unexplained = []
const staleExemptions = []
const seen = new Set()
const duplicates = []

for (const { file, dir, shown } of files) {
  // `supabase.ts` deliberately exists under both roots after E1b: the core
  // holds the client seam, `src/lib` holds the web adapter that feeds it
  // `import.meta.env`. They are different modules that happen to share a
  // basename, which is fine — what is NOT fine is EXEMPT being keyed by
  // basename, because one entry would then silently excuse both. So the key
  // is the path, and a duplicate basename is merely a note.
  if (seen.has(file)) duplicates.push(shown)
  seen.add(file)

  const base = file.replace(/\.(ts|tsx)$/, '')
  const hasTest =
    fs.existsSync(path.join(dir, `${base}.test.ts`)) ||
    fs.existsSync(path.join(dir, `${base}.test.tsx`))

  if (hasTest) {
    if (EXEMPT[shown]) staleExemptions.push(shown)
    continue
  }
  if (EXEMPT[shown]) continue
  // No test, no exemption. Somebody has to choose.
  ;(shown in EXEMPT ? unexplained : missing).push(shown)
}

let failed = false

if (missing.length > 0) {
  failed = true
  console.error('\nLogic modules with no test file and no exemption:\n')
  for (const file of missing) console.error(`  ${file}`)
  console.error(
    '\nWrite the test, or add the file to EXEMPT in scripts/check_coverage_floor.mjs',
  )
  console.error('with a one-line reason. Both are fine; leaving it silent is not.\n')
}

if (unexplained.length > 0) {
  failed = true
  console.error('\nExempt with an empty reason:\n')
  for (const file of unexplained) console.error(`  ${file}`)
}

if (staleExemptions.length > 0) {
  // Not a failure. Someone wrote the test — the exemption is just stale now.
  console.log('\nExemptions that are no longer needed (a test file exists):\n')
  for (const file of staleExemptions) console.log(`  ${file}`)
  console.log('\nRemove them from EXEMPT.\n')
}

if (duplicates.length > 0) {
  // Also not a failure, but worth saying out loud: two modules sharing a
  // basename across the roots is easy to misread in a stack trace.
  console.log(`\nSame basename under both roots: ${duplicates.join(', ')}\n`)
}

if (!failed) {
  const tested = files.length - Object.keys(EXEMPT).length
  console.log(
    `coverage floor: ${tested} of ${files.length} logic modules have tests, ` +
      `${Object.keys(EXEMPT).length} exempt with reasons`,
  )
}

process.exit(failed ? 1 : 0)
