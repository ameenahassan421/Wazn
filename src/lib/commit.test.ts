import { describe, expect, it } from 'vitest'
import { commitOutcome } from './commit'
import type { SetType, WorkoutSet } from './types'

/**
 * The protect list, as assertions.
 *
 * Every case below describes a behaviour design v2.2 is forbidden to regress
 * (parity plan §1). They passed by inspection before; the overview's check is a
 * second caller, so now they pass by test.
 */

let seq = 0
function set(
  exerciseId: string,
  group: number | null,
  setType: SetType = 'normal',
): WorkoutSet {
  seq += 1
  return {
    id: `s${seq}`,
    workout_id: 'w1',
    exercise_id: exerciseId,
    set_number: 1,
    weight_kg: 100,
    reps: 8,
    rpe: null,
    duration_seconds: null,
    distance_meters: null,
    set_type: setType,
    superset_group: group,
    pr_weight: false,
    pr_e1rm: false,
  }
}

describe('commitOutcome — a plain set', () => {
  it('starts this lift’s rest and goes nowhere', () => {
    expect(
      commitOutcome({
        sets: [set('a', null)],
        exerciseId: 'a',
        setType: 'normal',
        supersetGroup: null,
        restSeconds: 120,
      }),
    ).toEqual({ advanceTo: null, restSeconds: 120 })
  })

  it('starts nothing after a warm-up', () => {
    expect(
      commitOutcome({
        sets: [set('a', null, 'warmup')],
        exerciseId: 'a',
        setType: 'warmup',
        supersetGroup: null,
        restSeconds: 120,
      }).restSeconds,
    ).toBeNull()
  })

  it('treats zero as "no timer on this lift", not as "no preference"', () => {
    expect(
      commitOutcome({
        sets: [set('a', null)],
        exerciseId: 'a',
        setType: 'normal',
        supersetGroup: null,
        restSeconds: 0,
      }).restSeconds,
    ).toBeNull()
  })
})

describe('commitOutcome — a superset rests once per round', () => {
  it('moves to the partner mid-round and does NOT rest', () => {
    // A logged, B has not. Committing A again would be wrong; go to B.
    const sets = [set('a', 1), set('b', 1), set('a', 1)]
    expect(
      commitOutcome({
        sets,
        exerciseId: 'a',
        setType: 'normal',
        supersetGroup: 1,
        restSeconds: 120,
      }),
    ).toEqual({ advanceTo: 'b', restSeconds: null })
  })

  it('rests when the round closes, and opens the next round on the first member', () => {
    const sets = [set('a', 1), set('b', 1)]
    expect(
      commitOutcome({
        sets,
        exerciseId: 'b',
        setType: 'normal',
        supersetGroup: 1,
        restSeconds: 120,
      }),
    ).toEqual({ advanceTo: 'a', restSeconds: 120 })
  })

  /**
   * The regression this whole file exists for. The shipped code asked
   * `nextInGroup` before `roundComplete`, so from the second set onward the
   * rest branch was unreachable and an A/B superset never rested again.
   */
  /** One full session, replayed the way the app actually drives it. */
  function replay(order: string[]) {
    const sets: WorkoutSet[] = []
    const rested: number[] = []
    const path: (string | null)[] = []
    for (const [i, id] of order.entries()) {
      sets.push(set(id, 1))
      const outcome = commitOutcome({
        sets,
        exerciseId: id,
        setType: 'normal',
        supersetGroup: 1,
        restSeconds: 120,
      })
      if (outcome.restSeconds !== null) rested.push(i)
      path.push(outcome.advanceTo)
    }
    return { rested, path }
  }

  it('rests once per round, every round, across a full A/B/A/B session', () => {
    const { rested } = replay(['a', 'b', 'a', 'b', 'a', 'b'])
    // Index 0 is the group of one — B has not been picked yet, so there is
    // nobody to alternate with and resting is right. After that it is every
    // B: the set that closes rounds 1, 2 and 3. The shipped code produced
    // `[0]` alone and rested exactly once in a whole session.
    expect(rested).toEqual([0, 1, 3, 5])
  })

  it('alternates B → A → B → A and never rests mid-round', () => {
    const { path, rested } = replay(['a', 'b', 'a', 'b'])
    expect(path).toEqual([null, 'a', 'b', 'a'])
    expect(rested).not.toContain(2)
  })

  it('does not rest between a superset’s exercises even at round end for a warm-up', () => {
    const sets = [set('a', 1, 'warmup'), set('b', 1, 'warmup')]
    expect(
      commitOutcome({
        sets,
        exerciseId: 'b',
        setType: 'warmup',
        supersetGroup: 1,
        restSeconds: 120,
      }).restSeconds,
    ).toBeNull()
  })

  it('handles a group of one — the partner has not been picked yet', () => {
    const sets = [set('a', 1)]
    expect(
      commitOutcome({
        sets,
        exerciseId: 'a',
        setType: 'normal',
        supersetGroup: 1,
        restSeconds: 90,
      }),
    ).toEqual({ advanceTo: null, restSeconds: 90 })
  })

  it('sends you to whoever is furthest behind mid-round, not to the next member', () => {
    // A has four, B one, C two — an uneven round, so nobody rests.
    const sets = [
      set('a', 1),
      set('b', 1),
      set('c', 1),
      set('a', 1),
      set('c', 1),
      set('a', 1),
      set('a', 1),
    ]
    expect(
      commitOutcome({
        sets,
        exerciseId: 'a',
        setType: 'normal',
        supersetGroup: 1,
        restSeconds: 120,
      }).advanceTo,
    ).toBe('b')
  })
})
