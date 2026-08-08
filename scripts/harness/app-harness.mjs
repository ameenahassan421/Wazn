/**
 * The rig that lets a real build be driven without a real Supabase.
 *
 * Two scripts share it — `scripts/perf.mjs` (U7's latency budgets) and
 * `scripts/shots.mjs` (the visual-verification rule in the parity plan §4).
 * It exists as a committed file because the first visual pass, on 2026-08-07,
 * was run from an ad-hoc harness that was never kept; the plan now requires a
 * screenshot run every UI phase, and a harness nobody can re-run is a
 * requirement nobody will meet.
 *
 * Two rules are baked in here, both learned the hard way and both recorded in
 * DECISIONS.md:
 *
 *  1. **Stub every column the real RPC returns.** `strength_summary` yields
 *     `muscle_group` and `image_url` on top of the obvious ones; a short
 *     fixture makes the harness crash on itself and the crash reads as an app
 *     defect. The row builders below spell out every column.
 *  2. **Judge overlap from viewport screenshots, never `fullPage`** — that one
 *     lives in `shots.mjs`, where it applies.
 *
 * There is no network egress to Supabase from a sandboxed session anyway
 * (`docs/agent-setup.md`), so stubbing is not a shortcut — it is the only way
 * any of this runs at all.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { gzipSync } from 'node:zlib'

/** Matches the URL the scripts build against, so the stub's routes line up. */
export const SUPABASE_URL = 'https://perf.supabase.co'
export const SUPABASE_ANON_KEY = 'harness-anon-key'
/** supabase-js derives its localStorage key from the URL host. */
export const STORAGE_KEY = 'sb-perf-auth-token'
export const USER_ID = '00000000-0000-4000-8000-000000000001'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
}

/** Text assets Vercel compresses in production, so the harness must too. */
const COMPRESSIBLE = new Set([
  '.html',
  '.js',
  '.mjs',
  '.css',
  '.json',
  '.webmanifest',
  '.svg',
])

/**
 * A static server over `dist/`, on localhost so the service worker gets its
 * secure context. SPA fallback to index.html, because the app has no router
 * but does own `/join/{code}`.
 *
 * Responses are gzipped, because production is. Serving the 470 KiB main chunk
 * raw made the first cold-start measurement report 543 KiB over the wire and
 * a 3.7s time-to-interactive — a budget miss that belonged to the harness, not
 * to the app. Vercel actually negotiates brotli, which is smaller still, so
 * gzip keeps the number conservative rather than flattering.
 */
