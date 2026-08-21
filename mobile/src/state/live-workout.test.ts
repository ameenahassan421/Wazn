import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type BoardExercise, seedBoard } from '@wazn/domain'

import AsyncStorage from '@react-native-async-storage/async-storage'

// Imported by PATH, not through the alias: the `__reset` helpers exist only on
// the stubs, so the alias's real types would reject them. Same file either
// way — vite resolves both specifiers to it — so this is the same module
// instance the store is using.
import { __reset as resetStorage } from '../../test/stubs/async-storage'
import { __reset as resetIds } from '../../test/stubs/expo-crypto'

import {
  CHECKPOINT_KEY,
  type LiveState,
  bankCurrentSet,
  finishWorkout,
  flushPending,
  resetWorkout,
  restoreWorkout,
  selectBoardView,
  startWorkout,
  useLiveWorkout,
} from './live-workout'

/** The id `test/stubs/expo-crypto.ts` mints on its nth call. Sequential on
 *  purpose: every assertion here is about identity, and a random id could only
 *  ever be checked for shape. */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/**
 * The fake Supabase client, and why the store gets one rather than a refactor.
 *
 * `live-workout` reaches the network in exactly two places and neither is on
 * the decision path: `startWorkout` reads the last session to seed the board,
 * and `persistSet` writes the row. What this file needs to assert is what
 * lands in `workout_sets`, so the client is replaced with a chainable stub
 * that records every insert. It is a stub of the query builder's SHAPE only:
 * each method returns the builder and awaiting it resolves a canned result
 * keyed by table and verb, which is enough because the store never inspects a
 * filter it applied.
 *
 * `vi.hoisted` because a `vi.mock` factory runs before this module's top-level
 * bindings are initialised, so a plain `const` above it would be in its own
 * temporal dead zone by the time the store imports the client.
 */
const fake = vi.hoisted(() => {
  const inserts: { table: string; row: Record<string, unknown> }[] = []

  /** What the fake account did last session, rewritten per test. */
  const config = {
    previous: [] as {
      exercise_id: string
      set_number: number
      weight_kg: number | null
      reps: number | null
      set_type: string
    }[],
    catalogue: [] as { id: string; name: string }[],
    /** Make every `workout_sets` insert fail, to stand in for a basement. */
    failSets: false,
    /** Make it fail with a duplicate key, which is a SUCCESS to the queue. */
    duplicateSets: false,
    /** Today's row in `daily_checkins`, or null for "not asked". */
    checkIn: null as string | null,
    /** When the last finished session started. Null on day one. */
    lastSessionAt: null as string | null,
  }

  class Query {
    private verb: 'select' | 'insert' | 'update' = 'select'

    constructor(private readonly table: string) {}

    select() {
      return this
    }
    eq() {
      return this
    }
    not() {
      return this
    }
    order() {
      return this
    }
    limit() {
      return this
    }
    in() {
      return this
    }
    single() {
      return this
    }
    maybeSingle() {
      return this
    }
    insert(row: Record<string, unknown>) {
      this.verb = 'insert'
      inserts.push({ table: this.table, row })
      return this
    }
    update() {
      this.verb = 'update'
      return this
    }

    then<T>(onFulfilled: (r: { data: unknown; error: unknown }) => T): Promise<T> {
      return Promise.resolve(this.result()).then(onFulfilled)
    }

    private result(): { data: unknown; error: unknown } {
      if (this.table === 'workouts' && this.verb === 'select') {
        return {
          data: [
            {
              id: 'workout-prev',
              name: 'Push',
              started_at: config.lastSessionAt,
              workout_sets: config.previous,
            },
          ],
          error: null,
        }
      }
      // `maybeSingle`, so a row or null — never an array. Null is "not asked
      // today", which `computeReadiness` scores as neutral.
      if (this.table === 'daily_checkins') {
        return {
          data: config.checkIn === null ? null : { state: config.checkIn },
          error: null,
        }
      }
      if (this.table === 'workouts' && this.verb === 'insert') {
        return { data: { id: 'workout-today' }, error: null }
      }
      if (this.table === 'exercises') return { data: config.catalogue, error: null }
      if (this.verb === 'insert' && this.table === 'workout_sets') {
        if (config.duplicateSets) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } }
        }
        if (config.failSets) {
          return { data: null, error: { code: '08006', message: 'connection failure' } }
        }
      }
      return { data: null, error: null }
    }
  }

  return {
    inserts,
    config,
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: 'lifter' } } }) },
      from: (table: string) => new Query(table),
    },
  }
})

