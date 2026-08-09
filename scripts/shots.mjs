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
  offlineSwitch,
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

async function shoot(browser, origin, { width, empty, active }) {
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
  const network = offlineSwitch()
  await installSupabaseStub(page, fixtures({ empty, active }), { network })

  await page.goto(origin, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)

  // The workout overview only exists while a workout is open, and every other
  // fixture workout is finished — so without this pass the screen v2.2 built
  // is never photographed and the §4 rule is met on paper only. Log tab alone:
  // the other four are unchanged by an open workout.
  if (active) {
    await page.screenshot({
      path: `${OUT}/active-${width}-overview.png`,
      fullPage: false,
    })
    // Down the board, because the states that are easiest to get wrong live
    // there: ghost rows, a block with nothing logged in it, and whether the
    // last row clears the tab bar.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(400)
    await page.screenshot({
      path: `${OUT}/active-${width}-overview-end.png`,
      fullPage: false,
    })
    // Commit a ghost for real, against the real build. This is the single most
    // valuable frame in the run: it proves the check writes a set, that the row
    // changes state, and — the part no unit test can see — that the rest timer
    // the commit starts sits above the tab bar without covering a row.
    const checks = page.getByRole('button', { name: /^Log .+ set \d/ })
    if (await checks.count()) {
      await checks.last().click()
      await page.waitForTimeout(700)
      await page.screenshot({
        path: `${OUT}/active-${width}-committed.png`,
        fullPage: false,
      })

      /**
       * E1's rest canvas, which is invisible to every other check in the wall
       * — it is gated on two seconds of NOT being touched, so a test that
       * drives the app can only ever see it by deliberately holding still.
       *
       * The click above is the reach that starts the rest, exactly as a thumb
       * would, so this is the real sequence rather than a staged one. Two
       * frames: the canvas up, then the same board a scroll later, which is
       * the whole "vanishes the moment the user reaches for the next set"
       * rule and the only way to see that it actually vanishes.
       */
      await page.waitForTimeout(2800)
      await page.screenshot({
        path: `${OUT}/active-${width}-restcanvas.png`,
        fullPage: false,
      })
      await page.evaluate(() => window.scrollBy(0, 24))
      await page.waitForTimeout(200)
      await page.screenshot({
        path: `${OUT}/active-${width}-restcanvas-gone.png`,
        fullPage: false,
      })
    }

    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(300)

    /**
     * The dead zone, photographed — U3b's whole surface, and the third time
     * this harness has been caught unable to see a state that shipped. The
     * Coach tab drew "Something broke" in every run for a week because no
     * Edge Function route was stubbed; the overview was invisible because
     * every fixture workout had an `ended_at`. Offline is the same shape of
     * hole: the sync line and the cached stamp exist only when the network
     * is gone, so the network has to actually go.
     */
    network.offline = true
    // A committed set with nowhere to go. The check writes the row on screen
    // and the queue holds it, which is the frame that proves rung 2 looks
    // like nothing at all — no spinner, no banner, just the set.
    const offlineChecks = page.getByRole('button', { name: /^Log .+ set \d/ })
    if (await offlineChecks.count()) {
      await offlineChecks.first().click()
      await page.waitForTimeout(600)
    }
    // Top of the board: the status row is where the sync line lives, and a
    // shot of the middle of the board would photograph everything about this
    // state except the part that is new.
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(300)
    await page.screenshot({
      path: `${OUT}/active-${width}-offline.png`,
      fullPage: false,
    })
    // And the reopen: same phone, same basement, page reloaded. Everything on
    // this screen is read off the device.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(8000)
    await page.screenshot({
      path: `${OUT}/active-${width}-offline-reopen.png`,
      fullPage: false,
    })
    network.offline = false
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(900)

    const menu = page.getByRole('button', { name: /^More for/ })
    if (await menu.count()) {
      await menu.first().click()
      await page.waitForTimeout(300)
      await page.screenshot({
        path: `${OUT}/active-${width}-blockmenu.png`,
        fullPage: false,
      })
      await menu.first().click()
    }
    await context.close()
    return crashes
  }

  // The Hevy import is only reachable from an account with nothing in it —
  // the Welcome screen and the empty Log screen — so the empty pass is the
  // only one that can photograph it. It is gated on having no history on
  // purpose: importing the same export twice would duplicate every workout.
  if (empty) {
    const bring = page.getByRole('button', { name: /Bring your history/ })
    if (await bring.count()) {
      await bring.first().click()
      await page.waitForTimeout(900)
      await page.screenshot({
        path: `${OUT}/empty-${width}-import.png`,
        fullPage: false,
      })
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForTimeout(900)
    }
  }

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

    /*
     * The exercise detail page, reached the only way a user can: tapping a row
     * in Progress > Strength. It had never been photographed, so U4's trend
     * chart, rep ranges and rep-max ladder would all have shipped unseen —
     * the fifth blind spot this harness has produced, and the same shape as
     * the missing Edge Function routes and the missing in-progress workout.
     *
     * Two frames because the page is taller than a phone: the top carries the
     * records and the verdict, and the scrolled frame carries the ladder.
     */
    /*
     * A past workout with its editor open. U4 added five controls in here and
     * every one of them lives behind two taps (expand a workout, then "Edit
     * workout"), so without this the whole surface would be invisible to a
     * screenshot run: the same shape as the exercise detail page, which had
     * never been photographed either.
     */
    if (tab === 'History' && !empty) {
      // The row's accessible name is the date, time and workout name, so it is
      // matched by the one word every fixture session carries.
      const row = page.getByRole('button', { name: /Workout|Upper A|Leg day/ })
      if (await row.count()) {
        await row.first().click()
        await page.waitForTimeout(900)
        const edit = page.getByRole('button', { name: 'Edit workout' })
        if (await edit.count()) {
          await edit.first().click()
          await page.waitForTimeout(600)
          await page.screenshot({
            path: `${OUT}/${state}-${width}-history-editing.png`,
            fullPage: false,
          })
          /*
           * The whole-session actions sit under the set list, which on a real
           * session is longer than a phone screen, so the first frame cannot
           * see them. Anchored on the control rather than a pixel guess: a
           * fixed wheel distance overshot straight past the expanded workout
           * into the collapsed rows below it, and photographed a list.
           */
          const actions = page.getByRole('button', { name: 'Save as routine' })
          if (await actions.count()) await actions.first().scrollIntoViewIfNeeded()
          await page.waitForTimeout(400)
          await page.screenshot({
            path: `${OUT}/${state}-${width}-history-editing-actions.png`,
            fullPage: false,
          })
        }
      }
    }

    if (tab === 'Progress' && !empty) {
      const lift = page.getByRole('button', { name: /Bench Press/i })
      if (await lift.count()) {
        await lift.first().click()
        await page.waitForTimeout(1200)
        await page.screenshot({
          path: `${OUT}/${state}-${width}-exercise.png`,
          fullPage: false,
        })
        await page.mouse.wheel(0, 520)
        await page.waitForTimeout(400)
        await page.screenshot({
          path: `${OUT}/${state}-${width}-exercise-scrolled.png`,
          fullPage: false,
        })
      }
    }
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
    for (const width of WIDTHS) {
      crashes.push(
        ...(await shoot(browser, server.origin, { width, empty: false, active: true })),
      )
    }
  } finally {
    await browser.close()
    await server.close()
  }

  console.log(
    `\n${TABS.length * WIDTHS.length * 2 + WIDTHS.length * 9} screenshots in ${OUT}/`,
  )
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
