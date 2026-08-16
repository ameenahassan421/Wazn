/**
 * The visual-verification run the parity plan §4 requires of every UI phase.
 *
 * Lint sees syntax, typecheck sees types, tests see functions, and none of
 * them can see a screen. Two defects reached production that every check
 * passed over: `inset-block-0`, a Tailwind utility that does not exist, so the
 * signature muscle-balance chart drew nothing for weeks; and a duplicated
 * empty-state sentence. Both were found by looking at pixels.
 *
 * Coverage: five tabs x 390/430px x populated/empty, an open workout at both
 * widths, and an Arabic pass at 390 for both states. `shots/` is wiped at the
 * start of every run, because frames left over from another branch get read as
 * current output — see the note on `rmSync` in `main`.
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
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
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

async function shoot(browser, origin, { width, empty, active, locale }) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  await seedSession(context)
  // Arabic, before the first paint. `LocaleProvider` reads this key as its
  // optimistic cache, so seeding it is what makes the cold start render RTL —
  // toggling in the UI after load would photograph a flipped layout that had
  // already been laid out once in LTR.
  if (locale === 'ar') {
    await context.addInitScript(() => {
      window.localStorage.setItem('workout.locale', 'ar')
    })
  }
  const page = await context.newPage()
  const crashes = []
  page.on('pageerror', (error) => crashes.push(error.message))
  // Arabic frames are prefixed so an EN and an AR run of the same state never
  // overwrite each other.
  const prefix = locale === 'ar' ? 'ar-' : ''
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
      path: `${OUT}/${prefix}active-${width}-overview.png`,
      fullPage: false,
    })
    // Down the board, because the states that are easiest to get wrong live
    // there: ghost rows, a block with nothing logged in it, and whether the
    // last row clears the tab bar.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(400)
    await page.screenshot({
      path: `${OUT}/${prefix}active-${width}-overview-end.png`,
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
        path: `${OUT}/${prefix}active-${width}-committed.png`,
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
        path: `${OUT}/${prefix}active-${width}-restcanvas.png`,
        fullPage: false,
      })
      await page.evaluate(() => window.scrollBy(0, 24))
      await page.waitForTimeout(200)
      await page.screenshot({
        path: `${OUT}/${prefix}active-${width}-restcanvas-gone.png`,
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
      path: `${OUT}/${prefix}active-${width}-offline.png`,
      fullPage: false,
    })
    // And the reopen: same phone, same basement, page reloaded. Everything on
    // this screen is read off the device.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(8000)
    await page.screenshot({
      path: `${OUT}/${prefix}active-${width}-offline-reopen.png`,
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
        path: `${OUT}/${prefix}active-${width}-blockmenu.png`,
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
        path: `${OUT}/${prefix}empty-${width}-import.png`,
        fullPage: false,
      })
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForTimeout(900)
    }
  }

  const state = empty ? 'empty' : 'full'
  for (const [i, tab] of TABS.entries()) {
    // Under Arabic every accessible name is Arabic, so an English name matches
    // nothing and the guard below silently photographs the Log tab five times
    // under five different filenames. Position in the nav is the locale-proof
    // selector, and TABS is in the tab bar's own order.
    const button =
      locale === 'ar'
        ? page.locator('nav button').nth(i)
        : page.getByRole('button', { name: tab, exact: true })
    if (await button.count()) {
      await button.first().click()
      // Lazy chunks plus the screens' own fetches.
      await page.waitForTimeout(1400)
    }
    await page.screenshot({
      path: `${OUT}/${prefix}${state}-${width}-${tab.toLowerCase()}.png`,
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
            path: `${OUT}/${prefix}${state}-${width}-history-editing.png`,
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
            path: `${OUT}/${prefix}${state}-${width}-history-editing-actions.png`,
            fullPage: false,
          })
        }
      }
    }

    /*
     * The custom exercise's own page with its editor open. Edit, Archive and
     * Delete are gated on `is_custom`, so without a custom lift in the fixture
     * and a click to reveal them, that whole surface goes unphotographed.
     */
    if (tab === 'Progress' && !empty) {
      const custom = page.getByRole('button', { name: /Hack Squat/i })
      if (await custom.count()) {
        await custom.first().click()
        await page.waitForTimeout(1000)
        const editBtn = page.getByRole('button', { name: 'Edit', exact: true })
        if (await editBtn.count()) {
          await editBtn.first().click()
          await page.waitForTimeout(500)
          const save = page.getByRole('button', { name: 'Save', exact: true })
          if (await save.count()) await save.first().scrollIntoViewIfNeeded()
          await page.waitForTimeout(300)
          await page.screenshot({
            path: `${OUT}/${prefix}${state}-${width}-custom-exercise.png`,
            fullPage: false,
          })
        }
        await page.goBack()
        await page.waitForTimeout(800)
      }
    }

    if (tab === 'Progress' && !empty) {
      const lift = page.getByRole('button', { name: /Bench Press/i })
      if (await lift.count()) {
        await lift.first().click()
        await page.waitForTimeout(1200)
        await page.screenshot({
          path: `${OUT}/${prefix}${state}-${width}-exercise.png`,
          fullPage: false,
        })
        await page.mouse.wheel(0, 520)
        await page.waitForTimeout(400)
        await page.screenshot({
          path: `${OUT}/${prefix}${state}-${width}-exercise-scrolled.png`,
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
  /**
   * Wipe first, and this is not tidiness.
   *
   * `shots/` is git-ignored, so it accumulates frames from every branch that
   * ever ran this script. During the v5 token swap, three-day-old `ar-*` frames
   * from the abandoned paper-first branch were still sitting here, and they were
   * read as current output — the app appeared to render Arabic on a cream
   * background, which would have been a serious regression if it had been real.
   * A directory that mixes runs is a directory that lies. Every frame in here is
   * now from the run that just finished, or it is not in here.
   */
  rmSync(OUT, { recursive: true, force: true })
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
    /**
     * Arabic, and it is not optional.
     *
     * Three defects came out of ONE Arabic screenshot Ameen took (WAZN_PLAN
     * §7.0): `icon-start` mirrored a data string so weights and reps rendered
     * backwards on every ghost row, `ExerciseThumb` was missing from the board,
     * and exercise names were still English. Lint, typecheck, 818 tests, a
     * production build and a Playwright smoke run were all green for all three.
     * This script existed at the time and never once rendered RTL, which is why
     * a person with a phone was the only thing that could catch them.
     *
     * One width, both the populated tabs and an open workout: the board is where
     * the mirroring failures live, and 390 is the tighter of the two so a
     * layout that survives it survives 430.
     */
    for (const active of [false, true]) {
      crashes.push(
        ...(await shoot(browser, server.origin, {
          width: 390,
          empty: false,
          active,
          locale: 'ar',
        })),
      )
    }
  } finally {
    await browser.close()
    await server.close()
  }

  console.log(
    // Counted off disk, not predicted from the loop bounds. The arithmetic
    // version stayed at "38 screenshots" while the Arabic pass added fourteen
    // more, which is the kind of quiet wrongness this script exists to expose.
    `\n${readdirSync(OUT).length} screenshots in ${OUT}/`,
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