vi.mock('@/services/supabase', () => ({ supabase: fake.supabase }))

/**
 * Reading the store, without standing up a renderer to do it.
 *
 * `live-workout` exposes itself through `useLiveWorkout` and nothing else,
 * which is the right shape for the app and leaves a test with no getter. So
 * `useSyncExternalStore` is replaced by the one line of its contract this file
 * depends on: call the snapshot getter, return what it gives. Nothing below
 * tests React, and rendering a probe component to read one object would put a
 * second framework, plus `react-dom`, underneath every assertion here.
 */
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useSyncExternalStore: <T>(_subscribe: unknown, getSnapshot: () => T) => getSnapshot(),
}))

/** Not named `use...`: outside a component it is a plain read. */
const liveState = useLiveWorkout

/** The last row this store tried to write to `workout_sets`. */
function lastSetRow(): Record<string, unknown> {
  const rows = fake.inserts.filter((i) => i.table === 'workout_sets')
  return rows[rows.length - 1].row
}

beforeEach(async () => {
  resetWorkout()
  resetStorage()
  resetIds()
  fake.inserts.length = 0
  fake.config.failSets = false
  fake.config.duplicateSets = false
  fake.config.checkIn = null
  fake.config.lastSessionAt = null
  fake.config.previous = [
    {
      exercise_id: 'squat',
      set_number: 1,
      weight_kg: 100,
      reps: 5,
      set_type: 'normal',
    },
    {
      exercise_id: 'squat',
      set_number: 2,
      weight_kg: 100,
      reps: 5,
      set_type: 'normal',
    },
    { exercise_id: 'bench', set_number: 1, weight_kg: 60, reps: 8, set_type: 'normal' },
  ]
  fake.config.catalogue = [
    { id: 'squat', name: 'Back Squat' },
    { id: 'bench', name: 'Bench Press' },
  ]
  await startWorkout()
})

describe('startWorkout', () => {
  it('seeds the board from the last session, one exercise per lift', () => {
    const { board, workoutId, targetKg } = liveState()
    expect(board.map((e) => e.name)).toEqual(['Back Squat', 'Bench Press'])
    expect(board[0].sets).toHaveLength(2)
    expect(board[0].sets[0].previousKg).toBe(100)
    // The FIRST uuid this session mints, not the one the server returned.
    // `startWorkout` generates it before its first await so a set banked in
    // that window has something to reference — the window in which sets were
    // previously counted and dropped.
    expect(workoutId).toBe(uuid(1))
    // 100x5 + 100x5 + 60x8, the volume today is chasing.
    expect(targetKg).toBe(1480)
  })
})

/**
 * The check-in used to be write-only.
 *
 * Home stored a tap in `daily_checkins` and computed a `readiness` that grep
 * proved no screen read, while this store seeded `verdictFor` from
 * `computeReadiness({ checkIn: null, daysRested: null })` — a hardcoded
 * Normal. Every gate was green: the row was written, the arithmetic was
 * correct, and the value went nowhere. These assertions are what a green wall
 * could not say.
 */
describe('readiness is seeded from the account, not hardcoded', () => {
  /**
   * `resetWorkout()` first, every time, and it is not ceremony.
   *
   * The file's `beforeEach` ends with `await startWorkout()`, so a session is
   * already open when a test body runs — and `startWorkout` returns
   * immediately on an active one, which is real behaviour worth keeping (a
   * double-tap on Start must not reseed a board mid-session). Without the
   * reset these four assertions read a workout opened with the DEFAULT config
   * and pass or fail for reasons that have nothing to do with the check-in.
   * That is exactly how they were first written, and three of the four passed.
   */
  async function startFresh(checkIn: string | null, daysAgo: number | null) {
    resetWorkout()
    fake.config.checkIn = checkIn
    fake.config.lastSessionAt =
      daysAgo === null
        ? null
        : new Date(Date.now() - daysAgo * 86_400_000).toISOString()
    await startWorkout()
  }

  it('is normal when nothing was asked and there is no history', async () => {
    await startFresh(null, null)
    expect(liveState().readiness).toBe('normal')
  })

  // Three days is the neutral rest band — neither `>= 4` nor `<= 1` — so
  // these two isolate the tap itself.
  it('is light on the tap alone, because the lifter volunteered it', async () => {
    await startFresh('drained', 3)
    expect(liveState().readiness).toBe('light')
  })

  it('is loaded when fresh and rested, which needs BOTH', async () => {
    await startFresh('fresh', 5)
    expect(liveState().readiness).toBe('loaded')
    // `fresh` is +2 and `loaded` needs +3: the thresholds are asymmetric on
    // purpose, because easing off costs two sets and pushing on costs a
    // session. So the same tap after three days is not enough.
    await startFresh('fresh', 3)
    expect(liveState().readiness).toBe('normal')
  })

  it('lets a long rest offset a drained tap, rather than either winning', async () => {
    await startFresh('drained', 5)
    expect(liveState().readiness).toBe('normal')
  })

  it('ignores a state the app has never heard of rather than trusting it', async () => {
    // A row can outlive the build that wrote it. `asCheckIn` is the widener,
    // and a bad value must read as "not asked", never as a fourth state.
    await startFresh('obliterated', 5)
    expect(liveState().readiness).toBe('normal')
  })
})

