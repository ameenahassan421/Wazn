import type { Page, Route } from '@playwright/test'

/**
 * A whole Supabase project, faked at the network layer.
 *
 * Every request the app makes to the project is intercepted, so the smoke run
 * needs no database, no key and no egress — it behaves the same in CI and in a
 * sandboxed session with no route to Supabase at all.
 *
 * Intercepting at the network layer rather than mocking the client module is
 * what makes the third assertion in `smoke.spec.ts` possible: the request
 * bodies that arrive here are the bytes the real client would have sent. That
 * is the assertion that would have caught follows and likes never working —
 * `rls_social.sql` passed the whole time because it names both columns the way
 * SQL does and the client did not.
 */

const PROJECT = 'ttasiwxeqerhsztxjxip.supabase.co'
export const USER_ID = '11111111-1111-4111-8111-111111111111'

/** Every write the app attempted, in order. Asserted on, not just recorded. */
export interface CapturedRequest {
  method: string
  table: string
  body: unknown
}

const EXERCISES = [
  {
    id: 'ex-bench',
    name: 'Bench Press (Barbell)',
    muscle_group: 'chest',
    equipment: 'barbell',
    image_url: null,
  },
  {
    id: 'ex-squat',
    name: 'Squat (Barbell)',
    muscle_group: 'quads',
    equipment: 'barbell',
    image_url: null,
  },
  {
    id: 'ex-row',
    name: 'Bent Over Row (Barbell)',
    muscle_group: 'back',
    equipment: 'barbell',
    image_url: null,
  },
]

const WORKOUTS = [
  {
    id: 'w-1',
    user_id: USER_ID,
    name: 'Upper A',
    started_at: '2026-08-06T17:00:00Z',
    ended_at: '2026-08-06T18:12:00Z',
    notes: null,
  },
  {
    id: 'w-2',
    user_id: USER_ID,
    name: 'Legs',
    started_at: '2026-08-04T17:00:00Z',
    ended_at: '2026-08-04T18:20:00Z',
    notes: null,
  },
]

/**
 * Deliberately large numbers. The Progress screen's volume figures are where
 * thousands-grouping matters (parity gap L6), and a fixture in the hundreds
 * would make that assertion vacuous.
 */
const STRENGTH_SUMMARY = [
  {
    exercise_id: 'ex-bench',
    name: 'Bench Press (Barbell)',
    muscle_group: 'chest',
    image_url: null,
    best_weight_kg: 102.5,
    best_e1rm_kg: 118.2,
    set_count: 62,
    last_performed: '2026-08-06T17:30:00Z',
  },
  {
    exercise_id: 'ex-squat',
    name: 'Squat (Barbell)',
    muscle_group: 'quads',
    image_url: null,
    best_weight_kg: 142.5,
    best_e1rm_kg: 165.4,
    set_count: 51,
    last_performed: '2026-08-04T17:30:00Z',
  },
]

const RPC_RESULTS: Record<string, unknown> = {
  exercise_usage: EXERCISES.map((e) => ({ exercise_id: e.id, uses: 12 })),
  previous_session: [],
  exercise_1rm_history: [],
  strength_summary: STRENGTH_SUMMARY,
  muscle_volume: [
    { muscle_group: 'chest', sets: 22 },
    { muscle_group: 'back', sets: 9 },
    { muscle_group: 'quads', sets: 14 },
  ],
  volume_trend: [
    { week: '2026-07-27', volume_kg: 18420 },
    { week: '2026-08-03', volume_kg: 21365 },
  ],
  training_calendar: [{ day: '2026-08-06', sessions: 1 }],
  social_feed: [],
  leaderboard: [],
  /**
   * B1's two blocks. Present because the fallback below answers `[]` for any
   * RPC it does not know, and `[]` is truthy — which is how the briefing card
   * first reached CI: it read `low_bands.length` off an array, threw, and took
   * the whole Log tab down behind the error boundary. The client now rejects
   * any answer that is not a plain object, and this makes the smoke run
   * exercise the REAL path rather than that guard.
   *
   * `session_brief` deliberately carries a target and a routine, so the card
   * actually renders and the "every tab opens" assertion covers it.
   */
  session_brief: {
    unit: 'kg',
    productive_range: [10, 20],
    days_since_last: 2,
    sessions_last_7: 2,
    sessions_last_28: 9,
    total_sets_90d: 210,
    due_routine: { name: 'Upper A', exercises: 4, days_since_run: 5 },
    target: {
      exercise: 'Bench Press (Barbell)',
      last_weight_kg: 100,
      last_reps: 5,
      last_e1rm: 116.7,
      best_e1rm: 116.7,
      last_done_days_ago: 5,
      next_weight_kg: 102.5,
      next_e1rm: 119.6,
    },
    low_bands: [{ muscle: 'back', sets: 9 }],
  },
  session_debrief: {
    unit: 'kg',
    productive_range: [10, 20],
    found: false,
    sets: 0,
    exercises: 0,
    volume_kg: 0,
    duration_min: null,
    records: 0,
    anchor: null,
    low_band: null,
  },
  coach_stats: {
    unit: 'kg',
    window_days: 90,
    sessions_last_7: 2,
    sessions_last_28: 9,
    weekly_sets_by_muscle: { chest: 22, back: 9 },
    weekly_sets_by_muscle_4w_ago: { chest: 18 },
    lifts: [],
    records_last_28: 1,
    total_sets_90d: 311,
  },
}

