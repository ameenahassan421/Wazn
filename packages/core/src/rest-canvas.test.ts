import { describe, expect, it } from 'vitest'
import { pickRestCard, restCanvasEnabled, setRestCanvasEnabled } from './rest-canvas'
import type { RestBlock, RestCanvasInput } from './rest-canvas'
import { buildBlock } from './plan'
import type { PlannedSet } from './plan'
import type { PreviousSessionRow, SetType, WorkoutSet } from './types'

function set(
  over: Partial<WorkoutSet> & { exercise_id: string; set_number: number },
): WorkoutSet {
  return {
    id: `s${over.exercise_id}${over.set_number}`,
    workout_id: 'w1',
    weight_kg: 100,
    reps: 8,
    rpe: null,
    duration_seconds: null,
    distance_meters: null,
    set_type: 'normal' as SetType,
    superset_group: null,
    pr_weight: false,
    pr_e1rm: false,
    ...over,
  }
}

function previous(rows: Partial<PreviousSessionRow>[]): PreviousSessionRow[] {
  return rows.map((r, i) => ({
    workout_id: 'w0',
    started_at: '2026-08-01T10:00:00Z',
    set_number: i + 1,
    weight_kg: 100,
    reps: 8,
    set_type: 'normal' as SetType,
    ...r,
  }))
}

function block(
  exerciseId: string,
  name: string,
  opts: {
    sets?: WorkoutSet[]
    previous?: PreviousSessionRow[]
    plan?: PlannedSet[]
  } = {},
): RestBlock {
  return {
    ...buildBlock({
      exerciseId,
      sets: opts.sets ?? [],
      previous: opts.previous ?? [],
      plan: opts.plan,
    }),
    exercise: { name },
  }
}

function input(over: Partial<RestCanvasInput> = {}): RestCanvasInput {
  return {
    unit: 'kg',
    restingExerciseId: null,
    blocks: [],
    sets: [],
    crew: null,
    ...over,
  }
}

