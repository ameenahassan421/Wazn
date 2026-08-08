/**
 * The visual-verification run the parity plan §4 requires of every UI phase.
 *
 * Lint sees syntax, typecheck sees types, tests see functions, and none of
 * them can see a screen. Two defects reached production that every check
 * passed over: `inset-block-0`, a Tailwind utility that does not exist, so the
 * signature muscle-balance chart drew nothing for weeks; and a duplicated
 * empty-state sentence. Both were found by looking at pixels.
 *
 * Coverage: five tabs x 390/430px x populated/empty.
 *
 * Two rules, learned by getting them wrong on the first run (DECISIONS.md,
 * 2026-08-07):
 *
 *  1. **Viewport shots, never `fullPage`.** `fullPage` renders position-fixed
 *     elements at the scroll origin, mid-page, and invents overlap bugs that
 *     do not exist — a tab bar "covering" the strength list turned out to have
 *     76px of clearance. Overlap is judged from what the phone actually shows.
 *  2. **Stub every column the real RPC returns**, which is `app-harness.mjs`'s
 *     job — otherwise the harness crashes on its own fixture and the crash
 *     reads as an app defect.
 *
 * Run: `npm run shots`. Images land in `shots/`, which is git-ignored: they
 * are for looking at during a session, not for review in a diff.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  fixtures,
  installSupabaseStub,
  seedSession,
  serveDist,
} from './harness/app-harness.mjs'

const WIDTHS = [390, 430]
const TABS = ['Log', 'History', 'Progress', 'Coach', 'Friends']
const OUT = 'shots'

function build() {
  console.log('building…')
  const out = spawnSync('npx', ['vite', 'build'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_SUPABASE_URL: SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
    },
  })
  if (out.status !== 0) process.exit(out.status ?? 1)
}

async function shoot(browser, origin, { width, empty }) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  await seedSession(context)
  const page = await context.newPage()
  const crashes = []
  page.on('pageerror', (error) => crashes.push(error.message))
  await installSupabaseStub(page, fixtures({ empty }))

  await page.goto(origin, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)

  const state = empty ? 'empty' : 'full'
  for (const tab of TABS) {
    const button = page.getByRole('button', { name: tab, exact: true })
    if (await button.count()) {
      await button.first().click()
      // Lazy chunks plus the screens' own fetches.
      await page.waitForTimeout(1400)
    }
    await page.screenshot({
      path: `${OUT}/${state}-${width}-${tab.toLowerCase()}.png`,
      // Viewport, not fullPage — see the header comment. This is the rule.
      fullPage: false,
    })
  }

  await context.close()
  return crashes
}

async function main() {
  build()
  mkdirSync(OUT, { recursive: true })
  const server = await serveDist('dist')
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
  })
  const crashes = []

  try {
    for (const empty of [false, true]) {
      for (const width of WIDTHS) {
        crashes.push(...(await shoot(browser, server.origin, { width, empty })))
      }
    }
  } finally {
    await browser.close()
    await server.close()
  }

  console.log(`\n${TABS.length * WIDTHS.length * 2} screenshots in ${OUT}/`)
  if (crashes.length) {
    // An uncaught error no longer blanks a tab — U1c's boundaries catch it —
    // so it would otherwise be invisible in a screenshot. Say it out loud.
    console.log(`\n${crashes.length} uncaught page error(s):`)
    for (const c of [...new Set(crashes)]) console.log(`  - ${c}`)
  } else {
    console.log('no uncaught page errors')
  }
  console.log('\nNow LOOK at the images. That is the whole point of this script.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
