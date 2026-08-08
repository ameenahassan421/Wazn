/**
 * Type shims that let `tsc` and vitest reach the Edge Function modules.
 *
 * WHY THIS EXISTS
 *   `supabase/functions/**` is Deno code: it reads `Deno.env` and imports over
 *   https. Historically that meant only the three *pure* `_shared` modules
 *   could be reached from the vitest suite, and everything with a runtime
 *   dependency — `context.ts`, `openrouter.ts`, the tool loop — had no tests
 *   and no typecheck at all (`docs/INFRASTRUCTURE_AUDIT.md` §5-I1).
 *
 *   Two declarations remove that wall. The tool loop's bounds and the stat
 *   tools' argument validation are now ordinary unit tests, with no network
 *   and no Deno binary.
 *
 * WHAT IT DOES NOT DO
 *   It does not make `tsc` an authority on this code. `deno check` is, and it
 *   runs in CI over the same files with the real module graph. These are
 *   declarations, not implementations: they say what the shapes are so the
 *   test suite can compile, and nothing more.
 *
 * THE ONE RISK, NAMED
 *   Declaring `Deno` globally means app code under `src/` would typecheck if
 *   it referenced `Deno`, and then fail in a browser. Nothing does, and there
 *   is no reason for anything to — but if that ever becomes a real hazard, the
 *   fix is a second tsconfig for the test files rather than deleting these.
 */

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

/**
 * The Edge Functions import supabase-js from esm.sh, the way Deno does. The
 * same library is a devDependency here, so the shim re-exports the real types
 * rather than widening anything to `any`.
 */
declare module 'https://esm.sh/@supabase/supabase-js@2.45.4' {
  export * from '@supabase/supabase-js'
}
