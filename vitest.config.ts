import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  plugins: [react()],
  // Vitest does not read vite.config.ts, so the version the Settings footer
  // prints has to be declared here too — otherwise every test that renders
  // that screen dies on an undefined global rather than on anything real.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: {
    // Node by default (the import script's transforms run here); component
    // tests opt into jsdom with a `@vitest-environment jsdom` docblock.
    // jsdom 30+ requires an explicit URL to expose localStorage.
    environment: 'node',
    environmentOptions: { jsdom: { url: 'http://localhost' } },
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/**/*.test.{ts,tsx}',
      'packages/*/src/**/*.test.{ts,tsx}',
      'scripts/**/*.test.ts',
      'build/**/*.test.ts',
    ],
  },
})
