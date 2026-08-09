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

/**
 * The free slug the AI layer actually reaches first. `moonshotai/kimi-k2.5` is
 * the paid fallback and has never returned a successful response through this
 * codebase, so a fixture naming it would be fiction (STATUS, DECISIONS.md).
 */
const MODEL = 'nvidia/nemotron-3-super-120b-a12b:free'

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

export function fixtures({ empty = false, active = false } = {}) {
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
      // What `coach-notes` really returns for an account with no history: a
      // 200 with no insights and `model: 'none'`. It does not call the model
      // and it does not spend a regenerate — two users burned their weekly one
      // on an empty account before that was true. An empty `insights` array
      // IS the client's empty state, so this is the fixture that shoots it.
      coachNotes: {
        review: null,
        insights: [],
        generatedAt: iso(0),
        model: 'none',
        cached: false,
        regeneratesLeft: 1,
      },
      // The empty account's coach, which is the case B1 is most careful about:
      // `session_brief()` returns a block with no target and no routine, the
      // skeleton composes nothing from it, and the card never renders. The
      // Edge Function is stubbed with `line: null` to match — it declines
      // without spending a call, the same way `worthSaying` does.
      //
      // These MUST be present rather than omitted. `data.coachBrief[unit]`
      // would throw on an undefined stub, and a harness that crashes on its
      // own fixture reads as an app defect — rule 1 at the top of this file.
      sessionBrief: {
        unit: 'kg',
        productive_range: [10, 20],
        days_since_last: null,
        sessions_last_7: 0,
        sessions_last_28: 0,
        total_sets_90d: 0,
        due_routine: null,
        target: null,
        low_bands: [],
      },
      sessionDebrief: {
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
      coachBrief: {
        kg: {
          briefing: { surface: 'briefing', line: null },
          debrief: { surface: 'debrief', line: null },
        },
        lbs: {
          briefing: { surface: 'briefing', line: null },
          debrief: { surface: 'debrief', line: null },
        },
      },
      routinePreview: { preview: [], model: MODEL, droppedExercises: [] },
      savedRoutines: { routines: [], saved: true },
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
          /*
           * Records across several lifts and kinds. One set carried both flags
           * and nothing else carried any, which drew a one-row block: enough
           * to prove it renders, not enough to prove it orders or that a load
           * record reads differently from an estimate record.
           *
           * Only the MOST RECENT session carries them, and that is not
           * laziness. `pr_weight` means the set beat every earlier qualifying
           * set of that exercise, so the same lift cannot be flagged twice at
           * the same weight — production genuinely cannot produce the repeated
           * identical rows an earlier version of this fixture drew. A fixture
           * that shows an impossible state invites fixing a defect that is not
           * there.
           */
          pr_weight: s === 3 && wi === 0 && li < 3 && li !== 1,
          pr_e1rm: s === 3 && wi === 0 && li < 3 && li !== 0,
        })
      }
    })
  })

  /**
   * An in-progress workout, so `npm run shots` can photograph the thing v2.2
   * actually built.
   *
   * Without this the Log tab always renders the idle screen: every fixture
   * workout carries an `ended_at`, so the app's "is there one open?" query
   * matches nothing and the overview — the whole phase — is invisible to the
   * visual pass. That is the same class of hole as the missing Edge Function
   * routes, which made four screenshots of an error boundary read as normal.
   *
   * Shaped to exercise the states that are easy to get wrong: a warm-up that
   * must not take a working number, a PR badge, a set beaten and a set matched
   * against last session, an exercise with a note, a superset pair that has to
   * draw one rail and a round count, and a routine-planned block with nothing
   * logged in it at all.
   */
  const activeWorkout = {
    id: uuid(4000),
    user_id: USER_ID,
    name: 'Upper A',
    started_at: new Date(Date.now() - 48 * 60_000).toISOString(),
    ended_at: null,
    notes: null,
    routine_id: null,
    exercise_order: [
      exercises[0].id,
      exercises[6].id,
      exercises[9].id,
      exercises[3].id,
    ],
  }

  const activeSets = [
    // Bench: a warm-up, then three working sets — one up on last session, one
    // level, and the top set a record.
    [0, 60, 10, 'warmup', null, false],
    [0, 102.5, 8, 'normal', null, false],
    [0, 100, 8, 'normal', null, false],
    [0, 107.5, 5, 'normal', null, true],
    // Lat pulldown and triceps pushdown, supersetted.
    [6, 77.5, 12, 'normal', 1, false],
    [9, 45, 15, 'normal', 1, false],
    [6, 77.5, 12, 'normal', 1, false],
  ].map(([lift, weight, reps, setType, group, pr], i) => ({
    id: uuid(40000 + i),
    workout_id: activeWorkout.id,
    exercise_id: exercises[lift].id,
    set_number: i + 1,
    weight_kg: weight,
    reps,
    rpe: null,
    duration_seconds: null,
    distance_meters: null,
    set_type: setType,
    superset_group: group,
    pr_weight: pr,
    pr_e1rm: pr,
  }))

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

  /*
   * Routines, which this harness had none of, so the idle Log screen always
   * photographed its empty state and L9's rotation order and "Up next" label
   * would have shipped unseen.
   *
   * Deliberately three with different histories, because one routine proves
   * nothing about an ordering rule: one never run (which must lead), one stale,
   * one done yesterday (which must come last). `position` is descending
   * against that order so a list still sorted by `position` looks obviously
   * wrong rather than accidentally right.
   */
  const routines = [
    { name: 'Upper A', position: 0, ranDaysAgo: 1 },
    { name: 'Lower A', position: 1, ranDaysAgo: 9 },
    { name: 'Core & Conditioning', position: 2, ranDaysAgo: null },
  ].map((r, i) => ({
    id: uuid(700 + i),
    user_id: USER_ID,
    name: r.name,
    position: r.position,
    created_at: iso(120 - i),
    updated_at: iso(120 - i),
    ranDaysAgo: r.ranDaysAgo,
  }))

  // A workout per routine that has been run, so the `workouts(started_at)`
  // embed `listRoutines` reads has something real to reduce.
  const routineRuns = routines
    .filter((r) => r.ranDaysAgo !== null)
    .map((r, i) => ({
      id: uuid(750 + i),
      user_id: USER_ID,
      name: r.name,
      routine_id: r.id,
      started_at: iso(r.ranDaysAgo),
      ended_at: iso(r.ranDaysAgo),
      notes: null,
      exercise_order: null,
    }))

  return {
    exercises,
    routines: routines.map(({ ranDaysAgo: _drop, ...row }) => row),
    workouts: active
      ? [activeWorkout, ...workouts, ...routineRuns]
      : [...workouts, ...routineRuns],
    workout_sets: active ? [...activeSets, ...workout_sets] : workout_sets,
    // Migration 0008's table, read by the overview's block meta line. It was
    // stubbed as `[]` here for as long as nothing rendered it.
    exerciseNotes: [
      { user_id: USER_ID, exercise_id: exercises[0].id, note: 'seat position 4' },
    ],
    /**
     * Every column `previous_session` declares, including `started_at` — the
     * first draft invented `performed_at` and the set-entry screen rendered
     * "PREVIOUS · NAN MONTHS AGO". Deliberately NOT drawn from the active
     * workout: the real RPC excludes it, and reusing it would make every
     * row-to-row comparison in the overview read as zero.
     */
    previousSession: exercises.flatMap((exercise, i) => {
      const top = LIFTS[i][3]
      return [
        { setNumber: 1, weight: top * 0.55, reps: 10, type: 'warmup' },
        { setNumber: 2, weight: top - 2.5, reps: 8, type: 'normal' },
        { setNumber: 3, weight: top - 2.5, reps: 8, type: 'normal' },
        { setNumber: 4, weight: top - 5, reps: 6, type: 'normal' },
      ].map((row) => ({
        // `exercise_id` is not a column the real RPC returns — it takes the id
        // as a parameter. It rides along here purely so the stub can filter,
        // and the route strips nothing, which is harmless: the client reads
        // named fields.
        exercise_id: exercise.id,
        workout_id: workouts[1]?.id ?? uuid(1001),
        started_at: iso(3),
        set_number: row.setNumber,
        weight_kg: row.weight,
        reps: row.reps,
        set_type: row.type,
      }))
    }),
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
    // Three insights, because the function asks for 3-5 and the card's layout
    // has to hold the shortest allowed answer. Every `chip` is a figure that
    // appears elsewhere in these same fixtures — hamstrings at 4 sets and
    // calves at 6 are the two bars under the band in `muscleSets`. A chip that
    // disagreed with the charts would be the exact defect the chips exist to
    // make catchable, and a harness that ships one teaches the eye to ignore
    // them.
    // B2's weekly review, in the shape the function now returns. Five
    // sections, always, in contract order — a fixture that dropped one would
    // photograph the exact defect the contract exists to prevent, and the
    // screenshot would look fine.
    //
    // Every figure agrees with the other fixtures in this file, which is the
    // §4 rule about stubbing: hamstrings at 4 and calves at 6 are the two bars
    // under the band in `muscleSets`, and Bench at 102.5 is `LIFTS[0]`. A chip
    // that disagreed with the charts would be the very defect chips exist to
    // make catchable, and a harness that ships one teaches the eye to ignore
    // them.
    coachNotes: {
      review: {
        headline: 'Four sessions, hamstrings still short',
        sections: {
          adherence: {
            line: 'Four sessions this week against an average of 4.0, and you trained in all 8 of the last 8 weeks. No gap longer than 4 days.',
            chip: '4 sessions · avg 4.0/wk',
          },
          bands: {
            line: 'Hamstrings are at 4 working sets against a productive range of 10 to 20, and calves at 6. Everything else sits inside the band.',
            chip: 'hamstrings 4 · calves 6 · 10-20',
          },
          plateaus: {
            line: 'Nothing has stalled. No lift has 6 sessions without the estimate moving.',
            chip: '0 stalled · 6 session floor',
          },
          // Swapped for its pounds twin at route time — see `winsByUnit`
          // below. It is the one figure in the review that carries a unit, and
          // the real function hands the model a block already converted to
          // whichever one the header shows (`_shared/display-units.ts`).
          wins: {
            line: 'Bench Press is up 5 kg on the estimate over the last 28 days, after eight weeks flat.',
            chip: '+5 kg e1RM · 28 d',
          },
          recommendation: {
            line: 'Add two hamstring sets next week. At 4 against a range of 10 to 20 it is the largest gap you have, and it is the cheapest one to close.',
            chip: 'hamstrings 4 · target 10-20',
          },
        },
      },
      insights: null,
      generatedAt: iso(0),
      model: MODEL,
      cached: true,
      regeneratesLeft: 1,
    },

    // B1's two one-line surfaces. Both are stubbed because both are drawn by
    // `npm run shots`: the briefing sits above Start on the idle Log tab, and
    // the debrief on the finish summary.
    //
    // Keyed by UNIT as well as surface, because the real function is: the
    // model writes the sentence, so it is handed the block already converted
    // to whatever the header toggle shows (`_shared/display-units.ts`). A stub
    // that answered in kilograms regardless would photograph "102.5 kg" under
    // a header reading `lbs` — which is exactly the defect the first run of
    // this card revealed, and a fixture that reproduces it would teach the eye
    // to accept it.
    coachBrief: {
      kg: {
        briefing: {
          surface: 'briefing',
          line: 'Core & Conditioning is up. Bench Press was 102.5 kg × 5 last time, so 105 × 5 takes the estimate past 119.6.',
          chip: '105 kg × 5 · beats 119.6 e1RM',
        },
        debrief: {
          surface: 'debrief',
          line: 'Third straight Bench Press progression, and 5 kg on the estimate this month. Hamstrings are at 4 sets if you want somewhere to put Thursday.',
          chip: '3rd straight · +5 kg e1RM',
        },
      },
      lbs: {
        briefing: {
          surface: 'briefing',
          line: 'Core & Conditioning is up. Bench Press was 226 lbs × 5 last time, so 231.5 × 5 takes the estimate past 263.7.',
          chip: '231.5 lbs × 5 · beats 263.7 e1RM',
        },
        debrief: {
          surface: 'debrief',
          line: 'Third straight Bench Press progression, and 11 lbs on the estimate this month. Hamstrings are at 4 sets if you want somewhere to put Thursday.',
          chip: '3rd straight · +11 lbs e1RM',
        },
      },
    },

    /**
     * The blocks the CLIENT reads directly — `session_brief()` and
     * `session_debrief()`, migration 0021.
     *
     * These are load-bearing for the screenshots in a way the two above are
     * not. Both surfaces render their deterministic skeleton from THESE and
     * only then upgrade to the phrased line, so a run with these missing would
     * photograph no briefing card at all and read as "the card is not
     * finished" rather than "the stub is not finished". Same class of hole as
     * the missing Edge Function routes and the missing in-progress workout.
     */
    sessionBrief: {
      unit: 'kg',
      productive_range: [10, 20],
      days_since_last: 2,
      sessions_last_7: 4,
      sessions_last_28: 16,
      total_sets_90d: 604,
      /*
       * Must agree with the routine fixtures below, and it did not: this said
       * "Upper A" while the never-run "Core & Conditioning" is what both the
       * SQL rule and the list's rotation pick. A screenshot showed the briefing
       * card naming one routine above a list headed by another, which is
       * exactly the L9 defect the list ordering was built to fix, staged by the
       * harness. `days_since_run` is null because it has never been run.
       */
      due_routine: { name: 'Core & Conditioning', exercises: 5, days_since_run: null },
      target: {
        exercise: 'Bench Press (Barbell)',
        last_weight_kg: 102.5,
        last_reps: 5,
        last_e1rm: 119.6,
        best_e1rm: 119.6,
        last_done_days_ago: 6,
        next_weight_kg: 105,
        next_e1rm: 122.5,
      },
      low_bands: [
        { muscle: 'hamstrings', sets: 4 },
        { muscle: 'calves', sets: 6 },
        { muscle: 'biceps', sets: 9 },
      ],
    },
    sessionDebrief: {
      unit: 'kg',
      productive_range: [10, 20],
      found: true,
      sets: 24,
      exercises: 5,
      volume_kg: 12480.5,
      duration_min: 62,
      records: 2,
      anchor: {
        exercise: 'Bench Press (Barbell)',
        e1rm: 119.6,
        top_weight_kg: 102.5,
        top_reps: 5,
        previous_e1rm: 117.1,
        gain_since_last_e1rm: 2.5,
        progression_streak: 3,
        e1rm_28d: 119.6,
        e1rm_before_28d: 114.6,
      },
      low_band: { muscle: 'hamstrings', sets: 4 },
    },
    // Ids come from `exercises` above, because the real function validates
    // every generated exercise against the table and drops what it cannot
    // match — a preview naming an exercise that does not exist is a state the
    // app never sees. `droppedExercises` is populated for the same reason: the
    // line that reports them has to be shot at least once.
    routinePreview: {
      preview: [
        {
          name: 'Upper A',
          exercises: [
            { id: uuid(100), name: LIFTS[0][0], sets: 4, reps: 5 },
            { id: uuid(103), name: LIFTS[3][0], sets: 3, reps: 8 },
            { id: uuid(105), name: LIFTS[5][0], sets: 3, reps: 12 },
          ],
        },
        {
          name: 'Lower A',
          exercises: [
            { id: uuid(101), name: LIFTS[1][0], sets: 4, reps: 5 },
            { id: uuid(102), name: LIFTS[2][0], sets: 3, reps: 8 },
          ],
        },
      ],
      model: MODEL,
      droppedExercises: ['Nordic Curl'],
      generationsLeft: 2,
    },
    savedRoutines: {
      routines: [
        { id: uuid(700), name: 'Upper A' },
        { id: uuid(701), name: 'Lower A' },
      ],
      saved: true,
    },
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

    /*
     * `or=(pr_weight.eq.true,pr_e1rm.eq.true)`, which the Progress records
     * query uses. Without this the key fell through as a filter on a column
     * literally named "or", every row failed it, and the Records block drew
     * nothing while looking like an app with no records in it.
     */
    if (key === 'or') {
      const clauses = raw
        .replace(/^\(|\)$/g, '')
        .split(',')
        .map((clause) => clause.split('.'))
      out = out.filter((r) =>
        clauses.some(([col, clauseOp, ...v]) => {
          const want = v.join('.')
          if (clauseOp === 'eq') return String(r[col] ?? '') === want
          if (clauseOp === 'is')
            return want === 'null' ? r[col] == null : r[col] != null
          // An unsupported operator must not silently pass every row: a stub
          // that answers a filter it does not implement is worse than one that
          // answers nothing, because the result looks real.
          throw new Error(`harness stub: unsupported or() operator ${clauseOp}`)
        }),
      )
      continue
    }

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
/**
 * The pounds twin of the review's one unit-carrying section.
 *
 * The review is stored once, in kilograms, and this swaps the single section
 * whose figures are weights. Cheap, and it keeps the fixture from stating
 * "+5 e1RM" under a header reading `lbs` — the defect the briefing card's
 * first screenshot revealed, which would otherwise reappear one tab over.
 */
function withReviewUnit(notes, unit) {
  if (unit !== 'lbs' || !notes?.review) return notes
  return {
    ...notes,
    review: {
      ...notes.review,
      sections: {
        ...notes.review.sections,
        wins: {
          line: 'Bench Press is up 11 lbs on the estimate over the last 28 days, after eight weeks flat.',
          chip: '+11 lbs e1RM · 28 d',
        },
      },
    },
  }
}

/**
 * Cut the project's network, mid-run.
 *
 * A mutable holder rather than a parameter, because the offline states worth
 * photographing only exist AFTER the app has loaded — the point is a phone
 * that walks into a basement, not one that never had signal. Flip it between
 * screenshots.
 */
export function offlineSwitch() {
  return { offline: false }
}

export async function installSupabaseStub(
  page,
  data,
  { latencyMs = 0, network = { offline: false } } = {},
) {
  let inserted = 0

  await page.route(`${SUPABASE_URL}/**`, async (route) => {
    // What a dead radio does: nothing. Chromium turns this into the
    // `TypeError: Failed to fetch` the app classifies as offline rather than
    // as a refusal.
    if (network.offline) return route.abort('internetdisconnected')

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

    // The Edge Functions. Absent from the first version of this harness, and
    // the omission cost more than it looks: unmatched paths fell through to
    // `json([])`, so `fetchCoachNotes` got an array, `notes.generatedAt` was
    // undefined, `Intl.DateTimeFormat` threw `RangeError: Invalid time value`,
    // and EVERY `npm run shots` run rendered the Coach tab as the error
    // boundary. Four screenshots of "Something broke", taken repeatedly, read
    // as normal — which is the exact failure the screenshot rule exists to
    // prevent. Rule 1 at the top of this file is about columns; it is really
    // about responses, and a function is a response too.
    if (path.startsWith('/functions/v1/')) {
      const fn = path.slice('/functions/v1/'.length).split('?')[0]
      if (fn === 'coach-notes') {
        return json(withReviewUnit(data.coachNotes, url.searchParams.get('unit')))
      }
      if (fn === 'coach-brief') {
        // One function, two surfaces, chosen by the body — same shape as
        // generate-routine's two verbs below.
        const body = route.request().postDataJSON() ?? {}
        const unit = body.unit === 'lbs' ? 'lbs' : 'kg'
        return json({
          ...data.coachBrief[unit][body.surface === 'debrief' ? 'debrief' : 'briefing'],
          generatedAt: iso(0),
          model: MODEL,
          cached: true,
        })
      }
      if (fn === 'generate-routine') {
        // One function, two verbs: a body carrying `save` is the write, and it
        // returns saved routines rather than a preview.
        const body = route.request().postDataJSON() ?? {}
        return json(body.save ? data.savedRoutines : data.routinePreview)
      }
      return json({})
    }

    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.slice('/rest/v1/rpc/'.length)

      // Per exercise, because the overview ghosts last session on every row and
      // compares every committed row against it. A stub that answered with the
      // same four bench sets for every lift made a cable pulldown read as 44 kg
      // down on itself — a fixture inventing a defect, which is the same class
      // of noise as the `/functions/v1/*` hole this file already documents.
      if (fn === 'previous_session') {
        const exerciseId = (route.request().postDataJSON() ?? {}).p_exercise_id
        return json(
          (data.previousSession ?? []).filter((r) => r.exercise_id === exerciseId),
        )
      }

      // `session_brief()` and `session_debrief()` return a single jsonb object,
      // not a set of rows, so they answer with the object itself rather than
      // through `byName` below — which wraps everything in an array. Getting
      // that wrong would hand `fetchBriefBlock` an array, `block.target` would
      // be undefined, and the card would silently render nothing.
      if (fn === 'session_brief') return json(data.sessionBrief)
      if (fn === 'session_debrief') return json(data.sessionDebrief)

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
        previous_session: data.previousSession ?? [],
        // Every column the real function returns. The first three were here
        // and the last three were not, so `total_sets > 0` compared undefined
        // and the detail page said "Not logged yet" directly above a full set
        // of records. Same §4 rule as `previous_session` above, same fix.
        exercise_records: [
          {
            best_weight_kg: 102.5,
            best_e1rm_kg: 117.9,
            best_session_volume_kg: 4820.5,
            total_sets: 149,
            total_sessions: 38,
            first_logged_at: iso(280),
          },
        ],
        // One point per session, oldest first, climbing with a dip in it — a
        // monotonic fixture would hide a chart that sorts wrong, and a flat
        // one would hide the verdict sentence entirely.
        exercise_1rm_history: [
          98.4, 101.2, 100.1, 104.7, 103.9, 108.3, 112.6, 117.9,
        ].map((kg, i) => ({
          workout_id: `1rm-${i}`,
          started_at: iso(240 - i * 30),
          best_1rm_kg: kg,
        })),
        // The real function's buckets and en-dashes, not invented ones: a
        // fixture that says "1-5" would not catch the page rendering a label
        // the database never emits.
        exercise_rep_distribution: [
          { bucket: '1–5', bucket_order: 1, set_count: 31 },
          { bucket: '6–8', bucket_order: 2, set_count: 64 },
          { bucket: '9–12', bucket_order: 3, set_count: 39 },
          { bucket: '13–15', bucket_order: 4, set_count: 11 },
          { bucket: '16+', bucket_order: 5, set_count: 4 },
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
        routines: data.routines ?? [],
        routine_exercises: [],
        routine_sets: [],
        exercise_notes: data.exerciseNotes ?? [],
        exercise_rest: [],
        invites: [],
      }
      let rows = applyQuery(byTable[table] ?? [], url.searchParams)

      /*
       * PostgREST embeds. `select=...,workouts!inner(id, started_at)` returns
       * each set with a nested `workouts` object, and this stub returned flat
       * rows — so `row.workouts.id` threw inside the exercise detail page's
       * `.then`, `setHistory` was never reached, and the page sat on
       * "Loading…" with the rep-max ladder absent. Two uncaught page errors
       * and two missing sections, all from one unsupported query shape.
       *
       * Only attached when the select actually asks for it, so the stub keeps
       * returning what the real API would.
       */
      const select = url.searchParams.get('select') ?? ''
      if (table === 'workout_sets' && select.includes('workouts')) {
        const byId = new Map(data.workouts.map((w) => [w.id, w]))
        rows = rows.map((r) => {
          const w = byId.get(r.workout_id)
          return { ...r, workouts: w ? { id: w.id, started_at: w.started_at } : null }
        })
      }
      // The reverse direction: `routines?select=*,workouts(started_at)` is a
      // one-to-many, so the embed is an ARRAY. Returning an object here would
      // let `listRoutines` iterate a non-iterable and take the Log tab down.
      if (table === 'routines' && select.includes('workouts')) {
        rows = rows.map((r) => ({
          ...r,
          workouts: data.workouts
            .filter((w) => w.routine_id === r.id)
            .map((w) => ({ started_at: w.started_at })),
        }))
      }

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