describe('bankCurrentSet', () => {
  it('advances to the next set, and its own set number goes in the row', async () => {
    expect(selectBoardView(liveState()).set?.setNumber).toBe(1)

    bankCurrentSet(102.5, 4)
    await flushPending()
    expect(lastSetRow()).toMatchObject({
      workout_id: uuid(1),
      exercise_id: 'squat',
      set_number: 1,
      weight_kg: 102.5,
      reps: 4,
    })

    const after = selectBoardView(liveState())
    expect(after.position).toEqual({ exerciseIndex: 0, setIndex: 1 })
    expect(after.set?.setNumber).toBe(2)
    expect(after.banked).toBe(410)
  })

  it('walks into the next exercise once the current one is finished', () => {
    bankCurrentSet(100, 5)
    bankCurrentSet(100, 5)
    expect(selectBoardView(liveState()).exercise?.name).toBe('Bench Press')
  })

  it('banks nothing more once the board is done, so a stray tap is inert', async () => {
    bankCurrentSet(100, 5)
    bankCurrentSet(100, 5)
    bankCurrentSet(60, 8)
    expect(selectBoardView(liveState()).position).toBeNull()

    bankCurrentSet(999, 999)
    await flushPending()
    expect(fake.inserts.filter((i) => i.table === 'workout_sets')).toHaveLength(3)
  })

  /**
   * The regression that matters most in this file.
   *
   * `persistSet` sent a literal `'normal'` until 2026-08-19, so a warm-up
   * banked on the phone landed as a working set and stayed one: `epley`
   * refuses warm-ups, `exercise_bests` and migration 0009's record trigger
   * filter on `set_type <> 'warmup'`, and none of them can tell afterwards.
   * The board's own type has to reach the row.
   *
   * The type is set by hand here because `seedBoard` mints every set
   * `'normal'` and no native control changes it yet. That is the point: the
   * plumbing is being pinned ahead of the control, so the control cannot
   * arrive on top of a silent corruption.
   */
  it('writes the set type the board holds, not a hardcoded normal', async () => {
    liveState().board[0].sets[0].type = 'warmup'
    bankCurrentSet(60, 10)
    await flushPending()
    expect(lastSetRow().set_type).toBe('warmup')

    bankCurrentSet(100, 5)
    await flushPending()
    expect(lastSetRow().set_type).toBe('normal')
  })
})

describe('rest', () => {
  it('starts a rest after a working set', () => {
    const before = Date.now()
    bankCurrentSet(100, 5)
    const { restEndsAt, restTotal } = liveState()
    expect(restTotal).toBe(120)
    expect(restEndsAt).not.toBeNull()
    expect(restEndsAt as number).toBeGreaterThanOrEqual(before + 120_000)
  })

  it('starts nothing after a warm-up, because nobody rests off an empty bar', () => {
    liveState().board[0].sets[0].type = 'warmup'
    bankCurrentSet(60, 10)
    expect(liveState().restEndsAt).toBeNull()
    expect(liveState().restTotal).toBe(0)
  })

  it('leaves a running rest alone when the next set is a warm-up', () => {
    bankCurrentSet(100, 5)
    expect(liveState().restEndsAt).not.toBeNull()

    liveState().board[0].sets[1].type = 'warmup'
    bankCurrentSet(60, 10)
    expect(liveState().restEndsAt).toBeNull()
  })
})

