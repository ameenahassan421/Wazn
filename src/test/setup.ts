import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

// Tests run without global APIs, so Testing Library's auto-cleanup never
// registers itself and rendered trees would pile up in the same document.
// Node-environment files (the import script's transforms) skip this.
if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react')
  afterEach(cleanup)
}
