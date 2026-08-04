import { describe, expect, it } from 'vitest'
import { validatePlan } from '../../supabase/functions/_shared/validate-plan'

/**
 * The routine generator's safety net. Everything upstream of `validatePlan` is
 * a model's suggestion; everything downstream is an INSERT into the user's
 * routines. These are the cases that decide which is which.
 */

const available = [
  { id: 'ex-bench', name: 'Bench Press (Barbell)' },
  { id: 'ex-squat', name: 'Squat (Barbell)' },
  { id: 'ex-row', name: 'Bent Over Row (Barbell)' },
]

describe('validatePlan', () => {
  it('maps real exercise names to their ids', () => {
    const { days, dropped } = validatePlan(
      {
        days: [
          {
            name: 'Upper A',
            exercises: [{ exercise: 'Bench Press (Barbell)', sets: 4, reps: 6 }],
          },
        ],
      },
      available,
      3,
    )
    expect(dropped).toEqual([])
    expect(days).toEqual([
      { name: 'Upper A', exercises: [{ id: 'ex-bench', sets: 4, reps: 6 }] },
    ])
  })

  it('drops an invented exercise and reports it', () => {
    // The failure this whole module exists for. A model told to copy from a
    // list will still occasionally produce something plausible and fictional.
    const { days, dropped } = validatePlan(
      {
        days: [
          {
            name: 'Push',
            exercises: [
              { exercise: 'Bench Press (Barbell)', sets: 3, reps: 8 },
              { exercise: 'Hack Squat Superset Fly', sets: 3, reps: 10 },
            ],
          },
        ],
      },
      available,
      3,
    )
    expect(dropped).toEqual(['Hack Squat Superset Fly'])
    expect(days[0].exercises).toHaveLength(1)
    expect(days[0].exercises[0].id).toBe('ex-bench')
  })

  it('drops a day that loses every exercise', () => {
    const { days } = validatePlan(
      {
        days: [
          {
            name: 'Real',
            exercises: [{ exercise: 'Squat (Barbell)', sets: 5, reps: 5 }],
          },
          {
            name: 'Fictional',
            exercises: [{ exercise: 'Nordic Bulgarian Zercher', sets: 3, reps: 8 }],
          },
        ],
      },
      available,
      3,
    )
    expect(days).toHaveLength(1)
    expect(days[0].name).toBe('Real')
  })

  it('matches names case- and whitespace-insensitively', () => {
    const { days, dropped } = validatePlan(
      {
        days: [
          {
            name: 'A',
            exercises: [{ exercise: '  bench press (BARBELL) ', sets: 3, reps: 8 }],
          },
        ],
      },
      available,
      3,
    )
    expect(dropped).toEqual([])
    expect(days[0].exercises[0].id).toBe('ex-bench')
  })

  it('clamps sets and reps into the range the routine editor allows', () => {
    const { days } = validatePlan(
      {
        days: [
          {
            name: 'A',
            exercises: [
              { exercise: 'Squat (Barbell)', sets: 99, reps: 500 },
              { exercise: 'Bench Press (Barbell)', sets: 0, reps: -4 },
            ],
          },
        ],
      },
      available,
      3,
    )
    expect(days[0].exercises[0]).toEqual({ id: 'ex-squat', sets: 6, reps: 30 })
    expect(days[0].exercises[1]).toEqual({ id: 'ex-bench', sets: 1, reps: 1 })
  })

  it('substitutes defaults for missing or non-numeric sets and reps', () => {
    const { days } = validatePlan(
      {
        days: [
          {
            name: 'A',
            exercises: [{ exercise: 'Squat (Barbell)', sets: 'five', reps: null }],
          },
        ],
      },
      available,
      3,
    )
    expect(days[0].exercises[0]).toEqual({ id: 'ex-squat', sets: 3, reps: 8 })
  })

  it('never returns more days than were asked for', () => {
    const day = {
      name: 'D',
      exercises: [{ exercise: 'Squat (Barbell)', sets: 3, reps: 8 }],
    }
    const { days } = validatePlan({ days: [day, day, day, day, day] }, available, 2)
    expect(days).toHaveLength(2)
  })

  it('names an unnamed day rather than writing an empty title', () => {
    const { days } = validatePlan(
      { days: [{ exercises: [{ exercise: 'Squat (Barbell)', sets: 3, reps: 8 }] }] },
      available,
      3,
    )
    expect(days[0].name).toBe('Day')
  })

  it('survives shapes that are not a plan at all', () => {
    expect(validatePlan(null, available, 3)).toEqual({ days: [], dropped: [] })
    expect(validatePlan({ days: 'nope' }, available, 3)).toEqual({
      days: [],
      dropped: [],
    })
    expect(validatePlan({}, available, 3)).toEqual({ days: [], dropped: [] })
  })
})