describe('selectBoardView', () => {
  function stateWith(board: BoardExercise[], targetKg: number | null): LiveState {
    return {
      status: 'active',
      workoutId: 'w',
      startedAt: 0,
      name: '',
      board,
      targetKg,
      readiness: 'normal',
      userId: null,
      pending: [],
      sealed: false,
      restEndsAt: null,
      restTotal: 0,
    }
  }

  it('hands the screen the current exercise and set, so it does no maths', () => {
    const board = seedBoard([{ exerciseId: 'squat', name: 'Back Squat', sets: 2 }], [])
    const view = selectBoardView(stateWith(board, 1000))
    expect(view).toEqual({
      position: { exerciseIndex: 0, setIndex: 0 },
      banked: 0,
      exercise: board[0],
      set: board[0].sets[0],
    })
  })

  it('is all nulls at the finish rather than an out-of-range index', () => {
    const view = selectBoardView(stateWith([], null))
    expect(view.position).toBeNull()
    expect(view.exercise).toBeNull()
    expect(view.set).toBeNull()
  })

  /*
   * A third case asserted `pct` and `recordPace` — the momentum bar's two
   * figures, which `selectBoardView` stopped returning on 2026-08-21 because
   * the board dropped the bar in the prototype port and nothing else ever read
   * them. `momentumPct` itself is still in the shared domain, still drawn by
   * the web, and still covered by `src/lib`'s own suite. This file was the only
   * thing keeping the native copies alive.
   */
})

/**
 * GATE 4, and the reason this store was rewritten on 2026-08-21.
 *
 * Before it, a set banked with no signal was counted on `unsynced` and never
 * sent again, and the whole store was a module variable that died with the
 * process. In a basement gym — the app's stated use case — a workout was lost.
 * These four assertions are the ones that would have failed then.
 */
describe('durability', () => {
  it('keeps a set that could not be sent, and sends it when the network returns', async () => {
    fake.config.failSets = true
    bankCurrentSet(100, 5)
    await flushPending()

    // On the board, and still on the phone.
    expect(selectBoardView(liveState()).banked).toBe(500)
    expect(liveState().pending).toHaveLength(1)
    expect(fake.inserts.filter((i) => i.table === 'workout_sets')).toHaveLength(1)

    fake.config.failSets = false
    await flushPending()

    expect(liveState().pending).toHaveLength(0)
    // The RETRY carries the id the first attempt used, which is what makes a
    // replay a 23505 instead of a second row.
    const attempts = fake.inserts.filter((i) => i.table === 'workout_sets')
    expect(attempts).toHaveLength(2)
    expect(attempts[0].row.id).toBe(attempts[1].row.id)
  })

  it('treats a duplicate key as sent, because it means an earlier attempt landed', async () => {
    fake.config.duplicateSets = true
    bankCurrentSet(100, 5)
    await flushPending()

    // 23505 is success. The opposite reading is how an idempotent write turns
    // into a queue that never empties.
    expect(liveState().pending).toHaveLength(0)
  })

  it('holds the queue in order — a set that cannot go must not let the next one past', async () => {
    fake.config.failSets = true
    bankCurrentSet(100, 5)
    bankCurrentSet(100, 5)
    await flushPending()
    expect(liveState().pending.map((p) => p.setNumber)).toEqual([1, 2])

    fake.config.failSets = false
    await flushPending()
    const sent = fake.inserts
      .filter((i) => i.table === 'workout_sets')
      .map((i) => i.row.set_number)
    expect(sent.slice(-2)).toEqual([1, 2])
  })

  it('comes back after the app is killed, board and queue intact', async () => {
    fake.config.failSets = true
    bankCurrentSet(100, 5)
    await flushPending()

    // What the OS would find on disk. Read through the same key the app writes.
    const saved = await AsyncStorage.getItem(CHECKPOINT_KEY)
    expect(saved).not.toBeNull()

    // The kill: the module's state is gone, the disk is not. `resetWorkout`
    // would ALSO clear the checkpoint — correctly, since a reset workout must
    // not come back — so the process death is staged by writing the saved
    // document back after the reset.
    resetWorkout()
    expect(liveState().status).toBe('idle')
    await AsyncStorage.setItem(CHECKPOINT_KEY, saved as string)

    fake.config.failSets = false
    await restoreWorkout()

    expect(liveState().status).toBe('active')
    expect(selectBoardView(liveState()).banked).toBe(500)
    // Restoring also flushes: the set that could not be sent in the gym goes
    // out the moment the app is opened again.
    expect(liveState().pending).toHaveLength(0)
  })

  it('does not lose sets when a workout is finished offline', async () => {
    fake.config.failSets = true
    bankCurrentSet(100, 5)
    await finishWorkout()

    expect(liveState().status).toBe('finished')
    expect(liveState().pending).toHaveLength(1)
  })
})
