import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

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
