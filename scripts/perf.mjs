/**
 * U7's latency budgets, measured rather than asserted.
 *
 * The claim the parity plan makes is specific and falsifiable: an
 * app-shell-precached PWA can be logging a set before a native app has
 * finished splashing. "Good for a web app" is a losing frame, so this script
 * produces numbers and the PR body carries them the way test counts already do.
 *
 * The budgets (§3-U7):
 *   - tap icon -> first interactive     < 2000ms
 *   - core-loop tap (perceived)         <  100ms
 *   - tab switch                        <  150ms
 *
 * The profile is a mid-range Android on a 3G-class connection, and it is
 * Lighthouse's own mobile preset so the scripted trace and the Lighthouse run
 * describe the same device: 4x CPU slowdown, 1.6 Mbps down, 750 Kbps up,
 * 150ms RTT, 390x844 at DPR 3.
 *
 * Run: `npm run perf`. It builds first — measuring a stale `dist/` is how a
 * regression ships with a green number attached.
 *
 * Two starts are reported because both are true and they answer different
 * questions. COLD is a first-ever visit with an empty cache: what a stranger
 * following an invite link pays. WARM is the installed PWA with the service
 * worker's precache primed: what a lifter opening the app in the gym pays, and
 * the one the "beats a native cold start" claim is actually about.
 *
 * The core-loop tap is deliberately split in two, because averaging them would
 * hide the finding. `feedback` is press-to-acknowledgement, which is local and
 * owned by the motion system. `committed` is press-to-set-row, which includes
 * a Supabase round trip and therefore includes the connection's RTT. U7 says
 * as much itself — "the optimistic writes from U3 are what make the 100ms
 * budget reachable" — so measuring them apart is what turns that sentence into
 * evidence.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  fixtures,
  installSupabaseStub,
  seedSession,
  serveDist,
} from './harness/app-harness.mjs'

const BUDGETS = { interactive: 2000, tap: 100, tabSwitch: 150 }

// Lighthouse's mobile throttling, so the two halves of this script agree.
const THROTTLE = {
  cpu: 4,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
}

const DEVICE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
}

const START_BUTTON = /^Start (workout|your first workout)$/
const LOG_BUTTON = /^Log (set|warm-up) \d+$/
/** The overview's row check — the core loop since design v2.2. */
const CHECK_BUTTON = /^Log .+ set \d+:/

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

async function throttle(page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...THROTTLE })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE.cpu })
}

/**
 * Start to first interactive.
 *
 * "Interactive" is not a synthetic metric here: it is the moment the Log
 * screen's Start control is on screen, because that is the moment the user can
 * do the thing the app is for.
 */
async function measureStart(browser, origin, { warm }) {
  const context = await browser.newContext(DEVICE)
  await seedSession(context)
  const page = await context.newPage()
  // The stub answers locally, so it has to be told to cost what a real
  // round trip costs — see `installSupabaseStub`. One RTT, no server time,
  // which makes every Supabase-dependent number here a floor, not a forecast.
  await installSupabaseStub(page, fixtures(), { latencyMs: THROTTLE.latency })
  await throttle(page)

  if (warm) {
    // Prime the service worker, then reload so the shell comes from precache.
    await page.goto(origin, { waitUntil: 'load' })
    await page
      .waitForFunction(() => navigator.serviceWorker?.controller !== null, {
        timeout: 30000,
      })
      .catch(() => {})
  }

  const started = Date.now()
  await page.goto(origin, { waitUntil: 'commit' })
  await page
    .getByRole('button', { name: START_BUTTON })
    .first()
    .waitFor({ state: 'visible', timeout: 60000 })
  const interactive = Date.now() - started

  const nav = await page.evaluate(() => {
    const e = performance.getEntriesByType('navigation')[0]
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]
    const resources = performance.getEntriesByType('resource')
    return {
      fcp: fcp ? Math.round(fcp.startTime) : null,
      transferredKiB: Math.round(
        resources.reduce((sum, r) => sum + (r.transferSize || 0), 0) / 1024,
      ),
      requests: resources.length,
    }
  })

  return { page, context, metrics: { interactive, ...nav } }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return Math.round(s[Math.floor(s.length / 2)])
}
const stat = (xs) => ({ median: median(xs), worst: Math.round(Math.max(...xs)) })

/**
 * Walk the app to the workout overview, then time its row check.
 *
 * REWRITTEN FOR DESIGN v2.2. This used to walk to the focused set-entry screen
 * and time "Log set N", because that button WAS the core loop. It is not any
 * more: the overview is the default after picking an exercise, and its row
 * check is what a repeat set costs now. Measuring the old button would have
 * kept reporting a green number for a control most sessions no longer press —
 * and in fact the walk simply timed out, which is the honest failure and how
 * this was caught.
 *
 * The budget is unchanged and so is what it means: one tap, one insert, one
 * round trip. GATE U2 requires this to be no more expensive than it was.
 *
 * Everything is timed inside the page: a Playwright round trip per click would
 * add its own milliseconds to a number whose budget is 100.
 */
