import { describe, expect, it } from 'vitest'

import {
  type BoardExercise,
  type BoardPosition,
  bankSet,
  bankedVolumeKg,
  currentPosition,
  markSetType,
  momentumPct,
  nextBoardGroup,
  restsAfterBank,
  seedBoard,
  seedWeight,
  toggleSuperset,
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

/**
 * Supersets, on the board rather than on finished rows.
 *
 * `supersets.ts` already answers these questions about `workout_sets`. This is
 * the same semantics one step earlier, where the lifter is actually standing,
 * and the pairing has to survive a checkpoint restore written before it
 * existed.
 */
describe('supersets on the board', () => {
  function paired(): BoardExercise[] {
    return toggleSuperset(
      seedBoard(
        [
          { exerciseId: 'a', name: 'Bench Press', sets: 3 },
          { exerciseId: 'b', name: 'Barbell Row', sets: 3 },
          { exerciseId: 'c', name: 'Curl', sets: 2 },
        ],
        [],
      ),
      0,
    )
  }

  /** Bank whatever is in front of the lifter, and say what it was. */
  function bankNext(board: BoardExercise[]): [BoardExercise[], string, number] {
    const position = currentPosition(board) as BoardPosition
    const label = board[position.exerciseIndex].exerciseId
    const setNumber = board[position.exerciseIndex].sets[position.setIndex].setNumber
    return [bankSet(board, position, 60, 8), label, setNumber]
  }

  it('pairs a lift with the one after it, and only that one', () => {
    const board = paired()
    expect(board.map((e) => e.supersetGroup)).toEqual([1, 1, null])
  })

  it('does nothing when there is nothing after it to pair with', () => {
    const board = paired()
    expect(toggleSuperset(board, 2)).toBe(board)
  })

  it('alternates A B A B instead of walking straight through', () => {
    let board = paired()
    const order: string[] = []
    for (let i = 0; i < 6; i += 1) {
      const [next, id, setNumber] = bankNext(board)
      board = next
      order.push(`${id}${setNumber}`)
    }
    expect(order).toEqual(['a1', 'b1', 'a2', 'b2', 'a3', 'b3'])
  })

  it('is not stranded when one member gets ahead', () => {
    // Two of A banked before remembering B: B has the fewest, so B is next.
    let board = paired()
    board = bankSet(board, { exerciseIndex: 0, setIndex: 0 }, 60, 8)
    board = bankSet(board, { exerciseIndex: 0, setIndex: 1 }, 60, 8)
    expect(currentPosition(board)).toEqual({ exerciseIndex: 1, setIndex: 0 })
  })

  it('skips a member that has nothing left to log', () => {
    /*
     * The freeze this guards. A 2-set lift paired with a 3-set one keeps
     * winning the fewest-sets tie once it is finished, and `findIndex` on an
     * all-done list returns -1, which indexes nothing.
     */
    let board = toggleSuperset(
      seedBoard(
        [
          { exerciseId: 'a', name: 'Bench Press', sets: 1 },
          { exerciseId: 'b', name: 'Barbell Row', sets: 3 },
        ],
        [],
      ),
      0,
    )
    board = bankSet(board, { exerciseIndex: 0, setIndex: 0 }, 60, 8)
    board = bankSet(board, { exerciseIndex: 1, setIndex: 0 }, 60, 8)
    expect(currentPosition(board)).toEqual({ exerciseIndex: 1, setIndex: 1 })
  })

  it('rests once per round, not between the two lifts', () => {
    let board = paired()
    board = bankSet(board, { exerciseIndex: 0, setIndex: 0 }, 60, 8)
    // Next up is B, same group: walk to the other bench, do not sit down.
    expect(restsAfterBank(board, { exerciseIndex: 0, setIndex: 0 })).toBe(false)

    board = bankSet(board, { exerciseIndex: 1, setIndex: 0 }, 60, 8)
    expect(restsAfterBank(board, { exerciseIndex: 1, setIndex: 0 })).toBe(true)
  })

  it('never rests after a warm-up, supersetted or not', () => {
    let board = paired()
    board = markSetType(board, { exerciseIndex: 0, setIndex: 0 }, 'warmup')
    board = bankSet(board, { exerciseIndex: 0, setIndex: 0 }, 20, 10)
    expect(restsAfterBank(board, { exerciseIndex: 0, setIndex: 0 })).toBe(false)
  })

  it('dissolves the pair when either half leaves, so no lone badge is left', () => {
    const board = toggleSuperset(paired(), 0)
    expect(board.map((e) => e.supersetGroup)).toEqual([null, null, null])
  })

  it('keeps a group of three intact when one member leaves', () => {
    // Built by pairing B with C first, then joining A to the group that made:
    // toggling a lift that is ALREADY paired means "leave", not "add another".
    const base = seedBoard(
      [
        { exerciseId: 'a', name: 'Bench Press', sets: 3 },
        { exerciseId: 'b', name: 'Barbell Row', sets: 3 },
        { exerciseId: 'c', name: 'Curl', sets: 2 },
      ],
      [],
    )
    const three = toggleSuperset(toggleSuperset(base, 1), 0)
    expect(three.map((e) => e.supersetGroup)).toEqual([1, 1, 1])
    expect(toggleSuperset(three, 0).map((e) => e.supersetGroup)).toEqual([null, 1, 1])
  })

  it('does not rest while a shorter member is still behind', () => {
    // A one-set lift paired with a three-set one. Once A is spent it must stop
    // suppressing B's rests, or the rest of the group runs with none at all.
    let board = toggleSuperset(
      seedBoard(
        [
          { exerciseId: 'a', name: 'Bench Press', sets: 1 },
          { exerciseId: 'b', name: 'Barbell Row', sets: 3 },
        ],
        [],
      ),
      0,
    )
    board = bankSet(board, { exerciseIndex: 0, setIndex: 0 }, 60, 8)
    expect(restsAfterBank(board, { exerciseIndex: 0, setIndex: 0 })).toBe(false)

    board = bankSet(board, { exerciseIndex: 1, setIndex: 0 }, 60, 8)
    expect(restsAfterBank(board, { exerciseIndex: 1, setIndex: 0 })).toBe(true)

    board = bankSet(board, { exerciseIndex: 1, setIndex: 1 }, 60, 8)
    expect(restsAfterBank(board, { exerciseIndex: 1, setIndex: 1 })).toBe(true)
  })

  it('mints the lowest unused id', () => {
    expect(nextBoardGroup(paired())).toBe(2)
    expect(nextBoardGroup(seedBoard([], []))).toBe(1)
  })

  it('reads a checkpoint written before supersets existed as ungrouped', () => {
    /*
     * The restore path is `JSON.parse` with no migration, so an in-progress
     * workout from the previous build comes back with this field ABSENT.
     * `undefined === null` is false, so a naive check would put every restored
     * board into the alternating branch and reorder somebody's session.
     */
    const legacy = seedBoard(
      [
        { exerciseId: 'a', name: 'Bench Press', sets: 2 },
        { exerciseId: 'b', name: 'Barbell Row', sets: 2 },
      ],
      [],
    ).map(({ supersetGroup: _drop, ...rest }) => rest) as BoardExercise[]

    const board = bankSet(legacy, { exerciseIndex: 0, setIndex: 0 }, 60, 8)
    expect(currentPosition(board)).toEqual({ exerciseIndex: 0, setIndex: 1 })
    expect(restsAfterBank(board, { exerciseIndex: 0, setIndex: 0 })).toBe(true)
  })
})

describe('RPE on the board', () => {
  it('lands on the banked row and nowhere else', () => {
    const banked = bankSet(board(), { exerciseIndex: 0, setIndex: 0 }, 100, 5, 8)
    expect(banked[0].sets[0].rpe).toBe(8)
    expect(banked[0].sets[1].rpe).toBeNull()
  })

  it('defaults to null, because most lifters never say', () => {
    const banked = bankSet(board(), { exerciseIndex: 0, setIndex: 0 }, 100, 5)
    expect(banked[0].sets[0].rpe).toBeNull()
  })

  it('is never seeded from the previous session', () => {
    // Weight, reps and type repeat; a reading of how hard it felt does not.
    const [squat] = board()
    expect(squat.sets.every((s) => s.rpe === null)).toBe(true)
  })
})

describe('warm-ups inside a superset', () => {
  /**
   * A bench carrying warm-ups, paired with a row that has none. This is the
   * shape every other superset test in this file omits, and it is the shape a
   * real lifter has: you warm up the press, you do not warm up the row you are
   * pairing it with.
   */
  function warmed(): BoardExercise[] {
    const b = toggleSuperset(
      seedBoard(
        [
          { exerciseId: 'a', name: 'Bench Press', sets: 4 },
          { exerciseId: 'b', name: 'Barbell Row', sets: 3 },
        ],
        [],
      ),
      0,
    )
    // Bench's first two are warm-ups.
    b[0].sets[0].type = 'warmup'
    b[0].sets[1].type = 'warmup'
    return b
  }

  it('alternates on working sets, not on every completed row', () => {
    let b = warmed()
    b = bankSet(b, { exerciseIndex: 0, setIndex: 0 }, 20, 10) // warm-up
    b = bankSet(b, { exerciseIndex: 0, setIndex: 1 }, 40, 8) // warm-up

    // Still the bench: a warm-up starts nothing, so the round has not begun.
    expect(currentPosition(b)?.exerciseIndex).toBe(0)

    b = bankSet(b, { exerciseIndex: 0, setIndex: 2 }, 100, 5) // first WORKING set

    // Now it is the row's turn. Counting `done` flat made the bench read 3 to
    // the row's 0, so the row won the tie for all three of its sets and the
    // lifter never walked back.
    expect(currentPosition(b)?.exerciseIndex).toBe(1)
  })

  it('does not rest until both members have banked the same working set', () => {
    let b = warmed()
    b = bankSet(b, { exerciseIndex: 0, setIndex: 0 }, 20, 10)
    b = bankSet(b, { exerciseIndex: 0, setIndex: 1 }, 40, 8)
    b = bankSet(b, { exerciseIndex: 0, setIndex: 2 }, 100, 5)

    // Round 1 closes on the row's first working set.
    b = bankSet(b, { exerciseIndex: 1, setIndex: 0 }, 80, 8)
    expect(restsAfterBank(b, { exerciseIndex: 1, setIndex: 0 })).toBe(true)

    // Round 2 does NOT close on the row's second: the bench still owes one.
    // Flat counting made the bench read 3, which cleared every comparison.
    b = bankSet(b, { exerciseIndex: 1, setIndex: 1 }, 80, 8)
    expect(restsAfterBank(b, { exerciseIndex: 1, setIndex: 1 })).toBe(false)
  })

  it('never rests on the warm-up itself', () => {
    let b = warmed()
    b = bankSet(b, { exerciseIndex: 0, setIndex: 0 }, 20, 10)
    expect(restsAfterBank(b, { exerciseIndex: 0, setIndex: 0 })).toBe(false)
  })
})
