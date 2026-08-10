import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // Node by default (the import script's transforms run here); component
    // tests opt into jsdom with a `@vitest-environment jsdom` docblock.
    // jsdom 30+ requires an explicit URL to expose localStorage.
    environment: 'node',
    environmentOptions: { jsdom: { url: 'http://localhost' } },
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', 'build/**/*.test.ts'],
  },
})