async function measureCoreLoop(page) {
  // Starting an empty workout opens the picker directly — there is no
  // intermediate overview to tap through, which is the point of the flow.
  await page.getByRole('button', { name: START_BUTTON }).first().click()
  // Wait on a picker-only anchor before touching an exercise name. Waiting on
  // the name itself is a race: it also appears in the previous-session line on
  // the screen being left, so `.first()` clicked a stale node and the walk
  // silently ended up nowhere. The search field is the picker's own control
  // and is on screen the moment it opens.
  await page
    .getByPlaceholder('Search exercises')
    .waitFor({ state: 'visible', timeout: 30000 })
  await page.getByText('Bench Press (Barbell)').first().click()

  // A ghost row's check. It exists only once `previous_session` has answered
  // and the block has planned rows to show, which is exactly the state the
  // 1-tap repeat is defined against.
  await page
    .getByRole('button', { name: CHECK_BUTTON })
    .first()
    .waitFor({ timeout: 30000 })

  const feedback = []
  const committed = []

  for (let i = 0; i < 7; i += 1) {
    const sample = await page.evaluate(async () => {
      const nextFrame = () => new Promise((r) => requestAnimationFrame(r))
      const label = (b) => b.getAttribute('aria-label') ?? ''
      const checks = () =>
        [...document.querySelectorAll('button')].filter((b) =>
          /^Log .+ set \d+:/.test(label(b)),
        )
      // The commit signal: one more row carrying the "Logged" mark than before.
      // Direct rather than indirect — it is the committed row's own marker, so
      // a stall cannot be confused with a walk that ended up on another screen.
      const loggedCount = () =>
        document.querySelectorAll('[aria-label="Logged"]').length

      // Every planned row committed: working past the plan costs one tap, and
      // that tap is not the measurement, so it is spent outside the timer.
      if (checks().length === 0) {
        const addSet = [...document.querySelectorAll('button')].find(
          (b) => b.textContent.trim() === '+ Add set',
        )
        if (!addSet) return null
        addSet.click()
        await nextFrame()
        await nextFrame()
      }

      const button = checks()[0]
      if (!button) return null
      const before = loggedCount()

      const t0 = performance.now()
      button.click()
      // One frame after the click is the first moment anything could have been
      // painted in response — the press dim, the button's disabled state.
      await nextFrame()
      await nextFrame()
      const feedbackAt = performance.now() - t0

      // Bounded: an unbounded rAF loop in here does not fail, it hangs, and a
      // measurement script that hangs is worse than one that reports a miss.
      const settled = await new Promise((resolve) => {
        const deadline = performance.now() + 10000
        const check = () => {
          if (loggedCount() > before) return resolve(true)
          if (performance.now() > deadline) return resolve(false)
          requestAnimationFrame(check)
        }
        check()
      })

      if (!settled) {
        // Say why, so a failed run is a diagnosis rather than a shrug.
        return {
          feedback: feedbackAt,
          committed: null,
          stuckAt: `${loggedCount()} logged, ${checks().length} check(s) on screen`,
          alert:
            document
              .querySelector('[role="alert"]')
              ?.textContent?.trim()
              .slice(0, 160) ?? null,
        }
      }
      await nextFrame()
      return { feedback: feedbackAt, committed: performance.now() - t0 }
    })
    if (!sample) break
    feedback.push(sample.feedback)
    if (sample.committed === null) {
      // The set never landed. Report the miss and what it was stuck on rather
      // than averaging it away or, worse, reporting only the feedback number
      // and calling the core loop a pass.
      return {
        feedback: stat(feedback),
        committed: null,
        samples: feedback.length,
        stuckAt: sample.stuckAt,
        alert: sample.alert,
      }
    }
    committed.push(sample.committed)
    await page.waitForTimeout(120)
  }

  return feedback.length
    ? {
        feedback: stat(feedback),
        committed: committed.length ? stat(committed) : null,
        samples: feedback.length,
      }
    : null
}

/**
 * Tab switch: click to painted. Measured in-page across two frames, so it is
 * React's render plus the browser's paint and nothing else.
 *
 * Progress, Coach and Friends are lazily chunked, so their FIRST switch also
 * pays a network fetch. That first visit is reported separately — averaging it
 * into the median would flatter the steady-state number and hide the cost of
 * the code-splitting choice.
 */
async function measureTabSwitch(page) {
  const click = (name) =>
    page.evaluate(async (label) => {
      const nextFrame = () => new Promise((r) => requestAnimationFrame(r))
      const tab = [...document.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === label,
      )
      if (!tab) return null
      const t0 = performance.now()
      tab.click()
      await nextFrame()
      await nextFrame()
      return performance.now() - t0
    }, name)

  const firstVisit = {}
  for (const name of ['History', 'Progress', 'Coach', 'Friends']) {
    firstVisit[name] = Math.round((await click(name)) ?? 0)
    // Let the lazy chunk land before moving on, so the next first-visit number
    // is not measuring this one's download.
    await page.waitForTimeout(1500)
    await click('Log')
    await page.waitForTimeout(300)
  }

  const steady = []
  for (let i = 0; i < 8; i += 1) {
    const name = ['History', 'Progress', 'Friends'][i % 3]
    steady.push((await click(name)) ?? 0)
    await page.waitForTimeout(200)
    await click('Log')
    await page.waitForTimeout(200)
  }

  return { firstVisit, steady: stat(steady) }
}

