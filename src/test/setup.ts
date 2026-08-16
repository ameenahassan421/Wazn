import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { initSupabase } from '@wazn/core/supabase'

/**
 * The default client for tests that never asked for one.
 *
 * E1b made the core's client an injected dependency rather than a module-scope
 * singleton, so something has to inject it. Before that split, a component
 * test mocking `../lib/supabase` covered every data path it touched, because
 * everything went through that one module. Core modules now call `db()` and
 * bypass that mock, so this restores what those tests already assumed: no
 * rows, no error.
 *
 * It answers empty rather than throwing on purpose. Tests that care about a
 * query mock it explicitly and override this; the ones that land here are
 * rendering a screen and expecting its empty state, which is exactly what an
 * empty result produces. A throwing default would fail them on plumbing.
 */
function emptyClient(): SupabaseClient {
  const rows = { data: [], error: null }
  const one = { data: null, error: null }
  const chain: Record<string, unknown> = {
    then: (resolve: (v: typeof rows) => unknown) => Promise.resolve(rows).then(resolve),
    single: () => Promise.resolve(one),
    maybeSingle: () => Promise.resolve(one),
  }
  for (const verb of [
    'select',
    'insert',
    'update',
    'upsert',
    'delete',
    'eq',
    'neq',
    'in',
    'is',
    'gt',
    'gte',
    'lt',
    'lte',
    'like',
    'ilike',
    'or',
    'not',
    'order',
    'limit',
    'range',
  ]) {
    chain[verb] = () => chain
  }
  return {
    from: () => chain,
    rpc: () => Promise.resolve(rows),
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  } as unknown as SupabaseClient
}

initSupabase(emptyClient())

// Tests run without global APIs, so Testing Library's auto-cleanup never
// registers itself and rendered trees would pile up in the same document.
// Node-environment files (the import script's transforms) skip this.
if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react')
  afterEach(cleanup)
}

// jsdom 30 + vitest's VM context does not transfer localStorage/sessionStorage
// from the JSDOM instance to the test's globalThis. Provide an in-memory
// polyfill so component tests that call localStorage.clear() in beforeEach
// do not blow up. Tests that need real browser storage semantics (IndexedDB,
// etc.) are outside this project's current scope.
function makeStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v))
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => store.clear(),
    get length() {
      return store.size
    },
    key: (i: number) => [...store.keys()][i] ?? null,
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: makeStorage(),
    configurable: true,
  })
}
if (typeof globalThis.sessionStorage === 'undefined') {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: makeStorage(),
    configurable: true,
  })
}
