#!/usr/bin/env node
/**
 * Every route a navigation call names must exist on disk.
 *
 * ── WHY THIS IS NOT `typedRoutes` ───────────────────────────────────────────
 * `app.config.ts` sets `experiments.typedRoutes: true`, and that is genuinely
 * useful — in the editor, during `expo start`, where the dev server writes
 * `.expo/types/router.d.ts` and tsc picks it up.
 *
 * It enforces NOTHING in CI. `.expo/` is gitignored and `expo export` does not
 * run the route typegen, so the `.expo/types/**` entry in `tsconfig.json`
 * matches zero files on a fresh checkout. `router.push('/sesion/new')` with a
 * typo typechecks clean and fails at runtime — which is exactly the class of
 * defect typed routes are advertised to prevent, and exactly the claim the
 * config was quietly making without backing it.
 *
 * So this checks the invariant directly, from the filesystem, with no
 * generated artefact to go stale. It is cruder than real typed routes — it
 * cannot check params — but it is honest about what it does and it runs
 * everywhere.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const APP = join(ROOT, 'app')

/** Every file under a directory, recursively. */
function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

/**
 * A route file becomes the path Expo Router serves it at:
 *   app/(tabs)/index.tsx   -> /            (groups vanish, index vanishes)
 *   app/settings.tsx       -> /settings
 *   app/session/[id].tsx   -> /session/:param
 */
function routeOf(file) {
  let p =
    '/' +
    relative(APP, file)
      .replace(/\\/g, '/')
      .replace(/\.[jt]sx?$/, '')
  p = p.replace(/\/\([^/]+\)/g, '') // (tabs) and friends are invisible
  p = p.replace(/\/index$/, '') // index is its parent
  return p === '' ? '/' : p
}

const routeFiles = walk(APP).filter((f) => /\.[jt]sx?$/.test(f))
const routes = routeFiles
  .map(routeOf)
  // `_layout` wraps routes, it is not one, and `+not-found` / `+html` are the
  // router's own conventions rather than anywhere you navigate to on purpose.
  .filter((r) => !r.endsWith('/_layout') && !r.split('/').pop().startsWith('+'))

/** A concrete path matches a route if every segment lines up, treating a
 *  `[param]` segment as a wildcard. */
function matches(target, route) {
  const a = target.split('/')
  const b = route.split('/')
  if (a.length !== b.length) return false
  return b.every((seg, i) =>
    seg.startsWith('[') && seg.endsWith(']') ? a[i] !== '' : seg === a[i],
  )
}

/**
 * Backticks are in the quote class, and they were not until 2026-08-22.
 *
 * `router.push(`/routine/${r.id}`)` is the natural way to navigate to a
 * dynamic route and this regex skipped it entirely — so the ONE form of
 * navigation that actually needs a param, and the one most likely to name a
 * route that does not exist, was the one form nothing checked. A checker that
 * silently ignores a whole syntax reads exactly like a checker that passed.
 *
 * The interpolations themselves are replaced with a placeholder below, since
 * a `[param]` segment matches any non-empty string anyway.
 */
const NAV_RE =
  /(?:router\.(?:push|replace|navigate)|<Link[^>]*\shref=)\s*\(?\s*['"`](\/[^'"`]*)['"`]/g

const problems = []
const sources = [...walk(APP), ...walk(join(ROOT, 'src'))].filter((f) =>
  /\.[jt]sx?$/.test(f),
)

for (const file of sources) {
  const src = readFileSync(file, 'utf8')
  for (const [, target] of src.matchAll(NAV_RE)) {
    // A query string or hash is not part of the route, and `${...}` in a
    // template literal is whatever a `[param]` segment would have matched.
    const path =
      target
        .split(/[?#]/)[0]
        .replace(/\$\{[^}]*\}/g, 'x')
        .replace(/\/$/, '') || '/'
    if (!routes.some((r) => matches(path, r))) {
      problems.push(
        `${relative(ROOT, file)} navigates to "${target}", which is not a route`,
      )
    }
  }
}

if (problems.length > 0) {
  console.error(`\ncheck:routes — ${problems.length} problem(s)\n`)
  for (const p of problems) console.error(`  ✗ ${p}`)
  console.error(`\n  routes on disk: ${routes.sort().join(', ')}\n`)
  process.exit(1)
}

console.log(
  `check:routes ok — every navigation target resolves (${routes.length} routes)`,
)