describe('pickRestCard — the target card', () => {
  it('names the next set on the lift the rest belongs to', () => {
    const sets = [set({ exercise_id: 'e1', set_number: 1, weight_kg: 100, reps: 8 })]
    const card = pickRestCard(
      input({
        restingExerciseId: 'e1',
        sets,
        blocks: [
          block('e1', 'Bench Press (Barbell)', {
            sets,
            previous: previous([
              { weight_kg: 95 },
              { weight_kg: 95 },
              { weight_kg: 95 },
            ]),
          }),
        ],
      }),
    )
    expect(card?.kind).toBe('target')
    expect(card?.kicker).toBe('Next up · set 2')
    expect(card?.subject).toBe('Bench Press (Barbell)')
    expect(card?.value).toBe('100 kg × 8')
    expect(card?.note).toBe('+5 kg on last session')
  })

  /**
   * The one comparison a lifter wants BEFORE the set rather than after it: a
   * bar loaded lighter than last week is a decision, and the canvas is the last
   * surface that can mention it while it is still cheap to change.
   */
  it('says so when the target is below last session', () => {
    const sets = [set({ exercise_id: 'e1', set_number: 1, weight_kg: 90, reps: 8 })]
    const card = pickRestCard(
      input({
        restingExerciseId: 'e1',
        sets,
        blocks: [
          block('e1', 'Squat (Barbell)', {
            sets,
            previous: previous([{ weight_kg: 100 }, { weight_kg: 100 }]),
          }),
        ],
      }),
    )
    expect(card?.note).toBe('−10 kg on last session')
  })

  it('credits reps when the weight is unchanged', () => {
    const sets = [set({ exercise_id: 'e1', set_number: 1, weight_kg: 100, reps: 10 })]
    const card = pickRestCard(
      input({
        restingExerciseId: 'e1',
        sets,
        blocks: [
          block('e1', 'Row', {
            sets,
            previous: previous([{ reps: 8 }, { reps: 8 }]),
          }),
        ],
      }),
    )
    expect(card?.note).toBe('+2 reps on last session')
  })

  it('says "same as last session" when nothing moved', () => {
    const sets = [set({ exercise_id: 'e1', set_number: 1 })]
    const card = pickRestCard(
      input({
        restingExerciseId: 'e1',
        sets,
        blocks: [block('e1', 'Row', { sets, previous: previous([{}, {}]) })],
      }),
    )
    expect(card?.note).toBe('Same as last session')
  })

  it('carries no chip at all when there is no previous session to compare', () => {
    const sets = [set({ exercise_id: 'e1', set_number: 1 })]
    const card = pickRestCard(
      input({
        restingExerciseId: 'e1',
        sets,
        blocks: [
          block('e1', 'Row', {
            sets,
            plan: [
              { reps: 8, setType: 'normal' },
              { reps: 8, setType: 'normal' },
            ],
          }),
        ],
      }),
    )
    expect(card?.kind).toBe('target')
    expect(card?.note).toBeUndefined()
  })

  /** The canvas shows what one tap on the board would commit, in that unit. */
  it('renders the target in the display unit', () => {
    const sets = [set({ exercise_id: 'e1', set_number: 1, weight_kg: 100, reps: 5 })]
    const card = pickRestCard(
      input({
        unit: 'lbs',
        restingExerciseId: 'e1',
        sets,
        blocks: [
          block('e1', 'Deadlift (Barbell)', { sets, previous: previous([{}, {}]) }),
        ],
      }),
    )
    expect(card?.value).toBe('220.5 lbs × 5')
  })

  /** A superset rests on the round, and the next thing under the bar is B. */
  it('talks about the partner when the rest belongs to a superset round', () => {
    const sets = [
      set({ exercise_id: 'a', set_number: 1, superset_group: 1 }),
      set({ exercise_id: 'b', set_number: 1, superset_group: 1 }),
    ]
    const card = pickRestCard(
      input({
        restingExerciseId: 'b',
        sets,
        blocks: [
          block('a', 'Press', { sets: [sets[0]], previous: previous([{}, {}]) }),
          block('b', 'Pull', { sets: [sets[1]], previous: previous([{}, {}]) }),
        ],
      }),
    )
    expect(card?.subject).toBe('Pull')
  })

  it('falls through when the block has no ghost row left', () => {
    // One planned set, and it is done — nothing is coming on this lift.
    const sets = [set({ exercise_id: 'e1', set_number: 1 })]
    const card = pickRestCard(
      input({
        restingExerciseId: 'e1',
        sets,
        blocks: [block('e1', 'Row', { sets, previous: previous([{}]) })],
      }),
    )
    expect(card?.kind).not.toBe('target')
  })
})

describe('pickRestCard — the other three', () => {
  const finished = [set({ exercise_id: 'e1', set_number: 1, pr_e1rm: true })]
  const done = [block('e1', 'Row', { sets: finished, previous: previous([{}]) })]

  it('reports records once the server has confirmed them', () => {
    const card = pickRestCard(
      input({ restingExerciseId: 'e1', sets: finished, blocks: done }),
    )
    expect(card).toMatchObject({
      kind: 'record',
      kicker: 'Record',
      subject: 'Row',
      value: '100 kg × 8',
    })
    // One record needs no count beside it; the chip is for the second onward.
    expect(card?.note).toBeUndefined()
  })

  it('shows the crew when there is no record and someone trained', () => {
    const plain = [set({ exercise_id: 'e1', set_number: 1 })]
    const card = pickRestCard(
      input({
        restingExerciseId: 'e1',
        sets: plain,
        blocks: [block('e1', 'Row', { sets: plain, previous: previous([{}]) })],
        crew: { lifters: 3, best: { name: 'hafsa', volumeKg: 4200, records: 1 } },
      }),
    )
    expect(card).toMatchObject({
      kind: 'crew',
      value: '3 trained today',
      note: 'hafsa · 4,200 kg',
    })
  })

  it('falls back to the session when nothing else has news', () => {
    const plain = [set({ exercise_id: 'e1', set_number: 1, weight_kg: 100, reps: 8 })]
    const card = pickRestCard(
      input({
        restingExerciseId: 'e1',
        sets: plain,
        blocks: [block('e1', 'Row', { sets: plain, previous: previous([{}]) })],
        crew: { lifters: 0, best: null },
      }),
    )
    expect(card).toMatchObject({
      kind: 'session',
      value: '800 kg',
      note: '1 of 1 sets',
    })
  })

  /**
   * §8-E1: "If the deterministic layer has nothing worth saying, the canvas
   * shows the plain timer exactly as today. Silence is a valid state and the
   * better default."
   */
  it('returns null rather than inventing something to say', () => {
    expect(pickRestCard(input())).toBeNull()
    // A workout with a block and nothing logged: no ghost values, no volume,
    // no records, no crew.
    expect(
      pickRestCard(input({ restingExerciseId: 'e1', blocks: [block('e1', 'Row')] })),
    ).toBeNull()
  })

  it('never throws on a block whose exercise is missing from the catalogue', () => {
    const plain = [set({ exercise_id: 'e1', set_number: 1 })]
    const orphan: RestBlock = {
      ...buildBlock({ exerciseId: 'e1', sets: plain, previous: previous([{}, {}]) }),
      exercise: undefined,
    }
    const card = pickRestCard(
      input({ restingExerciseId: 'e1', sets: plain, blocks: [orphan] }),
    )
    expect(card?.kind).toBe('session')
  })
})

