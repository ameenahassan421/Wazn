import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The guard behind `portable.ts`.
 *
 * `portable.ts` is the only door between the web app and the native app, and
 * a module that walks through it has to run under Metro with no DOM. This
 * asserts that by walking the import graph rather than by reading the code,
 * because the failure this exists to catch is not visible in the code: a
 * module reads perfectly pure and then imports one that reads `localStorage`
 * three hops down. `offline-store` is exactly that shape.
 *
 * The web app never runs this check on itself — it has a DOM, so a browser
 * global there is not a bug. This is a check on ONE list.
 */

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Globals that do not exist in a React Native runtime.
 *
 * `fetch`, `URL`, `console`, `setTimeout` and `crypto` are all present in
 * Hermes and are deliberately absent from this list. So is `AbortController`.
 * The line is "does Hermes have it", not "does it sound web-ish".
 */
const BROWSER_GLOBALS = [
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'navigator',
  'indexedDB',
  'caches',
  'matchMedia',
  'HTMLElement',
  'IDBDatabase',
  'CacheStorage',
  'requestAnimationFrame',
  'addEventListener',
  'ServiceWorker',
] as const

const GLOBAL_RE = new RegExp(`\\b(${BROWSER_GLOBALS.join('|')})\\b`, 'g')

/**
 * Comments and string literals are stripped before the scan.
 *
 * Not cosmetic: the first version of this check reported 26 impure modules
 * and 18 of them were the WORD "window" inside a sentence — "the rep window",
 * "the time window a Progress block is showing". A scan that reads prose is a
 * scan that gets ignored, and one that gets ignored is worse than none.
 */
function stripCommentsAndStrings(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}

function sourceOf(mod: string): string | null {
  for (const ext of ['.ts', '.tsx']) {
    try {
      return readFileSync(join(HERE, mod + ext), 'utf8')
    } catch {
      /* try the next extension */
    }
  }
  return null
}

