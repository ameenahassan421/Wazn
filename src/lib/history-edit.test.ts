import { describe, expect, it } from 'vitest'
import { nextSetNumber, prefillFor, routineFromWorkout } from './history-edit'
import type { EditableSet } from './history-edit'
import type { SetType } from './types'

const set = (
  id: string,
  exercise_id: string,
  set_number: number,
  {
    weight_kg = 100 as number | null,
    reps = 5 as number | null,
    set_type = 'normal' as SetType,
  } = {},
): EditableSet => ({
  id,
  workout_id: 'w1',
  exercise_id,
  set_number,
  weight_kg,
  reps,
  rpe: null,
  duration_seconds: null,
  distance_meters: null,
  set_type,
  superset_group: null,
  pr_weight: false,
  pr_e1rm: false,
})

describe('nextSetNumber', () => {
  it('starts at 1 on an empty workout', () => {
    expect(nextSetNumber([])).toBe(1)
  })

  it('is one past the highest, not the count', () => {
    // A workout with a deleted set has a gap; counting would collide.
    expect(nextSetNumber([{ set_number: 1 }, { set_number: 3 }])).toBe(4)
  })

  it('does not assume the input is sorted', () => {
    expect(nextSetNumber([{ set_number: 7 }, { set_number: 2 }])).toBe(8)
  })

  it('numbers per workout, not per exercise', () => {
    // Two exercises, four sets: the fifth is 5, not a second 3.
    const sets = [
      set('a', 'e1', 1),
      set('b', 'e1', 2),
      set('c', 'e2', 3),
      set('d', 'e2', 4),
    ]
    expect(nextSetNumber(sets)).toBe(5)
  })
})

describe('prefillFor', () => {
  it('is empty for an exercise not in the workout', () => {
    expect(prefillFor([set('a', 'e1', 1)], 'e2')).toEqual({
      weightKg: null,
      reps: null,
    })
  })

  it('takes the last set of that exercise, not of the workout', () => {
    const sets = [
      set('a', 'e1', 1, { weight_kg: 100, reps: 5 }),
      set('b', 'e2', 2, { weight_kg: 20, reps: 12 }),
    ]
    expect(prefillFor(sets, 'e1')).toEqual({ weightKg: 100, reps: 5 })
  })

  it('prefers a working set over a later warm-up', () => {
    const sets = [
      set('a', 'e1', 1, { weight_kg: 100, reps: 5 }),
      set('b', 'e1', 2, { weight_kg: 40, reps: 10, set_type: 'warmup' }),
    ]
    expect(prefillFor(sets, 'e1')).toEqual({ weightKg: 100, reps: 5 })
  })

  it('falls back to a warm-up when it is all there is', () => {
    const sets = [set('a', 'e1', 1, { weight_kg: 40, reps: 10, set_type: 'warmup' })]
    expect(prefillFor(sets, 'e1')).toEqual({ weightKg: 40, reps: 10 })
  })

  it('carries a bodyweight set through as null weight', () => {
    const sets = [set('a', 'e1', 1, { weight_kg: null, reps: 12 })]
    expect(prefillFor(sets, 'e1')).toEqual({ weightKg: null, reps: 12 })
  })
})

describe('routineFromWorkout', () => {
  it('is null when there is nothing but warm-ups', () => {
    const sets = [set('a', 'e1', 1, { set_type: 'warmup' })]
    expect(routineFromWorkout(sets, null, 'Session')).toBeNull()
  })

  it('is null for an empty workout', () => {
    expect(routineFromWorkout([], null, 'Session')).toBeNull()
  })

  it('keeps exercise order by first appearance, which is performance order', () => {
    const sets = [set('a', 'e2', 1), set('b', 'e1', 2), set('c', 'e2', 3)]
    const draft = routineFromWorkout(sets, null, 'Session')
    expect(draft?.exercises.map((e) => e.exerciseId)).toEqual(['e2', 'e1'])
  })

  it('groups every set of one exercise together', () => {
    const sets = [set('a', 'e1', 1), set('b', 'e2', 2), set('c', 'e1', 3)]
    const draft = routineFromWorkout(sets, null, 'Session')
    expect(draft?.exercises[0].sets).toHaveLength(2)
  })

  it('carries reps and set type but never weight', () => {
    const sets = [set('a', 'e1', 1, { weight_kg: 140, reps: 3, set_type: 'failure' })]
    const draft = routineFromWorkout(sets, null, 'Session')
    expect(draft?.exercises[0].sets).toEqual([{ reps: 3, setType: 'failure' }])
    // A routine that hard-codes a weight is wrong the week after you progress.
    expect(JSON.stringify(draft)).not.toContain('140')
  })

  it('drops warm-ups from the plan', () => {
    const sets = [set('a', 'e1', 1, { set_type: 'warmup' }), set('b', 'e1', 2)]
    const draft = routineFromWorkout(sets, null, 'Session')
    expect(draft?.exercises[0].sets).toHaveLength(1)
  })

  it('uses the workout name when it has one', () => {
    const draft = routineFromWorkout([set('a', 'e1', 1)], 'Upper A', 'Session')
    expect(draft?.name).toBe('Upper A')
  })

  it('falls back when the name is blank or whitespace', () => {
    expect(routineFromWorkout([set('a', 'e1', 1)], '   ', 'Session')?.name).toBe(
      'Session',
    )
    expect(routineFromWorkout([set('a', 'e1', 1)], null, 'Session')?.name).toBe(
      'Session',
    )
  })
})