/**
 * The kicker is mono, uppercased and tracked out at 0.14em, which buys roughly
 * twenty characters on a 390px phone beside a 48px dismiss control. The first
 * screenshot of this card had the exercise name in there and it truncated
 * mid-word — "OVERHEAD PRESS (BARBEL…" — on a surface whose entire reason to
 * exist is being readable at three feet. Anything variable-length goes in
 * `subject`, and this is the guard that keeps it there.
 */
describe('the kicker stays short enough to render', () => {
  const LIMIT = 20
  const long = 'Incline Bench Press (Dumbbell)'

  it.each([
    [
      'target',
      () => {
        const sets = [set({ exercise_id: 'e1', set_number: 1 })]
        return input({
          restingExerciseId: 'e1',
          sets,
          blocks: [block('e1', long, { sets, previous: previous([{}, {}, {}]) })],
        })
      },
    ],
    [
      'record',
      () => {
        const sets = [set({ exercise_id: 'e1', set_number: 1, pr_weight: true })]
        return input({
          restingExerciseId: 'e1',
          sets,
          blocks: [block('e1', long, { sets, previous: previous([{}]) })],
        })
      },
    ],
    [
      'crew',
      () => {
        const sets = [set({ exercise_id: 'e1', set_number: 1 })]
        return input({
          restingExerciseId: 'e1',
          sets,
          blocks: [block('e1', long, { sets, previous: previous([{}]) })],
          crew: { lifters: 2, best: { name: 'hafsa', volumeKg: 100, records: 0 } },
        })
      },
    ],
    [
      'session',
      () => {
        const sets = [set({ exercise_id: 'e1', set_number: 1 })]
        return input({
          restingExerciseId: 'e1',
          sets,
          blocks: [block('e1', long, { sets, previous: previous([{}]) })],
        })
      },
    ],
  ])('%s', (kind, build) => {
    const card = pickRestCard(build())
    expect(card?.kind).toBe(kind)
    expect(card!.kicker.length).toBeLessThanOrEqual(LIMIT)
  })
})

describe('the permanent dismissal', () => {
  function storage(): Storage {
    const map = new Map<string, string>()
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
      key: () => null,
      length: 0,
    } as unknown as Storage
  }

  it('defaults to on, and on costs no write', () => {
    const s = storage()
    expect(restCanvasEnabled(s)).toBe(true)
    setRestCanvasEnabled(s, true)
    expect(s.getItem('wazn.rest-canvas')).toBeNull()
  })

  it('survives as off once dismissed, and comes back on undo', () => {
    const s = storage()
    setRestCanvasEnabled(s, false)
    expect(restCanvasEnabled(s)).toBe(false)
    setRestCanvasEnabled(s, true)
    expect(restCanvasEnabled(s)).toBe(true)
  })

  /** A private window with storage denied gets the canvas, not a crash. */
  it('fails safe toward on when storage is unavailable', () => {
    expect(restCanvasEnabled(null)).toBe(true)
    const hostile = {
      getItem() {
        throw new Error('denied')
      },
      setItem() {
        throw new Error('denied')
      },
      removeItem() {
        throw new Error('denied')
      },
    } as unknown as Storage
    expect(restCanvasEnabled(hostile)).toBe(true)
    expect(() => setRestCanvasEnabled(hostile, false)).not.toThrow()
  })
})
