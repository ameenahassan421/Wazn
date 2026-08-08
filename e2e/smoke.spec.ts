import { expect, test, type Page } from '@playwright/test'
import { stubSupabase, USER_ID } from './stub'

/**
 * The three assertions the audit asks for (§5-I4), each traceable to a defect
 * that reached production:
 *
 *   1. Every tab renders and nothing throws.
 *   2. Elements that `inset-block-0` silently zeroed have a height.
 *   3. The request bodies the client sends carry their owner column.
 *
 * Nothing here asserts on pixels or copy. A smoke run that breaks when a
 * headline is reworded gets muted, and a muted check is worse than none.
 */

const TABS = ['Log', 'History', 'Progress', 'Coach', 'Friends'] as const

/**
 * The tab bar is a `<nav>` of plain buttons with `aria-current`, not an ARIA
 * tablist. Selecting by the markup the app actually has — the first draft
 * asked for `role="tab"` and every test timed out against a page that was
 * rendering perfectly.
 */
const tabBar = (page: Page) => page.locator('nav').first()
const openTab = (page: Page, name: string) =>
  tabBar(page).getByRole('button', { name, exact: false }).click()

/**
 * Things that legitimately fail outside Vercel's edge, and only those.
 *
 * `@vercel/analytics` fetches `/_vercel/insights/script.js`, which is injected
 * by the platform and does not exist under `vite preview`. Ignoring the whole
 * console instead would have been the easy fix and would have thrown away the
 * assertion's entire value.
 */
const EXPECTED_OFF_PLATFORM = [/_vercel\/insights/]

/** Anything the page threw, whether React caught it or not. */
function watchForErrors(page: Page): string[] {
  const errors: string[] = []
  // A real uncaught exception. Never ignored.
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    // Chromium logs a failed subresource as the bare string "Failed to load
    // resource: … 404" with no URL in it, which is both unusable as a failure
    // message and impossible to filter by origin. The `response` listener
    // below covers exactly this class and knows the URL, so dropping it here
    // loses no coverage — it is the same event, reported usefully.
    if (text.startsWith('Failed to load resource')) return
    if (EXPECTED_OFF_PLATFORM.some((pattern) => pattern.test(text))) return
    errors.push(`console: ${text}`)
  })
  page.on('response', (response) => {
    if (response.status() < 400) return
    const url = response.url()
    if (EXPECTED_OFF_PLATFORM.some((pattern) => pattern.test(url))) return
    errors.push(`http ${response.status()}: ${url}`)
  })
  return errors
}

test.describe('the app renders', () => {
  test('every tab opens without throwing', async ({ page }) => {
    const errors = watchForErrors(page)
    await stubSupabase(page)
    await page.goto('/')

    // Signed in, not on the auth screen. If the session injection ever stops
    // working this is the assertion that says so, rather than four confusing
    // failures below it.
    await expect(tabBar(page)).toBeVisible({ timeout: 15_000 })

    for (const tab of TABS) {
      await openTab(page, tab)
      // The error boundary renders `role="alert"` with this copy. Its presence
      // means a screen crashed and was caught — which is the boundary working
      // and the screen not.
      await expect(page.getByText('Something broke')).toHaveCount(0)
      await expect(tabBar(page)).toBeVisible()
    }

    expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([])
  })

  test('the tab bar does not cover the content', async ({ page }) => {
    await stubSupabase(page)
    await page.goto('/')
    await expect(tabBar(page)).toBeVisible({ timeout: 15_000 })
    await openTab(page, 'History')

    // The invariant is not "main ends above the bar" — the bar is fixed, so
    // main's box can legitimately run under it. It is that main reserves at
    // least the bar's height as bottom padding, which is what `pb-28` buys.
    // Nearly reported a fullPage screenshot artefact as an overlap bug once;
    // measuring the actual rule avoids repeating that.
    const navHeight = (await tabBar(page).boundingBox())!.height
    const padding = await page
      .locator('main')
      .evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingBottom))
    expect(padding).toBeGreaterThanOrEqual(navHeight)
  })
})

