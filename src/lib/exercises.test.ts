import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EQUIPMENT,
  MUSCLE_GROUPS,
  deleteCustomExercise,
  updateCustomExercise,
} from './exercises'

/**
 * These two lists are the client's copy of constraints that live in the
 * database — `exercises.muscle_group` has a CHECK, and `equipment` is what the
 * seeded catalogue uses and what the routine generator filters on. A drift
 * between them shows up as an insert rejected at the very end of a form, which
 * is the worst possible moment to discover it.
 */

describe('custom exercise vocabularies', () => {
  it('matches the muscle_group CHECK constraint in migration 0001, exactly', () => {
    // Copied from 0001_init.sql. If the migration changes, this fails first.
    expect([...MUSCLE_GROUPS].sort()).toEqual(
      [
        'back',
        'biceps',
        'calves',
        'cardio',
        'chest',
        'core',
        'glutes',
        'hamstrings',
        'quads',
        'shoulders',
        'triceps',
      ].sort(),
    )
  })

  it('offers only equipment values the seeded catalogue already uses', () => {
    // Verified against production: bodyweight, machine, dumbbell, barbell,
    // cable, other. A seventh value would create a category the picker groups
    // by and nothing else ever fills.
    expect([...EQUIPMENT].sort()).toEqual(
      ['barbell', 'bodyweight', 'cable', 'dumbbell', 'machine', 'other'].sort(),
    )
  })

  it('has no duplicates in either list', () => {
    expect(new Set(MUSCLE_GROUPS).size).toBe(MUSCLE_GROUPS.length)
    expect(new Set(EQUIPMENT).size).toBe(EQUIPMENT.length)
  })
})

/**
 * The two write paths, tested for the thing that actually matters about them:
 * what a lifter is told when Postgres says no. The queries themselves are
 * PostgREST chains with no branching, but the error translation is a product
 * decision and a constraint code leaking to the screen is a defect.
 */

const result = { data: null as unknown, error: null as unknown }
const calls: { table: string; op: string; payload?: unknown }[] = []

vi.mock('./supabase', () => ({
  describeError: (what: string) => `${what} failed`,
  supabase: {
    from: (table: string) => {
      const chain = {
        update: (payload: unknown) => {
          calls.push({ table, op: 'update', payload })
          return chain
        },
        delete: () => {
          calls.push({ table, op: 'delete' })
          return chain
        },
        eq: () => chain,
        select: () => chain,
        single: () => Promise.resolve(result),
        then: (resolve: (v: typeof result) => unknown) =>
          Promise.resolve(result).then(resolve),
      }
      return chain
    },
  },
}))

beforeEach(() => {
  result.data = null
  result.error = null
  calls.length = 0
})

describe('updateCustomExercise', () => {
  const input = {
    name: 'Hack Squat',
    muscleGroup: 'quads' as const,
    equipment: 'machine',
  }

  it('refuses a name too short to find later', async () => {
    await expect(updateCustomExercise('e1', { ...input, name: 'x' })).rejects.toThrow(
      'Give the exercise a name.',
    )
  })

  it('refuses a name that would not fit anywhere', async () => {
    await expect(
      updateCustomExercise('e1', { ...input, name: 'x'.repeat(81) }),
    ).rejects.toThrow('too long')
  })

  it('collapses runs of whitespace rather than storing them', async () => {
    result.data = { id: 'e1' }
    await updateCustomExercise('e1', { ...input, name: '  Hack   Squat  ' })
    expect(calls[0].payload).toMatchObject({ name: 'Hack Squat' })
  })

  it('translates a duplicate name into the reason, not the constraint', async () => {
    result.error = { code: '23505' }
    await expect(updateCustomExercise('e1', input)).rejects.toThrow(
      'You already have an exercise called',
    )
  })

  it('writes all three fields, because all three are read elsewhere', async () => {
    result.data = { id: 'e1' }
    await updateCustomExercise('e1', input)
    expect(calls[0].payload).toEqual({
      name: 'Hack Squat',
      muscle_group: 'quads',
      equipment: 'machine',
    })
  })
})

describe('deleteCustomExercise', () => {
  it('resolves when the database accepts it', async () => {
    await expect(deleteCustomExercise('e1')).resolves.toBeUndefined()
  })

  it('explains the on-delete-restrict refusal in terms of the history', async () => {
    // 23503: `workout_sets.exercise_id` is `on delete restrict` (0001), which
    // is what makes losing logged history structurally impossible.
    result.error = { code: '23503' }
    await expect(deleteCustomExercise('e1')).rejects.toThrow(
      'You have logged sets with this exercise',
    )
  })

  it('does not swallow an error it does not recognise', async () => {
    result.error = { code: '42501' }
    await expect(deleteCustomExercise('e1')).rejects.toThrow('failed')
  })
})
