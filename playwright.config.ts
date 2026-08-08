import { defineConfig, devices } from '@playwright/test'

/**
 * The smoke run — the only thing in this repo that looks at the app.
 *
 * `docs/INFRASTRUCTURE_AUDIT.md` §5-I4. Three defects reached production in a
 * single day through the gap this closes: `inset-block-0` (four elements at
 * height 0, including a chart the parity plan listed as a differentiator), the
 * follow/like owner column, and progress functions that had never rendered.
 * Lint sees syntax, typecheck sees types, unit tests see functions. None of
 * them can see a screen.
 *
 * Against `vite preview` and the real production bundle, not the dev server:
 * the two defects above were both build-shaped — a Tailwind class that
 * generates no CSS, and code that only runs when a bundle is built.
 *
 * Supabase is stubbed at the network layer, so this needs no project, no key
 * and no egress, and it runs identically in CI and in a sandboxed session.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      // One device, chosen rather than defaulted: a mid-range Android at the
      // narrowest width the layout supports. Wazn is a phone app and a 1280px
      // desktop viewport would pass while the real thing overlapped.
      name: 'pixel-5',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: {
    // `build` then `preview`, so what is tested is what Vercel serves.
    //
    // `--host 127.0.0.1` is explicit rather than left to Vite's default of
    // `localhost`. On a GitHub runner `localhost` can resolve to `::1` first,
    // so the server listens on IPv6 while Playwright polls the IPv4 `url`
    // below and waits out the whole timeout. It works locally either way,
    // which is exactly how this reaches CI unnoticed.
    //
    // `vite preview` directly, not `npm run preview --`, so there is one less
    // layer of argument forwarding between here and the flags.
    command:
      'npm run build && npx vite preview --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    // A cold runner builds from an empty Vite cache; 180s was not enough
    // headroom once `tsc --noEmit` and the PWA plugin were both in front of
    // the server starting.
    timeout: 300_000,
    // Without these, a webServer that fails to start is indistinguishable
    // from one that is merely slow: the log shows a bare "Timed out waiting
    // 180000ms" and nothing else. Piping them is what made this diagnosable
    // rather than guessable.
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      // Placeholder config on purpose, matching the CI build step: without it
      // the app short-circuits on the "not configured" screen and every
      // authenticated screen is tree-shaken out of the bundle.
      VITE_SUPABASE_URL: 'https://ttasiwxeqerhsztxjxip.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'smoke-test-anon-key',
    },
  },
})