const TABLE_RESULTS: Record<string, unknown> = {
  exercises: EXERCISES,
  workouts: WORKOUTS,
  workout_sets: [],
  profiles: [
    {
      id: USER_ID,
      username: 'smoke_user',
      display_name: 'Smoke',
      visibility: 'private',
    },
  ],
  routines: [],
  routine_exercises: [],
  routine_sets: [],
  coach_notes: [],
  ai_generations: [],
  follows: [],
  workout_likes: [],
  invites: [],
  exercise_rest: [],
  client_errors: [],
}

function tableOf(url: string): string {
  const match = /\/rest\/v1\/(?:rpc\/)?([a-z_]+)/.exec(url)
  return match?.[1] ?? ''
}

/**
 * A stub that remembers, and that can lose its network.
 *
 * The plain stub echoes writes back and forgets them, which is enough to
 * assert what the client sends. GATE 4 needs more than that: "syncs clean on
 * reconnect" is a claim about what the SERVER ends up holding, so the offline
 * run needs somewhere for rows to actually land, and a switch that makes every
 * request fail the way a dead radio does.
 */
export interface StubServer {
  /** Every write the app attempted, in order. */
  captured: CapturedRequest[]
  /** Rows the server accepted, by table — what "synced clean" is asserted on. */
  rows: Record<string, Record<string, unknown>[]>
  /**
   * Airplane mode. Requests to the project are aborted rather than answered,
   * which is what the browser does with no radio and what supabase-js turns
   * into `TypeError: Failed to fetch`.
   *
   * NOT `context.setOffline(true)` alone: that also stops the app shell
   * loading from `vite preview`, so a test could never reach the state it is
   * trying to test. The tests use both — this for the project, and
   * `setOffline` where a genuinely dead browser is the point.
   */
  offline: boolean
}

