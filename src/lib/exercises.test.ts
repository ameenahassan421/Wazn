import { describe, expect, it } from 'vitest'
import { EQUIPMENT, MUSCLE_GROUPS } from './exercises'

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
