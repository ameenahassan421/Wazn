import { describe, expect, it } from 'vitest'
import {
  NO_FILTER,
  applyFilter,
  searchByName,
  describeFilter,
  filterActive,
  filterOptions,
} from './exercise-filter'
import type { Exercise } from './types'

function exercise(
  name: string,
  muscle_group: Exercise['muscle_group'],
  equipment: string,
): Exercise {
  return {
    id: name,
    name,
    muscle_group,
    equipment,
    is_custom: false,
    owner_id: null,
    image_url: null,
    default_rest_seconds: null,
  }
}

const catalogue: Exercise[] = [
  exercise('Bench Press (Barbell)', 'chest', 'barbell'),
  exercise('Incline Press (Dumbbell)', 'chest', 'dumbbell'),
  exercise('Bent Over Row (Barbell)', 'back', 'barbell'),
  exercise('Lat Pulldown (Cable)', 'back', 'cable'),
  exercise('Lateral Raise (Cable)', 'shoulders', 'Cable'),
  exercise('Plank', 'core', 'bodyweight'),
]

describe('filterOptions', () => {
  it('lists muscle groups in training order, not alphabetically', () => {
    expect(filterOptions(catalogue).muscleGroups).toEqual([
      'chest',
      'back',
      'shoulders',
      'core',
    ])
  })

  it('offers only groups the catalogue contains, so no chip is a dead end', () => {
    expect(filterOptions(catalogue).muscleGroups).not.toContain('calves')
  })

  it('orders equipment by how much of the catalogue uses it', () => {
    // barbell 2, cable 2 (one capitalised), dumbbell 1, bodyweight 1.
    const { equipment } = filterOptions(catalogue)
    expect(equipment.slice(0, 2).sort()).toEqual(['barbell', 'cable'])
    expect(equipment).toHaveLength(4)
  })

  it('folds the free-text equipment column to one case', () => {
    expect(filterOptions(catalogue).equipment).not.toContain('Cable')
  })
})

describe('applyFilter', () => {
  it('returns the catalogue untouched when nothing is filtered', () => {
    expect(applyFilter(catalogue, NO_FILTER)).toBe(catalogue)
  })

  it('narrows on one dimension', () => {
    const rows = applyFilter(catalogue, { muscleGroup: 'back', equipment: null })
    expect(rows.map((e) => e.name)).toEqual([
      'Bent Over Row (Barbell)',
      'Lat Pulldown (Cable)',
    ])
  })

  it('narrows on both — the two-tap case the gate asks for', () => {
    const rows = applyFilter(catalogue, {
      muscleGroup: 'shoulders',
      equipment: 'cable',
    })
    expect(rows.map((e) => e.name)).toEqual(['Lateral Raise (Cable)'])
  })

  it('matches equipment regardless of the case the import stored', () => {
    const rows = applyFilter(catalogue, { muscleGroup: null, equipment: 'cable' })
    expect(rows).toHaveLength(2)
  })

  it('can return nothing, which the caller has to render as a real state', () => {
    expect(
      applyFilter(catalogue, { muscleGroup: 'core', equipment: 'barbell' }),
    ).toHaveLength(0)
  })
})

describe('filterActive / describeFilter', () => {
  it('knows when nothing is chosen', () => {
    expect(filterActive(NO_FILTER)).toBe(false)
    expect(filterActive({ muscleGroup: 'back', equipment: null })).toBe(true)
  })

  it('names what is filtered, for the empty state to quote', () => {
    expect(describeFilter({ muscleGroup: 'shoulders', equipment: 'cable' })).toBe(
      'cable · shoulders',
    )
    expect(describeFilter({ muscleGroup: 'back', equipment: null })).toBe('back')
  })
})

describe('searchByName', () => {
  const rows = [
    { name: 'Incline Bench Press' },
    { name: 'Bench Press' },
    { name: 'Squat' },
  ]

  it('returns everything for an empty query', () => {
    expect(searchByName(rows, '   ')).toHaveLength(3)
  })

  it('ranks a prefix match above a mere containment', () => {
    // The behaviour that is easy to lose in a rewrite, and the reason this is
    // shared rather than retyped per platform: typing "bench" must offer
    // Bench Press before Incline Bench Press.
    expect(searchByName(rows, 'bench').map((r) => r.name)).toEqual([
      'Bench Press',
      'Incline Bench Press',
    ])
  })

  it('falls back to the caller order on a tie', () => {
    // The web picker hands in usage order, so a lift you actually train wins.
    const usageOrder = [{ name: 'Front Squat' }, { name: 'Back Squat' }]
    expect(searchByName(usageOrder, 'squat').map((r) => r.name)).toEqual([
      'Front Squat',
      'Back Squat',
    ])
  })

  it('is case-insensitive and ignores surrounding space', () => {
    expect(searchByName(rows, '  SQUAT ')).toHaveLength(1)
  })

  it('does not mutate the input', () => {
    const original = [...rows]
    searchByName(rows, 'bench')
    expect(rows).toEqual(original)
  })
})