export async function stubSupabase(
  page: Page,
  server?: StubServer,
): Promise<CapturedRequest[]> {
  const captured: CapturedRequest[] = server?.captured ?? []

  // A session in the exact key and shape supabase-js reads at startup, so the
  // app is signed in before its first render and never shows the auth screen.
  await page.addInitScript(
    ([userId, project]) => {
      const ref = (project as string).split('.')[0]
      const hour = Math.floor(Date.now() / 1000) + 3600
      window.localStorage.setItem(
        `sb-${ref}-auth-token`,
        JSON.stringify({
          access_token: 'smoke-access-token',
          refresh_token: 'smoke-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: hour,
          user: {
            id: userId,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'smoke@example.com',
            app_metadata: {},
            user_metadata: {},
            created_at: '2026-01-01T00:00:00Z',
          },
        }),
      )
    },
    [USER_ID, PROJECT] as const,
  )

  await page.route(`**://${PROJECT}/**`, async (route: Route) => {
    const request = route.request()
    const url = request.url()
    const method = request.method()
    const table = tableOf(url)

    // A dead radio does not answer. `abort` is what the browser turns into
    // `TypeError: Failed to fetch`, which is the exact string the app's
    // `classifyFailure` has to recognise as "offline" rather than "refused".
    if (server?.offline) return route.abort('internetdisconnected')

    if (method !== 'GET' && method !== 'HEAD') {
      captured.push({ method, table, body: request.postDataJSON?.() ?? null })
    }

    const headers = {
      'content-type': 'application/json',
      // PostgREST sends this for `count: 'exact'`; supabase-js reads it.
      'content-range': '0-0/0',
      'access-control-allow-origin': '*',
    }

    if (url.includes('/auth/v1/')) {
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          id: USER_ID,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'smoke@example.com',
        }),
      })
    }

    if (url.includes('/functions/v1/')) {
      // The Coach surfaces call these. An empty answer is the app's own
      // designed empty state, so this exercises a real path rather than an
      // error one.
      //
      // `coach-brief` answers `line: null`, which is what the real function
      // returns when there is nothing worth a model call. That leaves the
      // briefing card showing its deterministic skeleton — the state that
      // matters most, since it is the one every user sees when the AI layer is
      // dark, and the one the two-stage draw exists to guarantee.
      if (url.includes('coach-brief')) {
        return route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify({ line: null, cached: false, model: 'none' }),
        })
      }
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          review: null,
          insights: [],
          generatedAt: new Date().toISOString(),
          model: 'none',
          cached: false,
          regeneratesLeft: 1,
        }),
      })
    }

    if (url.includes('/rest/v1/rpc/')) {
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify(RPC_RESULTS[table] ?? []),
      })
    }

    const stored = server ? (server.rows[table] ??= []) : null

    if (method === 'POST' || method === 'PATCH' || method === 'DELETE') {
      const body = (request.postDataJSON?.() ?? {}) as Record<string, unknown>
      const rows = Array.isArray(body) ? body : [body]

      if (stored) {
        if (method === 'POST') {
          for (const row of rows) {
            // The client generates the primary key, so a replay of a write
            // that already landed has to be REFUSED here, exactly as Postgres
            // refuses it. Answering 201 twice would let a double-drain pass a
            // test that production would fail.
            if (row.id && stored.some((r) => r.id === row.id)) {
              return route.fulfill({
                status: 409,
                headers,
                body: JSON.stringify({
                  code: '23505',
                  message: 'duplicate key value violates unique constraint',
                }),
              })
            }
            stored.push({ pr_weight: false, pr_e1rm: false, ...row })
          }
        } else if (method === 'PATCH') {
          for (const row of stored.filter((r) => matchesFilters(r, url))) {
            Object.assign(row, rows[0])
          }
        } else {
          server.rows[table] = stored.filter((r) => !matchesFilters(r, url))
        }
      }

      return route.fulfill({
        status: method === 'DELETE' ? 200 : 201,
        headers,
        body: JSON.stringify(
          method === 'DELETE'
            ? []
            : rows.map((row) => ({ id: `new-${table}`, ...row })),
        ),
      })
    }

    // Reads see the fixtures plus whatever this run has written, filtered by
    // the query string the client actually sent. Before U3b the stub answered
    // reads from a constant, which is fine for "does it render" and useless
    // for "did the workout sync" — the assertion GATE 4 is made of.
    const all = [
      ...((TABLE_RESULTS[table] ?? []) as Record<string, unknown>[]),
      ...(stored ?? []),
    ]
    return route.fulfill({
      status: 200,
      headers,
      body: JSON.stringify(all.filter((row) => matchesFilters(row, url))),
    })
  })

  return captured
}

/**
 * PostgREST's query string, as much of it as these tests use.
 *
 * `id=eq.x`, `workout_id=eq.x`, `ended_at=is.null`, `ended_at=not.is.null`.
 * Anything else is ignored rather than guessed at — a stub that pretends to
 * understand a filter it does not is worse than one that returns everything,
 * because the test then passes for the wrong reason.
 */
function matchesFilters(row: Record<string, unknown>, url: string): boolean {
  const params = new URL(url).searchParams
  for (const [column, expression] of params) {
    if (column === 'select' || column === 'order' || column === 'limit') continue
    if (expression === 'is.null') {
      if (row[column] != null) return false
    } else if (expression === 'not.is.null') {
      if (row[column] == null) return false
    } else if (expression.startsWith('eq.')) {
      if (String(row[column]) !== expression.slice(3)) return false
    }
  }
  return true
}
