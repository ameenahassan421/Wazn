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
 * Install the stub. Returns the list the test asserts request bodies against.
 */
export async function stubSupabase(page: Page): Promise<CapturedRequest[]> {
  const captured: CapturedRequest[] = []

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
      // The Coach surfaces call these. An empty-notes answer is the app's own
      // designed empty state, so this exercises a real path rather than an
      // error one.
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
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

    if (method === 'POST' || method === 'PATCH') {
      // Writes echo back a plausible row so optimistic UI has something.
      const body = request.postDataJSON?.() ?? {}
      return route.fulfill({
        status: 201,
        headers,
        body: JSON.stringify([{ id: `new-${table}`, ...body }]),
      })
    }

    // The one filter the stub actually reads. LogScreen asks for a workout
    // with `ended_at is null` to decide between "Start workout" and resuming;
    // returning the finished ones for that query would put the smoke run in a
    // state a new user never sees, and hide the start button the payload
    // assertions need.
    if (table === 'workouts' && url.includes('ended_at=is.null')) {
      return route.fulfill({ status: 200, headers, body: '[]' })
    }

    return route.fulfill({
      status: 200,
      headers,
      body: JSON.stringify(TABLE_RESULTS[table] ?? []),
    })
  })

  return captured
}