test.describe('nothing renders at height zero', () => {
  /**
   * The `inset-block-0` class. It is not a Tailwind v4 utility, so it emitted
   * no CSS and raised no error, and the muscle-balance fills, the knurl target
   * band, the Coach rail and the rest-timer bar were all height 0 in
   * production — including a chart the parity plan listed as a differentiator
   * to protect. Nothing in the CI wall could have caught it. A screenshot did.
   *
   * A layout assertion is the only kind of check that catches a class name
   * which does not exist, which is why this measures rather than looks.
   */
  test('the progress charts have height', async ({ page }) => {
    await stubSupabase(page)
    await page.goto('/')
    await expect(tabBar(page)).toBeVisible({ timeout: 15_000 })
    await openTab(page, 'Progress')

    // Wait for the lazy chunk rather than a fixed pause — and wait on an
    // `svg`, deliberately, not on one of the elements under test. Waiting on a
    // knurl band made the check fail at the visibility step when the defect
    // was reintroduced, which is a pass/fail in the right direction with a
    // useless message. Waiting on something else lets the scan below run and
    // name every offender.
    await expect(page.locator('main svg').first()).toBeVisible({ timeout: 15_000 })

    const zeroHeight = await page.evaluate(() => {
      const offenders: string[] = []
      for (const element of document.querySelectorAll('main *')) {
        const style = getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden') continue
        const box = element.getBoundingClientRect()
        // Only elements that are trying to be a visual band. A text span with
        // no content is not a bug; a positioned bar with no height is.
        const positioned =
          style.position === 'absolute' || style.position === 'relative'
        const painted =
          style.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
          style.backgroundImage !== 'none'
        if (positioned && painted && box.width > 0 && box.height === 0) {
          offenders.push(element.className.toString().slice(0, 80))
        }
      }
      return offenders
    })

    expect(
      zeroHeight,
      `painted elements with no height:\n${zeroHeight.join('\n')}`,
    ).toEqual([])
  })
})

test.describe('what the client actually sends', () => {
  /**
   * The class of bug the audit names: nothing tested the client's payload.
   *
   * `follows.follower_id` and `workout_likes.user_id` are NOT NULL with no
   * default and the client omitted them, so every follow and every like the
   * app attempted was refused — for the entire life of the feature — while
   * `rls_social.sql` passed, because it names both columns the way SQL does.
   *
   * This asserts on bytes leaving the browser, which is the only place that
   * bug was ever visible.
   */
  test('starting a workout sends the owner column', async ({ page }) => {
    const captured = await stubSupabase(page)
    await page.goto('/')
    await expect(tabBar(page)).toBeVisible({ timeout: 15_000 })

    await page
      .getByRole('button', { name: /start.*workout/i })
      .first()
      .click()

    await expect
      .poll(
        () =>
          captured.filter((r) => r.table === 'workouts' && r.method === 'POST').length,
      )
      .toBeGreaterThan(0)

    const insert = captured.find((r) => r.table === 'workouts' && r.method === 'POST')!
    const row = Array.isArray(insert.body) ? insert.body[0] : insert.body
    expect(row).toMatchObject({ user_id: USER_ID })
  })

  test('no write leaves without the column that owns it', async ({ page }) => {
    // Generalised from the specific bug: for the tables whose insert policy
    // compares a column to auth.uid(), that column has to be in the payload
    // or the row is refused before RLS has an opinion. Migration 0016 adds
    // database defaults as a second belt; this is the braces.
    const OWNER_COLUMN: Record<string, string> = {
      workouts: 'user_id',
      follows: 'follower_id',
      workout_likes: 'user_id',
      routines: 'user_id',
      client_errors: 'user_id',
    }

    const captured = await stubSupabase(page)
    await page.goto('/')
    await expect(tabBar(page)).toBeVisible({ timeout: 15_000 })

    for (const tab of TABS) {
      await openTab(page, tab)
      await page.waitForTimeout(300)
    }

    const offenders = captured
      .filter((r) => r.method === 'POST' && OWNER_COLUMN[r.table])
      .filter((r) => {
        const row = Array.isArray(r.body) ? r.body[0] : r.body
        const column = OWNER_COLUMN[r.table]
        // `client_errors` legitimately relies on its database default, since
        // the column is defaulted in 0018 and the client never knows the id.
        if (r.table === 'client_errors') return false
        return !row || (row as Record<string, unknown>)[column] === undefined
      })
      .map((r) => `${r.table}: ${JSON.stringify(r.body)}`)

    expect(
      offenders,
      `writes missing their owner column:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
