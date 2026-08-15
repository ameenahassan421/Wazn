import { describe, expect, it } from 'vitest'
import type { Exercise, ExerciseUsageRow } from './types'
import { MAX_VARIATIONS, baseMovement, implementOf, variationsFor } from './variations'

/**
 * The swap's ranking, which is the whole feature.
 *
 * Ameen asked for it in the plainest possible terms: "instead of bench press I
 * can change to dumbbells". That sentence is the first test, and everything
 * else here is about not ruining it — a picker that offers a leg press when
 * the rack is busy is worse than no picker, because it costs a read to reject.
 */

let n = 0
const ex = (
  name: string,
  muscle_group: Exercise['muscle_group'],
  equipment = 'barbell',
  over: Partial<Exercise> = {},
): Exercise => ({
  id: `ex-${(n += 1)}`,
  name,
  muscle_group,
  equipment,
  is_custom: false,
  owner_id: null,
  image_url: null,
  default_rest_seconds: null,
  instructions: null,
  archived_at: null,
  ...over,
})

const BENCH = ex('Bench Press (Barbell)', 'chest')
const BENCH_DB = ex('Bench Press (Dumbbell)', 'chest', 'dumbbell')
const BENCH_CABLE = ex('Bench Press (Cable)', 'chest', 'cable')
const INCLINE_DB = ex('Incline Bench Press (Dumbbell)', 'chest', 'dumbbell')
const CHEST_FLY = ex('Chest Fly (Machine)', 'chest', 'machine')
const LEG_PRESS = ex('Leg Press (Machine)', 'quads', 'machine')
const SQUAT = ex('Squat (Barbell)', 'quads')

const CATALOGUE = [
  BENCH,
  BENCH_DB,
  BENCH_CABLE,
  INCLINE_DB,
  CHEST_FLY,
  LEG_PRESS,
  SQUAT,
]

const usage = (pairs: [string, number][]) =>
  new Map<string, ExerciseUsageRow>(
    pairs.map(([id, set_count]) => [
      id,
      { exercise_id: id, set_count, last_used: null },
    ]),
  )

describe('baseMovement', () => {
  it('strips the implement', () => {
    expect(baseMovement('Bench Press (Barbell)')).toBe('bench press')
    expect(baseMovement('Iso-Lateral Chest Press (Machine)')).toBe(
      'iso-lateral chest press',
    )
  })

  it('leaves a name with no parenthetical alone', () => {
    expect(baseMovement('Cable Crunch')).toBe('cable crunch')
  })
})

describe('implementOf', () => {
  it('reads the trailing parenthetical', () => {
    expect(implementOf('Bench Press (Dumbbell)')).toBe('Dumbbell')
  })

  it('is null when the name declares none', () => {
    expect(implementOf('Cable Crunch')).toBeNull()
  })
})

describe('variationsFor', () => {
  it('offers the dumbbell bench first — the request, verbatim', () => {
    const top = variationsFor(BENCH, CATALOGUE)[0]
    expect(top.exercise.name).toBe('Bench Press (Dumbbell)')
    expect(top.tier).toBe('implement')
    expect(top.reason).toBe('as dumbbell')
  })

  it('ranks a pure implement swap above a named variant', () => {
    // "Incline Bench Press" is a different stimulus. Close, but not what
    // "same lift, other implement" means.
    const names = variationsFor(BENCH, CATALOGUE).map((v) => v.exercise.name)
    expect(names.indexOf('Bench Press (Cable)')).toBeLessThan(
      names.indexOf('Incline Bench Press (Dumbbell)'),
    )
  })

  it('never offers a different muscle group', () => {
    const groups = variationsFor(BENCH, CATALOGUE, new Map(), 99).map(
      (v) => v.exercise.muscle_group,
    )
    expect(groups.every((g) => g === 'chest')).toBe(true)
  })

  it('does not match on a shared word alone', () => {
    // "Leg Press" contains "press". It is not a bench press variant, and a
    // picker that says it is costs a read to reject.
    const names = variationsFor(BENCH, CATALOGUE, new Map(), 99).map(
      (v) => v.exercise.name,
    )
    expect(names).not.toContain('Leg Press (Machine)')
  })

  it('never offers the exercise being swapped', () => {
    const names = variationsFor(BENCH, CATALOGUE, new Map(), 99).map(
      (v) => v.exercise.name,
    )
    expect(names).not.toContain('Bench Press (Barbell)')
  })

  it('never offers an archived lift', () => {
    // Archiving is the user putting a lift away. Suggesting it undoes that
    // decision on their behalf.
    const archived = { ...BENCH_DB, archived_at: '2026-01-01T00:00:00.000Z' }
    const names = variationsFor(BENCH, [BENCH, archived, BENCH_CABLE]).map(
      (v) => v.exercise.name,
    )
    expect(names).not.toContain('Bench Press (Dumbbell)')
  })

  it('breaks a tier tie on what the lifter actually trains', () => {
    // Usage is this app's only honest proxy for "equipment on hand": a machine
    // used forty times is a machine the gym owns.
    const byUsage = variationsFor(
      BENCH,
      CATALOGUE,
      usage([
        [BENCH_CABLE.id, 90],
        [BENCH_DB.id, 2],
      ]),
    )
    expect(byUsage[0].exercise.name).toBe('Bench Press (Cable)')
  })

  it('is stable when nothing distinguishes two candidates', () => {
    const a = variationsFor(BENCH, CATALOGUE).map((v) => v.exercise.id)
    const b = variationsFor(BENCH, CATALOGUE).map((v) => v.exercise.id)
    expect(a).toEqual(b)
  })

  it('falls back to the muscle group when no name matches', () => {
    const only = variationsFor(CHEST_FLY, [CHEST_FLY, BENCH, LEG_PRESS])
    expect(only.map((v) => v.exercise.name)).toEqual(['Bench Press (Barbell)'])
    expect(only[0].tier).toBe('group')
    expect(only[0].reason).toBe('also chest')
  })

  it('returns three by default, because the design says three', () => {
    expect(variationsFor(BENCH, CATALOGUE)).toHaveLength(MAX_VARIATIONS)
  })

  it('returns nothing rather than guessing on a lonely lift', () => {
    expect(variationsFor(SQUAT, [SQUAT])).toEqual([])
  })
})
