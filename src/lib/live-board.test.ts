import { describe, expect, it } from 'vitest'

import {
  type BoardExercise,
  bankSet,
  bankedVolumeKg,
  currentPosition,
  markSetType,
  momentumPct,
  seedBoard,
  seedWeight,
} from './live-board'

function board(): BoardExercise[] {
  return seedBoard(
    [
      { exerciseId: 'squat', name: 'Back Squat', sets: 3 },
      { exerciseId: 'bench', name: 'Bench Press', sets: 2 },
    ],
    [
      { exerciseId: 'squat', setNumber: 1, weightKg: 100, reps: 5, type: 'normal' },
      { exerciseId: 'squat', setNumber: 2, weightKg: 100, reps: 5, type: 'normal' },
      { exerciseId: 'bench', setNumber: 1, weightKg: 60, reps: 8, type: 'normal' },
    ],
  )
}

describe('seedBoard', () => {
  it('pre-dials the previous session so a repeat set is one tap', () => {
    const [squat] = board()
    expect(squat.sets[0].weightKg).toBe(100)
    expect(squat.sets[0].reps).toBe(5)
    expect(squat.sets[0].previousKg).toBe(100)
  })

  it('leaves a row with no history blank rather than inventing a load', () => {
    const [squat] = board()
    // The previous session did two squat sets; this plan asks for three.
    expect(squat.sets[2].weightKg).toBeNull()
    expect(squat.sets[2].previousKg).toBeNull()
  })

  it('never produces an exercise with zero sets', () => {
    const seeded = seedBoard([{ exerciseId: 'x', name: 'X', sets: 0 }], [])
    expect(seeded[0].sets).toHaveLength(1)
  })

  /*
   * The board carries whether a lift is bodyweight, because the SCREEN used to
   * infer it from `weightKg === null` and that is a different question. A null
   * weight means either "pull-up" or "no history to pre-dial", and the second
   * is what the test above deliberately produces — so every set of a lift the
   * lifter had never done rendered with no weight control at all, and could not
   * be given one. Seen on a simulator as Squat set 6 of 6.
   */
  it('carries bodyweight from the plan, and defaults it to false', () => {
    const [pullUp, squat] = seedBoard(
      [
        { exerciseId: 'p', name: 'Pull-up', sets: 1, bodyweight: true },
        { exerciseId: 's', name: 'Squat', sets: 1 },
      ],
      [],
    )
    expect(pullUp.bodyweight).toBe(true)
    // Absent, not false, in the plan — the default has to be the loaded case,
    // because that is the one where hiding the stepper loses the workout.
    expect(squat.bodyweight).toBe(false)
    // And a no-history row is still blank, which is the invariant above.
    expect(squat.sets[0].weightKg).toBeNull()
  })
})

describe('currentPosition', () => {
  it('is the first unbanked set in board order', () => {
    expect(currentPosition(board())).toEqual({ exerciseIndex: 0, setIndex: 0 })
  })

  it('walks into the next exercise once one is finished', () => {
    let b = board()
    b = bankSet(b, { exerciseIndex: 0, setIndex: 0 }, 100, 5)
    b = bankSet(b, { exerciseIndex: 0, setIndex: 1 }, 100, 5)
    b = bankSet(b, { exerciseIndex: 0, setIndex: 2 }, 100, 5)
    expect(currentPosition(b)).toEqual({ exerciseIndex: 1, setIndex: 0 })
  })

  it('is null when every set is banked, which is the finish state', () => {
    let b = board()
    for (let ei = 0; ei < b.length; ei += 1) {
      for (let si = 0; si < b[ei].sets.length; si += 1) {
        b = bankSet(b, { exerciseIndex: ei, setIndex: si }, 50, 5)
      }
    }
    expect(currentPosition(b)).toBeNull()
  })
})

describe('bankSet', () => {
  it('records what was actually lifted, not what was seeded', () => {
    const b = bankSet(board(), { exerciseIndex: 0, setIndex: 0 }, 102.5, 4)
    expect(b[0].sets[0]).toMatchObject({ weightKg: 102.5, reps: 4, done: true })
    // The ghost is history and does not move when today's set lands.
    expect(b[0].sets[0].previousKg).toBe(100)
  })

  it('does not mutate the board it was given', () => {
    const before = board()
    bankSet(before, { exerciseIndex: 0, setIndex: 0 }, 100, 5)
    expect(before[0].sets[0].done).toBe(false)
  })

  it('refuses to re-bank a set, so a double tap cannot double-count', () => {
    const once = bankSet(board(), { exerciseIndex: 0, setIndex: 0 }, 100, 5)
    const twice = bankSet(once, { exerciseIndex: 0, setIndex: 0 }, 200, 10)
    expect(twice[0].sets[0].weightKg).toBe(100)
    expect(bankedVolumeKg(twice)).toBe(500)
  })

  it('returns the board unchanged for a position that is not there', () => {
    const b = board()
    expect(bankSet(b, { exerciseIndex: 9, setIndex: 9 }, 100, 5)).toBe(b)
  })
})

