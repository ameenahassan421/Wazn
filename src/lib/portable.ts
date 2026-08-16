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
 */

/* ── The arithmetic ──────────────────────────────────────────────────────── */
export * from './epley'
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
export * from './readiness'
export * from './ghost-reason'
export * from './forecast'
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
export * from './active-workout'
export * from './commit'
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
