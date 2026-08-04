import { describe, expect, it } from 'vitest'
import {
  cleanInstructions,
  needsUpdate,
  resolveAll,
  summarise,
} from './import_instructions'
import type { FreeExercise, OurExercise } from './match_exercise_images'

const bench: OurExercise = {
  id: 'a',
  name: 'Bench Press (Barbell)',
  muscle_group: 'chest',
  equipment: 'barbell',
}

const pool: FreeExercise[] = [
  {
    name: 'Barbell Bench Press - Medium Grip',
    equipment: 'barbell',
    primaryMuscles: ['chest'],
    images: ['x.jpg'],
    instructions: ['Lie back on a flat bench.', 'Press the bar up.'],
  },
  {
    name: 'Barbell Squat',
    equipment: 'barbell',
    primaryMuscles: ['quadriceps'],
    images: ['y.jpg'],
    instructions: ['Set the bar on your traps.'],
  },
]

describe('cleanInstructions', () => {
  it('trims, collapses whitespace, and drops empties', () => {
    expect(cleanInstructions(['  Lie   back.  ', '', '   ', 'Press up.'])).toEqual([
      'Lie back.',
      'Press up.',
    ])
  })

  it('drops duplicate steps case-insensitively but keeps order', () => {
    expect(cleanInstructions(['Grip the bar.', 'grip the bar.', 'Lift.'])).toEqual([
      'Grip the bar.',
      'Lift.',
    ])
  })

  it('drops run-on paragraphs that are not steps', () => {
    expect(cleanInstructions(['Fine step.', 'x'.repeat(601)])).toEqual(['Fine step.'])
  })

  it('returns null rather than an empty array', () => {
    expect(cleanInstructions([])).toBeNull()
    expect(cleanInstructions(['', '  '])).toBeNull()
    expect(cleanInstructions(undefined)).toBeNull()
    expect(cleanInstructions('not an array')).toBeNull()
  })

  it('ignores non-string entries', () => {
    expect(cleanInstructions(['Real step.', 42, null])).toEqual(['Real step.'])
  })
})

describe('needsUpdate', () => {
  it('is true when there is nothing stored', () => {
    expect(needsUpdate(null, ['a'])).toBe(true)
    expect(needsUpdate(undefined, ['a'])).toBe(true)
  })

  it('is false when the stored text already matches', () => {
    expect(needsUpdate(['a', 'b'], ['a', 'b'])).toBe(false)
  })

  it('is true when a step changed or the count changed', () => {
    expect(needsUpdate(['a', 'b'], ['a', 'c'])).toBe(true)
    expect(needsUpdate(['a'], ['a', 'b'])).toBe(true)
  })

  it('never clears text that is already there', () => {
    // A future dataset revision that drops an entry must not wipe steps the
    // user can already read.
    expect(needsUpdate(['a'], null)).toBe(false)
  })
})

describe('resolveAll', () => {
  it('carries the matched name and cleaned steps through', () => {
    const [row] = resolveAll([bench], pool)
    expect(row.matchedName).toBe('Barbell Bench Press - Medium Grip')
    expect(row.instructions).toEqual(['Lie back on a flat bench.', 'Press the bar up.'])
    expect(row.score).toBeGreaterThan(0.6)
  })

  it('respects the muscle-group gate rather than matching on name alone', () => {
    // "Squat" shares no muscle with chest, so a chest exercise must not pick it
    // up even though the token overlap is high.
    const fakeSquat: OurExercise = {
      id: 'b',
      name: 'Squat (Barbell)',
      muscle_group: 'chest',
      equipment: 'barbell',
    }
    const [row] = resolveAll([fakeSquat], pool)
    expect(row.matchedName).not.toBe('Barbell Squat')
  })

  it('reports no match as null steps rather than throwing', () => {
    const unknown: OurExercise = {
      id: 'c',
      name: 'Stair Machine (Steps)',
      muscle_group: 'cardio',
      equipment: 'other',
    }
    const [row] = resolveAll([unknown], pool)
    expect(row.instructions).toBeNull()
    expect(row.matchedName).toBeNull()
  })
})

describe('summarise', () => {
  it('separates unmatched from matched-but-stepless', () => {
    const stats = summarise([
      { exercise: bench, instructions: ['a'], matchedName: 'X', score: 1 },
      { exercise: bench, instructions: null, matchedName: null, score: 0 },
      { exercise: bench, instructions: null, matchedName: 'Y', score: 0.8 },
    ])
    expect(stats).toEqual({
      total: 3,
      withSteps: 1,
      noMatch: 1,
      matchedButNoSteps: 1,
    })
  })
})