export async function serveDist(dir) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    // `normalize` plus the leading-dot check keeps a crafted path inside dist.
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
    const send = async (file) => {
      let body = await readFile(join(dir, file))
      const headers = {
        'content-type': MIME[extname(file)] ?? 'application/octet-stream',
        // The service worker must be revalidated or a second run serves the
        // first run's shell and the cold-start number becomes a lie.
        'cache-control': file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=3600',
      }
      const accepts = String(req.headers['accept-encoding'] ?? '').includes('gzip')
      if (accepts && COMPRESSIBLE.has(extname(file))) {
        body = gzipSync(body)
        headers['content-encoding'] = 'gzip'
      }
      headers['content-length'] = body.length
      res.writeHead(200, headers)
      res.end(body)
    }
    // SPA fallback for extensionless paths only — `/join/{code}` is a route,
    // `/_vercel/insights/script.js` is a file that exists only on Vercel.
    // Falling back for the latter served it index.html, which the browser
    // parsed as JavaScript and reported as `Unexpected token '<'`. That fake
    // page error would sit in every screenshot run pretending to be an app
    // defect, which is exactly the noise the §4 rule exists to avoid.
    const wantsFile = extname(rel) !== ''
    send(rel === '/' ? 'index.html' : rel.slice(1)).catch(() => {
      if (wantsFile) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found')
        return
      }
      send('index.html').catch(() => {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found')
      })
    })
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return {
    origin: `http://localhost:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

/* ── Fixtures ─────────────────────────────────────────────────────────────
   Magnitudes are chosen to exercise the thing U1c fixed: session volumes run
   four figures, weekly and monthly totals five, and the leaderboard carries
   the exact `90830.5` the visual pass photographed. A fixture that never
   passes 999 would let an ungrouped number through unnoticed. */

const MUSCLES = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
]

const LIFTS = [
  ['Bench Press (Barbell)', 'chest', 'barbell', 102.5],
  ['Squat (Barbell)', 'quads', 'barbell', 140],
  ['Deadlift (Barbell)', 'hamstrings', 'barbell', 182.5],
  ['Overhead Press (Barbell)', 'shoulders', 'barbell', 62.5],
  ['Bent Over Row (Barbell)', 'back', 'barbell', 95],
  ['Incline Bench Press (Dumbbell)', 'chest', 'dumbbell', 38],
  ['Lat Pulldown (Cable)', 'back', 'cable', 77.5],
  ['Leg Press', 'quads', 'machine', 240],
  ['Bicep Curl (Dumbbell)', 'biceps', 'dumbbell', 18],
  ['Triceps Pushdown (Cable)', 'triceps', 'cable', 45],
  ['Lateral Raise (Dumbbell)', 'shoulders', 'dumbbell', 12.5],
  ['Romanian Deadlift (Barbell)', 'hamstrings', 'barbell', 120],
]

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const iso = (daysAgo, hour = 18) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, 12, 0, 0)
  return d.toISOString()
}

export function fixtures({ empty = false } = {}) {
  const exercises = LIFTS.map(([name, muscle_group, equipment], i) => ({
    id: uuid(100 + i),
    name,
    muscle_group,
    equipment,
    is_custom: false,
    owner_id: null,
    image_url: null,
    default_rest_seconds: null,
    instructions: ['Set up.', 'Brace.', 'Move the bar.', 'Reset.'],
  }))

  if (empty) {
    return {
      exercises,
      workouts: [],
      workout_sets: [],
      sessionVolume: [],
      workoutTotals: [],
      muscleSets: [],
      strength: [],
      feed: [],
      leaderboard: [],
      profiles: [],
      follows: [],
      streak: [{ weeks: 0 }],
    }
  }

  // 148 sessions across nine months, four a week — the shape of the real
  // history this app was seeded from.
  const sessionVolume = []
  for (let i = 0; i < 148; i += 1) {
    const daysAgo = Math.floor(i * 1.75)
    sessionVolume.push({
      workout_id: uuid(1000 + i),
      started_at: iso(daysAgo),
      // 3,200-9,400 kg a session, wobbling rather than trending cleanly.
      volume_kg: 3200 + ((i * 673) % 6200) + (i % 5) * 0.5,
      set_count: 18 + (i % 11),
    })
  }

  const workouts = sessionVolume.slice(0, 14).map((s, i) => ({
    id: s.workout_id,
    user_id: USER_ID,
    name: i % 3 === 0 ? 'Upper A' : i % 3 === 1 ? 'Lower B' : null,
    started_at: s.started_at,
    ended_at: new Date(
      new Date(s.started_at).getTime() + (52 + (i % 4) * 7) * 60_000,
    ).toISOString(),
    notes: i === 0 ? 'Felt strong. Seat position 4.' : null,
  }))

  const workout_sets = []
  workouts.forEach((w, wi) => {
    LIFTS.slice(0, 4).forEach(([, , , top], li) => {
      for (let s = 0; s < 4; s += 1) {
        workout_sets.push({
          id: uuid(20000 + wi * 100 + li * 10 + s),
          workout_id: w.id,
          exercise_id: exercises[li].id,
          set_number: s + 1,
          weight_kg: s === 0 ? top * 0.6 : top - (3 - s) * 2.5,
          reps: s === 0 ? 10 : 8 - s,
          rpe: null,
          duration_seconds: null,
          distance_meters: null,
          set_type: s === 0 ? 'warmup' : 'normal',
          superset_group: null,
          pr_weight: wi === 0 && li === 0 && s === 3,
          pr_e1rm: wi === 0 && li === 0 && s === 3,
        })
      }
    })
  })

  const workoutTotals = sessionVolume.slice(0, 14).map((s) => ({
    workout_id: s.workout_id,
    volume_kg: s.volume_kg,
    set_count: s.set_count,
    record_count: s.workout_id === sessionVolume[0].workout_id ? 2 : 0,
  }))

  // Weekly sets per muscle group against the 10-20 productive band: two under,
  // one over, the rest inside, so the band actually has something to say.
  const muscleSets = MUSCLES.map((muscle_group, i) => ({
    muscle_group,
    set_count: [22, 16, 14, 12, 11, 15, 4, 9, 6, 13][i],
  }))

  const strength = LIFTS.map(([name, muscle_group, , top], i) => ({
    exercise_id: exercises[i].id,
    name,
    muscle_group,
    image_url: null,
    best_e1rm_kg: top * 1.15,
    delta_kg: i % 4 === 0 ? 5 : i % 4 === 1 ? -2.5 : i % 4 === 2 ? 0 : null,
    last_trained_at: iso(i + 1),
  }))

  const feed = [0, 1, 2].map((i) => ({
    workout_id: uuid(3000 + i),
    user_id: uuid(900 + i),
    username: ['hafsa', 'omar', 'yusuf'][i],
    display_name: ['Hafsa A.', 'Omar S.', null][i],
    name: ['Upper A', null, 'Leg day'][i],
    started_at: iso(i, 7),
    ended_at: iso(i, 8),
    volume_kg: [12480.5, 8120, 15873.5][i],
    set_count: [24, 19, 31][i],
    record_count: [1, 0, 2][i],
    like_count: [3, 0, 1][i],
    liked_by_me: i === 0,
    best_record_name: i === 0 ? 'Bench Press (Barbell)' : null,
    best_record_e1rm_kg: i === 0 ? 104.5 : null,
  }))

  // 90830.5 is the exact figure the visual pass photographed ungrouped.
  const leaderboard = [
    {
      user_id: USER_ID,
      username: 'ameen',
      display_name: 'Ameen',
      volume_kg: 90830.5,
      session_count: 4,
      is_me: true,
    },
    {
      user_id: uuid(901),
      username: 'omar',
      display_name: 'Omar S.',
      volume_kg: 52393,
      session_count: 3,
      is_me: false,
    },
    {
      user_id: uuid(900),
      username: 'hafsa',
      display_name: 'Hafsa A.',
      volume_kg: 48722,
      session_count: 3,
      is_me: false,
    },
  ]

  return {
    exercises,
    workouts,
    workout_sets,
    sessionVolume,
    workoutTotals,
    muscleSets,
    strength,
    feed,
    leaderboard,
    profiles: [
      {
        id: USER_ID,
        username: 'ameen',
        display_name: 'Ameen',
        visibility: 'followers',
      },
    ],
    follows: [{ followee_id: uuid(900) }, { followee_id: uuid(901) }],
    streak: [{ weeks: 6 }],
  }
}

/**
 * Enough PostgREST to be honest, and no more.
 *
 * Skipping this was not a shortcut, it was a wrong answer: without it every
 * `.from('workouts')` returned all fourteen fixtures, so the app matched a
 * finished session against its "is there a workout in progress?" query and
 * opened mid-workout with 224 sets on one exercise. A stub that ignores
 * filters does not simplify the harness, it simulates a different app.
 *
 * Supported because the app uses them: `eq`, `is.null`, `not.is.null`, `in`,
 * `gte`/`lte`, `order` and `limit`. Anything else is ignored rather than
 * guessed at.
 */
function applyQuery(rows, params) {
  let out = [...rows]

  for (const [key, raw] of params.entries()) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(key)) continue
    const [op, ...rest] = raw.split('.')
    const value = rest.join('.')

    if (op === 'eq') {
      out = out.filter((r) => String(r[key] ?? '') === value)
    } else if (op === 'is') {
      out = out.filter((r) => (value === 'null' ? r[key] == null : r[key] != null))
    } else if (op === 'not') {
      // `not.is.null`
      out = out.filter((r) => r[key] != null)
    } else if (op === 'in') {
      const set = new Set(
        value
          .replace(/^\(|\)$/g, '')
          .split(',')
          .map((v) => v.replace(/^"|"$/g, '')),
      )
      out = out.filter((r) => set.has(String(r[key])))
    } else if (op === 'gte') {
      out = out.filter((r) => r[key] >= value)
    } else if (op === 'lte') {
      out = out.filter((r) => r[key] <= value)
    }
  }

  const order = params.get('order')
  if (order) {
    const [col, dir = 'asc'] = order.split('.')
    out.sort((a, b) => {
      const x = a[col]
      const y = b[col]
      const cmp = x === y ? 0 : x > y ? 1 : -1
      return dir.startsWith('desc') ? -cmp : cmp
    })
  }

  const limit = params.get('limit')
  if (limit) out = out.slice(0, Number(limit))

  return out
}

/**
 * Answer every Supabase call from the fixtures. PostgREST semantics are
 * approximated, not implemented: the app only ever filters in ways
 * `applyQuery` covers, and a stub that grew a real query planner would be its
 * own bug farm.
 */
export async function installSupabaseStub(page, data, { latencyMs = 0 } = {}) {
  let inserted = 0

  await page.route(`${SUPABASE_URL}/**`, async (route) => {
    // A fulfilled route never touches the network stack, so CDP's emulated
    // latency does not apply to it. Left alone that silently turns every
    // Supabase call into a free one: the first perf run measured "tap -> set
    // on screen" at 56ms and called it a pass, when a real insert cannot cost
    // less than one round trip. `latencyMs` puts the RTT back.
    if (latencyMs > 0) await new Promise((r) => setTimeout(r, latencyMs))

    const url = new URL(route.request().url())
    const path = url.pathname
    const json = (body) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(body),
      })

    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': '*',
        },
      })
    }

    // Auth: the session is seeded into localStorage, so only refresh and
    // sign-out ever reach the wire.
    if (path.startsWith('/auth/')) return json({})

    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.slice('/rest/v1/rpc/'.length)
      const byName = {
        session_volume_history: data.sessionVolume,
        workout_totals: data.workoutTotals,
        muscle_group_weekly_sets: data.muscleSets,
        strength_summary: data.strength,
        weekly_streak: data.streak,
        social_feed: data.feed,
        weekly_leaderboard: data.leaderboard,
        exercise_usage: data.exercises.map((e, i) => ({
          exercise_id: e.id,
          set_count: 120 - i * 7,
          last_performed_at: iso(i + 1),
        })),
        // Every column `previous_session` declares, including `started_at` —
        // the first draft invented `performed_at` instead and the set-entry
        // screen rendered "PREVIOUS · NAN MONTHS AGO". That is the §4 rule
        // about stubbing every column, caught by looking at a screen.
        previous_session: data.workout_sets.slice(0, 4).map((s) => ({
          workout_id: data.workouts[1]?.id ?? uuid(1001),
          started_at: iso(3),
          set_number: s.set_number,
          weight_kg: s.weight_kg,
          reps: s.reps,
          set_type: s.set_type,
        })),
        exercise_records: [
          {
            best_weight_kg: 102.5,
            best_e1rm_kg: 117.9,
            best_session_volume_kg: 4820.5,
          },
        ],
        exercise_bests: data.strength.map((s) => ({
          exercise_id: s.exercise_id,
          name: s.name,
          best_e1rm_kg: s.best_e1rm_kg,
        })),
        resolve_invite: [],
      }
      return json(byName[fn] ?? [])
    }

    if (path.startsWith('/rest/v1/')) {
      const table = path.slice('/rest/v1/'.length)
      const method = route.request().method()

      // `.maybeSingle()` and `.single()` ask for one object, not an array —
      // on writes as well as reads. Missing that is not cosmetic: the workout
      // insert is `.select().single()`, so returning an array left
      // `workout.id` undefined, every later set POSTed without a `workout_id`,
      // and no set row ever appeared. The harness looked like a broken app.
      const wantsObject = (route.request().headers()['accept'] ?? '').includes(
        'vnd.pgrst.object',
      )

      // Writes echo a plausible row back. The Log screen reads `pr_weight` and
      // `pr_e1rm` straight off the INSERT response, so they must be present.
      if (method === 'POST' || method === 'PATCH') {
        const body = route.request().postDataJSON() ?? {}
        const rows = Array.isArray(body) ? body : [body]
        const echoed = rows.map((r) => ({
          // A counter, not a random id: two sets logged in quick succession
          // could otherwise collide and hand React duplicate keys, which
          // would look like a rendering bug in the app rather than in here.
          id: uuid(50000 + (inserted += 1)),
          user_id: USER_ID,
          started_at: new Date().toISOString(),
          ended_at: null,
          name: null,
          notes: null,
          set_number: 1,
          weight_kg: null,
          reps: null,
          rpe: null,
          duration_seconds: null,
          distance_meters: null,
          set_type: 'normal',
          superset_group: null,
          pr_weight: false,
          pr_e1rm: false,
          ...r,
        }))
        return json(wantsObject ? (echoed[0] ?? null) : echoed)
      }
      if (method === 'DELETE') return json(wantsObject ? null : [])

      const byTable = {
        exercises: data.exercises,
        workouts: data.workouts,
        workout_sets: data.workout_sets,
        profiles: data.profiles,
        follows: data.follows,
        workout_likes: [],
        routines: [],
        routine_exercises: [],
        routine_sets: [],
        exercise_notes: [],
        exercise_rest: [],
        invites: [],
      }
      const rows = applyQuery(byTable[table] ?? [], url.searchParams)
      return json(wantsObject ? (rows[0] ?? null) : rows)
    }

    return json([])
  })
}

/**
 * Put a live-looking session in localStorage before any script runs, so
 * `getSession()` resolves from storage and the app renders the authenticated
 * screens without a round trip. Anything shorter and the harness measures the
 * auth screen's cold start instead of the app's.
 */
export async function seedSession(context) {
  await context.addInitScript(
    ([key, userId]) => {
      const hour = Math.floor(Date.now() / 1000) + 3600
      window.localStorage.setItem(
        key,
        JSON.stringify({
          access_token: 'harness.access.token',
          refresh_token: 'harness-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: hour,
          user: {
            id: userId,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'harness@example.test',
            app_metadata: {},
            user_metadata: {},
            created_at: new Date().toISOString(),
          },
        }),
      )
      // The install prompt is dismissed so it does not sit over the tab bar in
      // every screenshot. The welcome screen needs no such help: it is gated on
      // having no history and no routines, so the populated fixture skips it
      // and the empty fixture shows it — which is the state worth photographing.
      window.localStorage.setItem('wazn.install.dismissed', '1')
    },
    [STORAGE_KEY, USER_ID],
  )
}
