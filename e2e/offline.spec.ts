import { expect, test, type Page } from '@playwright/test'
import { stubSupabase, USER_ID, type StubServer } from './stub'

/**
 * GATE 4, run in a browser.
 *
 * > "An airplane-mode workout syncs clean on reconnect." Plus: kill the tab
 * > mid-workout, reopen, nothing lost.
 *
 * That sentence has been in the plan since Stage 4 and nothing has ever
 * checked it. Unit tests cover the queue's arithmetic — what to retry, what
 * counts as landed, what a discard drops — and none of them can see whether a
 * person standing in a basement can start a workout, log it, finish it, and
 * find it on the server afterwards. This can, because it drives the built
 * bundle with the project's network cut.
 *
 * Two switches, and they do different jobs:
 *
 *   `server.offline`   — the project's requests are aborted. This is the honest
 *                        simulation of a dead radio, and it is what makes
 *                        `TypeError: Failed to fetch` reach the app.
 *   `context.setOffline` — the whole browser goes offline, so `navigator.onLine`
 *                        is false too. Used where the app's own reading of the
 *                        connection is part of what is being tested; NOT used
 *                        where the page still has to load from `vite preview`.
 */

/**
 * The app has rendered and somebody is signed in.
 *
 * The avatar, because it is the one control on EVERY signed-in screen —
 * including mid-workout, where there is no Start button because the board has
 * replaced it. This used to wait on the tab bar, which had the same property
 * until it was retired; substituting the Start row for it broke exactly the
 * two tests that reload with a workout open.
 */
const appReady = (page: Page) =>
  page.getByRole('button', { name: 'You — settings' }).first()

/** The idle home, specifically: the Start row is only ever on that screen. */
const signedInHome = (page: Page) =>
  page.getByRole('button', { name: /start.*workout/i }).first()

function makeServer(): StubServer {
  return { captured: [], rows: {}, offline: false }
}

/**
 * How many writes IndexedDB is holding, or -1 when it holds nothing.
 *
 * The app keeps two durable copies of the queue and this reads one of them
 * directly, which no other test does. It is here because the difference
 * between the copies is the whole subject of the test below: one is written
 * synchronously and one is not, and a test that cannot see which is which
 * cannot tell whether it is asserting durability or luck.
 */
const queueLength = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('wazn', 1)
        open.onerror = () => resolve(-1)
        open.onsuccess = () => {
          const tx = open.result.transaction('kv', 'readonly')
          const read = tx.objectStore('kv').get('queue')
          tx.oncomplete = () => {
            const record = read.result as { value?: unknown[] } | undefined
            resolve(record?.value?.length ?? -1)
          }
          tx.onerror = () => resolve(-1)
        }
      }),
  )

async function signedIn(page: Page, server: StubServer) {
  await stubSupabase(page, server)
  await page.goto('/')
  await expect(appReady(page)).toBeVisible({ timeout: 15_000 })
  // The catalogue has to have landed before the network is cut, or there is
  // nothing cached to log against — which is a real first-run limitation and
  // not what these tests are about.
  await expect(signedInHome(page)).toBeVisible({ timeout: 15_000 })
}

/** Pick a lift and log one set from the focused view. */
async function logSet(page: Page, exercise: string, weight: string, reps: string) {
  await page
    .getByRole('button', { name: /add exercise|start.*workout/i })
    .first()
    .click()
  await page
    .getByRole('button', { name: new RegExp(exercise, 'i') })
    .first()
    .click()
  await page.locator('#weight').fill(weight)
  await page.locator('#reps').fill(reps)
  await page.getByRole('button', { name: /^Bank (set|warm-up)/ }).click()
}

