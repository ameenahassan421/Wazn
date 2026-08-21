/**
 * The shared domain — everything both the web PWA and the native app run.
 *
 * ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
 * `mobile/` resolves `@wazn/domain` to this file (see `mobile/metro.config.js`
 * and `mobile/tsconfig.json`). It is the ONLY door between the two apps, and
 * it exists so the door is a decision rather than an accident: a native screen
 * cannot reach `../../src/lib/whatever` by hand, so nothing gets shared
 * without appearing here first.
 *
 * ── WHAT IS ALLOWED THROUGH ─────────────────────────────────────────────────
 * Modules whose TRANSITIVE import graph touches no browser global and no
 * `import.meta`. Not "modules that look pure" — `portable.test.ts` walks the
 * graph and fails if a module in this barrel reaches one, however indirectly.
 * That guard is the point: `offline-store` reads pure until you notice it
 * imports `checkpoint`, which reads `localStorage`.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
 * Everything that talks to Supabase — `coach`, `social`, `exercises`,
 * `routines`, `body-store`, `use-auth`. Not because they are impure by
 * accident, but because they SHOULD differ: the web client keeps its session
 * in `localStorage` and the native client keeps it in the system keychain, and
 * a shared client would have to pretend those are the same thing. The rule
 * this file encodes is domain shared, I/O adapted.
 *
 * Also absent: the React contexts and the `use-*` hooks. They are small, they
 * are the adapter layer by definition, and `mobile/src/hooks` reimplements
 * each against native APIs.
 *
 * ── THE BARREL IS PURE TYPESCRIPT: ZERO EXTERNAL PACKAGES ───────────────────
 * Not even `react`. `portable.test.ts` asserts it, and the reason is a real
 * failure rather than a principle invented afterwards.
 *
 * `active-workout` was in this list. It exports `useActiveWorkout`, built on
 * `useSyncExternalStore`, so it imports `react` — and that typechecked
 * locally for the WRONG REASON: tsc resolves a bare import by walking up from
 * the importing file, and `src/lib/../../node_modules` is the web app's,
 * which has React 18 sitting right there. CI installs only `mobile/`, so the
 * same file failed with TS2307 on the first run of the mobile job.
 *
 * The obvious patch — mapping `react` in `mobile/tsconfig.json` — is worse
 * than the bug: Expo's Metro config reads tsconfig `paths` too, so pointing
 * `react` at `@types/react` fixed tsc and broke the bundle outright.
 *
 * The actual fix was to apply the rule already written above. A module that
 * exports a hook IS the adapter layer, so `active-workout` belongs with the
 * others — and with it gone the shared closure needs nothing but TypeScript,
 * which is a contract that cannot be broken by a resolution quirk on any
 * platform.
 */

/* ── The arithmetic ──────────────────────────────────────────────────────── */
export * from './epley'
export * from './last-session'
export * from './errors'
export * from './spark'
export * from './units'
export * from './format'
export * from './plates'
export * from './warmup'
export * from './supersets'
export * from './variations'

/* ── The coach's deterministic engine ─────────────────────────────────────
   Every number the coach says comes from one of these. The model only ever
   phrases; nothing here asks a network a question. */
export * from './coach-mode'
/**
 * The SKELETONS, not the reads. `coach.ts` builds a browser Supabase client,
 * so it can never come through this door; `coach-lines.ts` is the half that
 * turns `session_brief()` / `session_debrief()` output into a sentence, and
 * both apps run exactly that one. What differs is which client fetched the
 * block, which is the rule this barrel exists to state.
 */
export * from './coach-lines'
export * from './readiness'
export * from './ghost-reason'
export * from './forecast'
export * from './rest'
export * from './rest-canvas'
export * from './tell-coach'
export * from './streak'
export * from './summary'
export * from './progress'
export * from './plan'
export * from './rotation'
export * from './body'

/* ── Session state and the write path ─────────────────────────────────────
   `write-queue` is the offline queue's arithmetic — what to retry, what
   counts as landed, what a discard drops. It is pure: the storage it runs
   against is injected, which is what lets the native app hand it SQLite
   where the web app hands it IndexedDB. */
export * from './commit'
export * from './live-board'
export * from './write-queue'
export * from './history-edit'

/* ── Catalogue, search and import ─────────────────────────────────────────── */
export * from './exercise-filter'
export * from './exercise-guess'
export * from './csv'
/**
 * Namespaced, not flattened. `hevy-import` exports its own `PlannedSet` — a
 * row shape read out of somebody else's CSV — and `plan.ts` exports the app's
 * `PlannedSet`, which is what the board draws. They are not the same idea and
 * neither name is wrong, so the import path keeps its own scope.
 */
export * as hevy from './hevy-import'

/* ── Presentation-adjacent, still pure ───────────────────────────────────── */
export * from './range'
export * from './i18n'
export * from './auth-identity'
export * from './tokens'
export type * from './types'
