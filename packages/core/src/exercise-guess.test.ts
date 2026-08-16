import { describe, expect, it } from 'vitest'
import { deriveEquipment, deriveMuscleGroup } from './exercise-guess'
import { EQUIPMENT, MUSCLE_GROUPS } from './exercise-taxonomy'

describe('deriveMuscleGroup', () => {
  it('reads the obvious lifts', () => {
    expect(deriveMuscleGroup('Bench Press (Barbell)')).toBe('chest')
    expect(deriveMuscleGroup('Lat Pulldown (Cable)')).toBe('back')
    expect(deriveMuscleGroup('Lateral Raise (Dumbbell)')).toBe('shoulders')
    expect(deriveMuscleGroup('Bicep Curl (Dumbbell)')).toBe('biceps')
    expect(deriveMuscleGroup('Triceps Pushdown (Cable)')).toBe('triceps')
    expect(deriveMuscleGroup('Standing Calf Raise')).toBe('calves')
    expect(deriveMuscleGroup('Hip Thrust (Barbell)')).toBe('glutes')
    expect(deriveMuscleGroup('Plank')).toBe('core')
  })

  /** The reason the pattern order is what it is. Both contain "leg". */
  it('separates leg curl from leg press', () => {
    expect(deriveMuscleGroup('Seated Leg Curl')).toBe('hamstrings')
    expect(deriveMuscleGroup('Leg Press')).toBe('quads')
  })

  /** A treadmill "run" must not read as a leg exercise. */
  it('reads cardio before anything else', () => {
    expect(deriveMuscleGroup('Running (Treadmill)')).toBe('cardio')
    expect(deriveMuscleGroup('Rowing Machine')).toBe('cardio')
    expect(deriveMuscleGroup('Cycling')).toBe('cardio')
  })

  it('still reads a barbell row as back', () => {
    expect(deriveMuscleGroup('Bent Over Row (Barbell)')).toBe('back')
    expect(deriveMuscleGroup('Seated Cable Row')).toBe('back')
  })

  it('prefers the specific reading for a curl that is not a bicep curl', () => {
    expect(deriveMuscleGroup('Nordic Curl')).toBe('hamstrings')
    expect(deriveMuscleGroup('Romanian Deadlift (Barbell)')).toBe('hamstrings')
  })

  /**
   * Core, not a popular group: a mis-grouped lift should not quietly inflate
   * the number a user is most likely to be reading on the balance chart.
   */
  it('defaults to core for a name it cannot read at all', () => {
    expect(deriveMuscleGroup('Zercher Widowmaker 9000')).toBe('core')
    expect(deriveMuscleGroup('')).toBe('core')
  })

  it('only ever returns a group the schema allows', () => {
    const names = [
      'Bench Press (Barbell)',
      'Nordic Curl',
      'Running (Treadmill)',
      'Zercher Widowmaker 9000',
      'Plank',
      'Leg Press',
    ]
    for (const name of names) {
      expect(MUSCLE_GROUPS).toContain(deriveMuscleGroup(name))
    }
  })
})

describe('deriveEquipment', () => {
  it('reads the parenthesised suffix Hevy writes', () => {
    expect(deriveEquipment('Bench Press (Barbell)', 'chest')).toBe('barbell')
    expect(deriveEquipment('Curl (Dumbbell)', 'biceps')).toBe('dumbbell')
    expect(deriveEquipment('Pulldown (Cable)', 'back')).toBe('cable')
    expect(deriveEquipment('Press (Machine)', 'chest')).toBe('machine')
    expect(deriveEquipment('Bench Press (Smith Machine)', 'chest')).toBe('machine')
  })

  it('falls back to bodyweight, and to other for cardio', () => {
    expect(deriveEquipment('Pull Up', 'back')).toBe('bodyweight')
    expect(deriveEquipment('Running', 'cardio')).toBe('other')
  })

  it('only ever returns equipment the picker knows how to group', () => {
    for (const name of ['Bench Press (Barbell)', 'Pull Up', 'Running']) {
      expect(EQUIPMENT).toContain(deriveEquipment(name, deriveMuscleGroup(name)))
    }
  })
})