test.describe('GATE 4 — the airplane-mode workout', () => {
  test('a workout started, logged and finished with no signal syncs clean', async ({
    page,
    context,
  }) => {
    const server = makeServer()
    await signedIn(page, server)

    // ── Into the dead zone ────────────────────────────────────────────────
    server.offline = true
    await context.setOffline(true)

    await logSet(page, 'Bench Press', '100', '8')
    // The set is on screen the instant it is committed. Nothing about this is
    // conditional on a network — that is the whole of trust-ladder rung 2.
    await expect(page.getByTestId('sync-note')).toContainText(/offline/i)
    await expect(page.getByTestId('sync-note')).toContainText('1 set')

    // Back out of the focused view and log a second lift, so the assertion
    // below is about a session rather than a single row.
    await page.getByRole('button', { name: 'Back to workout' }).click()
    await logSet(page, 'Squat', '140', '5')
    await expect(page.getByTestId('sync-note')).toContainText('2 sets')
    await page.getByRole('button', { name: 'Back to workout' }).click()

    // Nothing has reached the server. If anything had, the rest of this test
    // would be proving something easier than GATE 4.
    expect(server.rows.workouts ?? []).toHaveLength(0)
    expect(server.rows.workout_sets ?? []).toHaveLength(0)

    // ── Finish, still with no signal ──────────────────────────────────────
    await page.getByRole('button', { name: 'Finish', exact: true }).click()
    await page.getByRole('button', { name: 'Finish?' }).click()
    // The summary is computed from what is on the device, so it appears with
    // no round trip at all.
    await expect(
      page.getByText(/^Done$|Workout complete|Finished/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    // ── Signal comes back ─────────────────────────────────────────────────
    server.offline = false
    await context.setOffline(false)

    await expect
      .poll(() => (server.rows.workout_sets ?? []).length, { timeout: 20_000 })
      .toBe(2)

    const workouts = server.rows.workouts ?? []
    expect(workouts).toHaveLength(1)
    expect(workouts[0]).toMatchObject({ user_id: USER_ID })
    // Finished, not merely created: `ended_at` is its own queued op and the
    // workout is not really synced until it has landed too.
    await expect.poll(() => workouts[0].ended_at, { timeout: 20_000 }).toBeTruthy()

    // Clean, not merely present: one row per set, no duplicates from a replay.
    const ids = (server.rows.workout_sets ?? []).map((r) => r.id)
    expect(new Set(ids).size).toBe(2)
    expect(server.rows.workout_sets?.map((r) => r.reps).sort()).toEqual([5, 8])
  })

  test('killing the tab mid-workout loses nothing', async ({ page, context }) => {
    const server = makeServer()
    await signedIn(page, server)

    server.offline = true
    await context.setOffline(true)
    await logSet(page, 'Bench Press', '100', '8')
    await expect(page.getByTestId('sync-note')).toContainText('1 set')

    // The tab dies here. No finish, no unload handler that gets to run — this
    // is the phone being killed by the OS between the check and the ack, which
    // is the case the checkpoint and the durable queue exist for.
    server.offline = false
    await context.setOffline(false)
    await page.reload()
    await expect(appReady(page)).toBeVisible({ timeout: 15_000 })

    // The set is on the server, replayed from a queue that survived the reload.
    await expect
      .poll(() => (server.rows.workout_sets ?? []).length, { timeout: 20_000 })
      .toBe(1)
    // 45.36, not 100: the header defaults to lbs and weight is ALWAYS stored
    // in kg (WAZN_PLAN §2, CLAUDE.md). A queued write that had been converted
    // twice, or not at all, would show up right here.
    expect(server.rows.workout_sets?.[0]).toMatchObject({ reps: 8 })
    expect(server.rows.workout_sets?.[0].weight_kg).toBeCloseTo(45.36, 2)
    // And exactly once. The client-generated id is the primary key, so the
    // stub answers a replay with 23505 exactly as Postgres would; a queue that
    // read that as a failure would show two sets here.
    expect(server.rows.workouts ?? []).toHaveLength(1)
  })

  /**
   * The same kill, with nothing but the synchronous copy left — and the reason
   * the test above passed in CI for two weeks while failing on a laptop.
   *
   * Everything IndexedDB holds is written through a fire-and-forget
   * transaction; the checkpoint is a `setItem`. checkpoint.ts is explicit
   * about why both exist: "a transaction opened five milliseconds before the
   * OS kills a backgrounded tab may never commit; a `setItem` that returned
   * has already happened." A hard kill is therefore ALLOWED to lose the
   * IndexedDB side. That is not an edge case, it is the case the synchronous
   * copy was written for.
   *
   * The test above never says which copy it is relying on, so it asserts
   * whichever one happens to survive on the machine it runs on. There were two
   * ways for it to be rescued and neither is a promise the app makes: the
   * IndexedDB queue committing before `reload()`, or the board snapshot
   * surviving so the app restores an "open" workout and reads the checkpoint
   * on that branch. CI got one of them, a faster laptop got neither, and the
   * green runs were the lucky ones — the load path had no route from the
   * checkpoint to the queue at all when the server knew of no open workout.
   *
   * Clearing the store is the honest worst case and it makes the assertion
   * deterministic: the checkpoint alone has to carry the session.
   */
  test('loses nothing when only the synchronous checkpoint survived', async ({
    page,
    context,
  }) => {
    const server = makeServer()
    await signedIn(page, server)

    server.offline = true
    await context.setOffline(true)
    await logSet(page, 'Bench Press', '100', '8')
    await expect(page.getByTestId('sync-note')).toContainText('1 set')

    // Wait for the app's own writes to land BEFORE taking them away, or this
    // races the thing it is trying to simulate: the first version of this test
    // cleared the store while the fire-and-forget `put` was still in flight,
    // the write landed on top of the delete, and the test passed against the
    // bug it was written to catch.
    await expect.poll(() => queueLength(page), { timeout: 10_000 }).toBe(2)
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('wazn', 1)
          open.onerror = () => reject(new Error('indexeddb did not open'))
          open.onsuccess = () => {
            const tx = open.result.transaction('kv', 'readwrite')
            tx.objectStore('kv').clear()
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(new Error('the clear did not commit'))
          }
        }),
    )
    // Gone, and proven gone. The queue, the board and the catalogue all went
    // through the same kind of transaction, so a kill that loses one can lose
    // all three. What is left is the `setItem` that had already returned.
    expect(await queueLength(page)).toBe(-1)
    expect(
      await page.evaluate(() => localStorage.getItem('wazn.workout.v1') !== null),
    ).toBe(true)

    /*
     * The radio comes back while the PROJECT is still unreachable, and the
     * order of those two matters more than it looks.
     *
     * `setOffline(false)` fires an `online` event, and the page that is about
     * to be reloaded is still running: it wakes its own in-memory queue and
     * starts draining. Do that with the project reachable and the dying tab
     * delivers the whole session by itself, which is a real thing browsers do
     * and a useless thing to assert — nothing durable was read, so the test
     * would pass on a build that had lost the restore entirely. That is what
     * the first draft of this test did.
     *
     * Keeping `server.offline` true through the reload closes it: the old
     * tab's drain classifies as offline, counts nothing, sends nothing, and
     * the assertion below proves it.
     */
    await context.setOffline(false)
    expect(server.rows.workouts ?? []).toHaveLength(0)
    expect(server.rows.workout_sets ?? []).toHaveLength(0)

    // The shell still loads: the browser has signal, the project does not.
    await page.reload()
    await expect(appReady(page)).toBeVisible({ timeout: 15_000 })
    // Still nothing, now from a page that has already read the device.
    expect(server.rows.workout_sets ?? []).toHaveLength(0)

    // Signal reaches the project, and the phone comes out of a pocket — one of
    // the three wakes the queue listens for, and the one iOS actually delivers.
    server.offline = false
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

    // Both writes replay from the checkpoint: the workout that exists nowhere
    // but this device, and the set queued behind it. Head-first, so the
    // foreign key is satisfied without the server ever having seen either.
    await expect
      .poll(() => (server.rows.workout_sets ?? []).length, { timeout: 20_000 })
      .toBe(1)
    expect(server.rows.workout_sets?.[0]).toMatchObject({ reps: 8 })
    expect(server.rows.workout_sets?.[0].weight_kg).toBeCloseTo(45.36, 2)
    expect(server.rows.workouts ?? []).toHaveLength(1)
  })

  test('reopening in a dead zone still shows the board', async ({ page }) => {
    const server = makeServer()
    await signedIn(page, server)

    // Online, so the workout and its set reach the server and the catalogue is
    // cached. This is the ordinary case that then walks into a basement.
    await logSet(page, 'Bench Press', '100', '8')
    await expect
      .poll(() => (server.rows.workout_sets ?? []).length, { timeout: 15_000 })
      .toBe(1)
    await page.getByRole('button', { name: 'Back to workout' }).click()

    // Only the project is unreachable — the app shell still loads, which is
    // what an installed PWA gets from its precache anyway.
    server.offline = true
    await page.reload()
    await expect(appReady(page)).toBeVisible({ timeout: 15_000 })

    // Not an error screen, and not an empty one: the workout, the lift and the
    // set are all still there, read from the device.
    await expect(page.getByText('Something broke')).toHaveCount(0)
    await expect(page.getByText(/in progress/i).first()).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText(/Bench Press/i).first()).toBeVisible()
    // And it is stamped, rather than passed off as live. One line, on the
    // board: mid-workout the question is "is this live", not "what time was
    // it live" — the exact timestamp lives on the idle screen, where you are
    // reading rather than lifting.
    await expect(page.getByTestId('sync-note')).toContainText(/showing saved data/i)
  })
})
