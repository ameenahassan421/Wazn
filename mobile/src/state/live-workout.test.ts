import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type BoardExercise, seedBoard } from '@wazn/domain'

import {
  type LiveState,
  bankCurrentSet,
  resetWorkout,
  selectBoardView,
  startWorkout,
  useLiveWorkout,
} from './live-workout'

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
          data: [{ id: 'workout-prev', name: 'Push', workout_sets: config.previous }],
          error: null,
        }
      }
      if (this.table === 'workouts' && this.verb === 'insert') {
        return { data: { id: 'workout-today' }, error: null }
      }
      if (this.table === 'exercises') return { data: config.catalogue, error: null }
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
  fake.inserts.length = 0
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
    expect(workoutId).toBe('workout-today')
    // 100x5 + 100x5 + 60x8, the volume today is chasing.
    expect(targetKg).toBe(1480)
  })
})

describe('bankCurrentSet', () => {
  it('advances to the next set, and its own set number goes in the row', () => {
    expect(selectBoardView(liveState()).set?.setNumber).toBe(1)

    bankCurrentSet(102.5, 4)
    expect(lastSetRow()).toMatchObject({
      workout_id: 'workout-today',
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

  it('banks nothing more once the board is done, so a stray tap is inert', () => {
    bankCurrentSet(100, 5)
    bankCurrentSet(100, 5)
    bankCurrentSet(60, 8)
    expect(selectBoardView(liveState()).position).toBeNull()

    bankCurrentSet(999, 999)
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
  it('writes the set type the board holds, not a hardcoded normal', () => {
    liveState().board[0].sets[0].type = 'warmup'
    bankCurrentSet(60, 10)
    expect(lastSetRow().set_type).toBe('warmup')

    bankCurrentSet(100, 5)
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
      unsynced: 0,
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
      pct: 0,
      recordPace: false,
      exercise: board[0],
      set: board[0].sets[0],
    })
  })

  it('is all nulls at the finish rather than an out-of-range index', () => {
    const view = selectBoardView(stateWith([], null))
    expect(view.position).toBeNull()
    expect(view.exercise).toBeNull()
    expect(view.set).toBeNull()
    expect(view.pct).toBeNull()
    expect(view.recordPace).toBe(false)
  })

  it('flags record pace at the target, not past it', () => {
    const board = seedBoard([{ exerciseId: 'squat', name: 'Back Squat', sets: 1 }], [])
    board[0].sets[0] = { ...board[0].sets[0], weightKg: 100, reps: 5, done: true }
    expect(selectBoardView(stateWith(board, 500)).recordPace).toBe(true)
    expect(selectBoardView(stateWith(board, 501)).recordPace).toBe(false)
  })
})
