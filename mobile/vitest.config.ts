import path from 'node:path'

import { defineConfig } from 'vitest/config'

/**
 * A test runner for the native app, sharing the web app's runner but not its
 * config.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * `mobile/` shipped 3,768 lines with no way to assert any of them. Its CI job
 * typechecks, lints, checks routes and bundles for both platforms, and not one
 * of those can see a wrong reducer: `bankCurrentSet` sent a hardcoded
 * `'normal'` to `workout_sets` for every set including warm-ups, which is a
 * permanent data defect in the lifter's own history, and every gate was green
 * the whole time.
 *
 * ── THE ALIASES ARE NOT A CONVENIENCE ───────────────────────────────────────
 * They are a correctness requirement. Metro resolves `@wazn/domain` to
 * `../src/lib` (see `metro.config.js`) and `@/` to `mobile/src` (see
 * `tsconfig.json`). If this file resolved either differently, the tests would
 * import a different module than the app does and pass against code nobody
 * ships. The three mappings below mirror `tsconfig.json`'s `paths` exactly,
 * and the exact-match `@wazn/domain` entry has to come first: the barrel is a
 * FILE, `@wazn/domain/*` is a directory, and a single loose prefix rule would
 * turn the former into `../src/lib` and fail to resolve.
 */
const projectRoot = __dirname
const domainRoot = path.resolve(projectRoot, '../src/lib')

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@wazn\/domain$/, replacement: path.join(domainRoot, 'portable.ts') },
      { find: /^@wazn\/domain\//, replacement: `${domainRoot}/` },
      { find: /^@\/assets\//, replacement: `${path.resolve(projectRoot, 'assets')}/` },
      { find: /^@\//, replacement: `${path.resolve(projectRoot, 'src')}/` },
    ],
  },
  test: {
    // Scoped to `src` on purpose: `.expo-export/` holds a bundled copy of this
    // same source after `npm run bundle:ios`, and an unscoped glob would run it.
    // `.tsx` and `app/` included deliberately. The first version of this glob
    // was `src/**/*.test.ts` and would have silently collected ZERO component
    // tests: a suite that runs and finds nothing looks exactly like a suite
    // that runs and passes. Kept scoped to `src/` and `app/` rather than
    // widened to the package root, because `.expo-export*/` holds a bundled
    // copy of this source.
    include: ['src/**/*.test.{ts,tsx}', 'app/**/*.test.{ts,tsx}'],
  },
})
