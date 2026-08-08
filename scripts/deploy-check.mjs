/**
 * Does a deploy break the app for someone who already has it open?
 *
 * It did, for weeks, and nothing in the CI wall could see it. Progress, Coach
 * and Friends — the three `React.lazy` tabs, and only those three — rendered
 * "Something broke" after every push to `main`, while Log and History were
 * fine because they live in the main chunk. The mechanism:
 *
 *   1. A page is open holding `index-<oldhash>.js`.
 *   2. A deploy lands. Vercel's production alias serves only the current
 *      build, so `ProgressScreen-<oldhash>.js` becomes a 404.
 *   3. `autoUpdate`'s `skipWaiting` + `clientsClaim` hand the running page to
 *      the new service worker, whose precache no longer lists the old hashes.
 *   4. The user taps Progress. The import fails, and because a failed module
 *      is remembered as failed, "Try again" cannot recover it.
 *
 * Two fixes hold it shut, and this checks both at once: `vite.config.ts` stops
 * a new worker claiming a live page, and `src/lib/lazy-screen.ts` reloads once
 * if an import fails anyway. Unit tests cover the second; only a browser with
 * a real service worker covers the first.
 *
 * Run: `npm run check:deploy`. Exits non-zero if a tab breaks.
 */
import { cp, rm, mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { chromium } from '@playwright/test'
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  fixtures,
  installSupabaseStub,
  seedSession,
  serveDist,
} from './harness/app-harness.mjs'

const LAZY_TABS = ['Progress', 'Coach', 'Friends']
const CURRENT = '.deploy-check/current'
const NEXT = '.deploy-check/next'
const SERVE = '.deploy-check/serve'

function build(outDir, config) {
  const args = ['vite', 'build', '--outDir', outDir, '--emptyOutDir']
  if (config) args.push('--config', config)
  const out = spawnSync('npx', args, {
    stdio: 'ignore',
    env: {
      ...process.env,
      VITE_SUPABASE_URL: SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
    },
  })
  if (out.status !== 0) {
    console.error(`build failed for ${outDir}`)
    process.exit(out.status ?? 1)
  }
}

async function main() {
  await rm('.deploy-check', { recursive: true, force: true })
  console.log('building the deployed version…')
  build(CURRENT)
  // Same source, different filenames — which is all a redeploy is, to a page
  // that is already running. See build/vite.config.rehash.ts.
  console.log('building the next deploy…')
  build(NEXT, 'build/vite.config.rehash.ts')

  await mkdir(SERVE, { recursive: true })
  await cp(CURRENT, SERVE, { recursive: true })

  const server = await serveDist(SERVE)
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
  })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await seedSession(context)
  const page = await context.newPage()
  const failures = []
  page.on('console', (message) => {
    if (/dynamically imported module/i.test(message.text())) {
      failures.push(message.text())
    }
  })
  await installSupabaseStub(page, fixtures({}))

  await page.goto(server.origin, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, {
    timeout: 20000,
  })
  console.log('page open, service worker in control')

  // The deploy. The old build's assets stop existing, exactly as they do on a
  // Vercel alias, while the page keeps running the code it already loaded.
  await rm(SERVE, { recursive: true, force: true })
  await cp(NEXT, SERVE, { recursive: true })
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    await registration.update()
  })
  await page.waitForTimeout(3000)
  console.log('deployed over it, service worker updated\n')

  const broken = []
  for (const tab of LAZY_TABS) {
    await page.getByRole('button', { name: tab, exact: true }).first().click()
    await page.waitForTimeout(2000)
    const boundary = await page.getByText('Something broke').count()
    console.log(`  ${tab.padEnd(9)} ${boundary ? 'BROKE' : 'ok'}`)
    if (boundary) broken.push(tab)
  }

  await browser.close()
  await server.close()
  await rm('.deploy-check', { recursive: true, force: true })

  if (broken.length) {
    console.error(
      `\nFAIL — ${broken.join(', ')} died on a deploy. Check skipWaiting/clientsClaim ` +
        'in vite.config.ts and lazyScreen in src/lib/lazy-screen.ts.',
    )
    process.exit(1)
  }
  console.log('\nPASS — an open page survives a deploy.')
  if (failures.length) {
    console.log(
      `(${failures.length} import failure(s) recovered by reload, as designed)`,
    )
  }
}

await main()