describe('bankedVolumeKg', () => {
  it('counts only what has been banked', () => {
    expect(bankedVolumeKg(board())).toBe(0)
    const b = bankSet(board(), { exerciseIndex: 0, setIndex: 0 }, 100, 5)
    expect(bankedVolumeKg(b)).toBe(500)
  })

  it('excludes warm-ups, so a longer warm-up cannot beat a session', () => {
    const warm = seedBoard([{ exerciseId: 'squat', name: 'Squat', sets: 1 }], [])
    warm[0].sets[0].type = 'warmup'
    const banked = bankSet(warm, { exerciseIndex: 0, setIndex: 0 }, 60, 10)
    expect(bankedVolumeKg(banked)).toBe(0)
  })

  it('excludes a set missing either half, the way the target does', () => {
    const b = bankSet(board(), { exerciseIndex: 0, setIndex: 0 }, null, 12)
    expect(bankedVolumeKg(b)).toBe(0)
  })
})

/**
 * The type is the one field the board writes that nothing downstream can
 * infer. Thirteen SQL functions filter on `set_type <> 'warmup'`, so a
 * mislabelled row is not a cosmetic error: it is volume that never happened
 * and a personal record that was never set.
 */
describe('set types', () => {
  it("carries the previous session's type, so a repeated warm-up stays one", () => {
    const [squat] = seedBoard(
      [{ exerciseId: 'squat', name: 'Back Squat', sets: 2 }],
      [
        { exerciseId: 'squat', setNumber: 1, weightKg: 40, reps: 10, type: 'warmup' },
        { exerciseId: 'squat', setNumber: 2, weightKg: 100, reps: 5, type: 'normal' },
      ],
    )
    expect(squat.sets[0].type).toBe('warmup')
    expect(squat.sets[1].type).toBe('normal')
  })

  it('keeps a repeated warm-up out of the volume it would otherwise inflate', () => {
    const seeded = seedBoard(
      [{ exerciseId: 'squat', name: 'Back Squat', sets: 1 }],
      [{ exerciseId: 'squat', setNumber: 1, weightKg: 40, reps: 10, type: 'warmup' }],
    )
    expect(
      bankedVolumeKg(bankSet(seeded, { exerciseIndex: 0, setIndex: 0 }, 40, 10)),
    ).toBe(0)
  })

  it('defaults to normal for a lift with no history', () => {
    const [fresh] = seedBoard(
      [{ exerciseId: 'ohp', name: 'Overhead Press', sets: 1 }],
      [],
    )
    expect(fresh.sets[0].type).toBe('normal')
  })

  it('marks the set in front of the lifter and nothing else', () => {
    const b = board()
    const marked = markSetType(b, { exerciseIndex: 0, setIndex: 0 }, 'warmup')
    expect(marked[0].sets[0].type).toBe('warmup')
    expect(marked[0].sets[0].done).toBe(false)
    expect(marked[0].sets[1].type).toBe('normal')
    // The untouched lift is the SAME object, not a copy: the store hands this
    // straight to React and a new reference per exercise re-renders all of them.
    expect(marked[1]).toBe(b[1])
  })

  it('refuses a banked row, which is already in Postgres', () => {
    const banked = bankSet(board(), { exerciseIndex: 0, setIndex: 0 }, 100, 5)
    expect(markSetType(banked, { exerciseIndex: 0, setIndex: 0 }, 'warmup')).toBe(
      banked,
    )
  })

  it('returns the same board when the type already matches, so nothing checkpoints', () => {
    const b = board()
    expect(markSetType(b, { exerciseIndex: 0, setIndex: 0 }, 'normal')).toBe(b)
  })

  it('is inert on a position that does not exist', () => {
    const b = board()
    expect(markSetType(b, { exerciseIndex: 9, setIndex: 9 }, 'warmup')).toBe(b)
  })
})

describe('momentumPct', () => {
  it('is null with no target, because day one has nothing to claim', () => {
    expect(momentumPct(0, null)).toBeNull()
    expect(momentumPct(500, 0)).toBeNull()
  })

  it('reports past 100 rather than clamping, so RECORD PACE can fire', () => {
    expect(momentumPct(1200, 1000)).toBe(120)
  })

  it('is a plain ratio in the ordinary case', () => {
    expect(momentumPct(250, 1000)).toBe(25)
  })
})

/**
 * What the weight dial shows when the board moves to a new set.
 *
 * Every case here shipped broken on 2026-08-21 and was found on a simulator,
 * not by a check: a lift added mid-session seeded `weightKg: null`, which the
 * board reads as BODYWEIGHT, so a Bench Press had no weight dial at all;
 * fixing that to `0` made set 2 reset to zero, turning GATE U2's one-tap
 * repeat into eight presses on `+`; and carrying the value forward
 * unconditionally would put the bench press's 60kg onto the pull-up after it.
 */
describe('seedWeight', () => {
  it('is null for a bodyweight set, whatever was dialled before it', () => {
    expect(seedWeight({ weightKg: null }, 60)).toBeNull()
  })

  it('is null when there is no next set at all', () => {
    expect(seedWeight(null, 60)).toBeNull()
  })

  it("uses the set's own weight when it has one", () => {
    expect(seedWeight({ weightKg: 100 }, 60)).toBe(100)
  })

  it('carries the last dialled weight into a fresh set', () => {
    // `0` is "no weight yet", not "zero kilos" — the seed an added lift gets.
    expect(seedWeight({ weightKg: 0 }, 60)).toBe(60)
  })

  it('falls back to zero when nothing has been dialled yet', () => {
    expect(seedWeight({ weightKg: 0 }, null)).toBe(0)
  })
})