async function runLighthouse(origin) {
  // Lighthouse drives Chrome itself over a debugging port and does its own
  // throttling. If it cannot get a browser, the scripted trace above is still
  // the answer — say the run was skipped rather than losing every number.
  let browser
  try {
    const lighthouse = (await import('lighthouse')).default
    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || undefined,
      args: ['--remote-debugging-port=9222'],
    })
    const result = await lighthouse(origin, {
      port: 9222,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance'],
    })
    const a = result.lhr.audits
    return {
      performanceScore: Math.round(result.lhr.categories.performance.score * 100),
      firstContentfulPaint: Math.round(a['first-contentful-paint'].numericValue),
      largestContentfulPaint: Math.round(a['largest-contentful-paint'].numericValue),
      totalBlockingTime: Math.round(a['total-blocking-time'].numericValue),
      speedIndex: Math.round(a['speed-index'].numericValue),
      cumulativeLayoutShift: Number(
        a['cumulative-layout-shift'].numericValue.toFixed(3),
      ),
    }
  } catch (error) {
    return { skipped: String(error?.message ?? error).split('\n')[0] }
  } finally {
    await browser?.close()
  }
}

function verdict(value, budget) {
  if (value === undefined || value === null) return ''
  return value <= budget ? `PASS (< ${budget}ms)` : `MISS (budget ${budget}ms)`
}

function print(r) {
  const cold = r.runs.cold ?? {}
  const warm = r.runs.warm ?? {}
  const tap = warm.coreLoop
  const tabs = warm.tabSwitch
  const lh = r.lighthouse ?? {}

  console.log(`
─── U7 latency budgets ───────────────────────────────────────────────────
profile   mid-range Android · 4x CPU · 1.6 Mbps down · 150ms RTT · 390x844@3x

COLD start   empty cache, first ever visit
  first interactive    ${cold.interactive}ms   ${verdict(cold.interactive, BUDGETS.interactive)}
  first paint          ${cold.fcp}ms
  transferred          ${cold.transferredKiB} KiB over ${cold.requests} requests

WARM start   service worker primed — the gym case
  first interactive    ${warm.interactive}ms   ${verdict(warm.interactive, BUDGETS.interactive)}
  first paint          ${warm.fcp}ms

CORE LOOP    ${tap?.samples ?? 0} samples
  tap -> feedback      ${tap?.feedback?.median}ms   ${verdict(tap?.feedback?.median, BUDGETS.tap)}
  tap -> set on screen ${
    tap?.committed
      ? `${tap.committed.median}ms   ${verdict(tap.committed.median, BUDGETS.tap)}   (worst ${tap.committed.worst}ms)`
      : `NOT MEASURED — no commit within 10s (button stuck at "${tap?.stuckAt}"${tap?.alert ? `, alert: ${tap.alert}` : ''})`
  }

TAB SWITCH
  steady state         ${tabs?.steady.median}ms   ${verdict(tabs?.steady.median, BUDGETS.tabSwitch)}   (worst ${tabs?.steady.worst}ms)
  first render         ${Object.entries(tabs?.firstVisit ?? {})
    .map(([k, v]) => `${k} ${v}ms`)
    .join(' · ')}
                       (first RENDER, not first download. History is in the
                        main chunk; Progress, Coach and Friends are fetched on
                        first open and cached at runtime from then on — they
                        left the precache in U3b, because none of the three
                        can show anything without a network anyway)

LIGHTHOUSE   ${
    lh.skipped
      ? `skipped — ${lh.skipped}`
      : `perf ${lh.performanceScore} · FCP ${lh.firstContentfulPaint}ms · LCP ${lh.largestContentfulPaint}ms · TBT ${lh.totalBlockingTime}ms · SI ${lh.speedIndex}ms · CLS ${lh.cumulativeLayoutShift}`
  }

written to perf/latency.json
──────────────────────────────────────────────────────────────────────────`)
}

async function main() {
  build()
  const server = await serveDist('dist')
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
  })
  const report = { budgets: BUDGETS, throttling: THROTTLE, runs: {} }

  try {
    for (const warm of [false, true]) {
      const { page, context, metrics } = await measureStart(browser, server.origin, {
        warm,
      })
      const run = { ...metrics }

      if (warm) {
        run.tabSwitch = await measureTabSwitch(page)
        run.coreLoop = await measureCoreLoop(page)
      }

      report.runs[warm ? 'warm' : 'cold'] = run
      await context.close()
    }
  } finally {
    await browser.close()
  }

  report.lighthouse = await runLighthouse(server.origin)
  await server.close()

  mkdirSync('perf', { recursive: true })
  writeFileSync('perf/latency.json', JSON.stringify(report, null, 2))
  print(report)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