/** Relative imports only — a package import is resolved by Metro, not by us. */
function localImports(src: string): string[] {
  const out = new Set<string>()
  for (const [, spec] of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    out.add(spec.replace(/^\.\//, ''))
  }
  for (const [, spec] of src.matchAll(/import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    out.add(spec.replace(/^\.\//, ''))
  }
  return [...out]
}

/** The first browser global reachable from `mod`, as a readable chain. */
function firstImpurity(mod: string, seen = new Set<string>()): string | null {
  if (seen.has(mod)) return null
  seen.add(mod)

  const raw = sourceOf(mod)
  if (raw === null) return null

  const code = stripCommentsAndStrings(raw)

  const hits = [...new Set(code.match(GLOBAL_RE) ?? [])]
  if (hits.length > 0) return `${mod} uses ${hits.join(', ')}`
  if (code.includes('import.meta')) return `${mod} uses import.meta`

  for (const dep of localImports(raw)) {
    const deeper = firstImpurity(dep, seen)
    if (deeper !== null) return `${mod} → ${deeper}`
  }
  return null
}

describe('portable.ts — the shared domain', () => {
  const barrel = readFileSync(join(HERE, 'portable.ts'), 'utf8')
  const exported = localImports(barrel)

  it('re-exports something', () => {
    // A barrel that silently became empty would make every assertion below
    // vacuously true, which is the failure mode this project keeps meeting.
    expect(exported.length).toBeGreaterThan(20)
  })

  it.each(exported)('%s reaches no browser global, transitively', (mod) => {
    expect(firstImpurity(mod)).toBeNull()
  })

  it('names every module it exports', () => {
    // Guards the reverse mistake: an `export *` whose file was deleted or
    // renamed. `sourceOf` returning null makes `firstImpurity` pass, so
    // without this a typo'd path would look clean rather than missing.
    for (const mod of exported) {
      expect(
        sourceOf(mod),
        `portable.ts exports './${mod}', which does not exist`,
      ).not.toBeNull()
    }
  })

  it('depends on no external package at all — it is pure TypeScript', () => {
    /**
     * The failure this exists for actually happened, on the first CI run of
     * the mobile job — and the answer was to REMOVE the offending module
     * rather than teach the toolchain to find its dependency.
     *
     * `active-workout` imports `useSyncExternalStore` from `react`. The local
     * typecheck passed — but for the WRONG REASON: tsc resolves a bare import
     * by walking up from the importing file, and `src/lib/../../node_modules`
     * is the web app's, which has React 18 sitting right there. In CI the
     * mobile job installs only `mobile/`, that directory does not exist, and
     * the same file failed with TS2307.
     *
     * Mapping `react` in `mobile/tsconfig.json` looked like the fix and was
     * worse than the bug: Expo's Metro config reads tsconfig `paths` too, so
     * pointing `react` at `@types/react` satisfied tsc and broke the bundle.
     *
     * `active-workout` exports a hook, which the barrel's own rule already
     * calls the adapter layer, so it moved to that list. The closure now
     * needs nothing but TypeScript — a contract no resolution quirk on any
     * platform can break. An empty list, asserted, is what keeps it that
     * way: the next module that brings a dependency fails here, at home,
     * instead of in CI.
     */
    const seen = new Set<string>()
    const packages = new Set<string>()

    const walk = (mod: string) => {
      if (seen.has(mod)) return
      seen.add(mod)
      const src = sourceOf(mod)
      if (src === null) return
      for (const [, spec] of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        if (spec.startsWith('.')) walk(spec.replace(/^\.\//, ''))
        // `node:` builtins would be a real problem on Hermes and there are
        // none; if one appears it shows up here as a package and fails.
        else packages.add(spec)
      }
    }
    exported.forEach(walk)

    expect([...packages].sort()).toEqual([])
  })

  it('does not export the adapter layer', () => {
    // These have native counterparts by design (mobile/src/services and
    // mobile/src/hooks). Sharing one would mean pretending a keychain and
    // localStorage are the same thing.
    const adapters = [
      'supabase',
      // Exports `useActiveWorkout`. A hook is an adapter by this file's own
      // rule, and sharing it dragged `react` into the closure.
      'active-workout',
      'use-auth',
      'checkpoint',
      'idb',
      'offline-store',
      'theme-context',
      'unit-context',
      'locale-context',
      'coach-context',
      'use-back',
      'use-online',
      'use-rest-timer',
      'use-wake-lock',
      'use-modal',
      'use-idle',
      'share-card',
      'lazy-screen',
      'device-reset',
      'report-error',
      'invite',
    ]
    for (const a of adapters) {
      expect(
        exported,
        `${a} is platform-specific and must not be shared`,
      ).not.toContain(a)
    }
  })

  it('leaves no portable module stranded outside the barrel', () => {
    /**
     * The opposite failure, and the one that creeps: a genuinely pure module
     * is written, the native app needs it, and it gets copied into `mobile/`
     * instead of added here. That is how two Epleys happen. This does not
     * force every pure module into the barrel — plenty have no native use —
     * it just prints them, and fails only if the list grows past what was
     * true when this was written, so the next person has to look.
     */
    const all = readdirSync(HERE)
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))
      .map((f) => f.replace(/\.tsx?$/, ''))

    const stranded = all
      .filter((m) => m !== 'portable' && !exported.includes(m))
      .filter((m) => firstImpurity(m) === null)

    expect(
      stranded.sort(),
      'these are pure and unshared — add them to portable.ts or leave them ' +
        'deliberately, but update this list either way',
    ).toEqual([
      // Exports a hook — see the adapter list above.
      'active-workout',
      // Service-worker cache names. A web-only concept — there is no
      // Cache API on native, and the offline story there is the queue.
      'cache-names',
    ])
  })
})

/** Sanity: the scanner itself. A checker nobody has tested is a checker. */
describe('the purity scanner', () => {
  it('ignores the word "window" in prose', () => {
    const prose = `/** The rep window ghosts ladder within. */\nexport const a = 1\n`
    expect(GLOBAL_RE.test(stripCommentsAndStrings(prose))).toBe(false)
  })

  it('still catches a real use', () => {
    const real = `export const w = () => window.innerWidth\n`
    expect(stripCommentsAndStrings(real)).toMatch(/\bwindow\b/)
  })

  it('resolves the modules it is pointed at', () => {
    expect(sourceOf('epley')).toContain('estimatedOneRepMax')
    expect(sourceOf('no-such-module')).toBeNull()
  })
})
