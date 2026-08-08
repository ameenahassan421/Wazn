import { describe, expect, it } from 'vitest'
import {
  buildBlock,
  dropIndex,
  groupAdjacent,
  mergeOrder,
  moveItem,
  supersetRound,
} from './plan'
import type { PlannedSet } from './plan'
import type { PreviousSessionRow, SetType, WorkoutSet } from './types'

const EXERCISE = 'ex-bench'

function set(
  n: number,
  weight: number | null,
  reps: number | null,
  setType: SetType = 'normal',
): WorkoutSet {
  return {
    id: `set-${n}-${setType}`,
    workout_id: 'w1',
    exercise_id: EXERCISE,
    set_number: n,
    weight_kg: weight,
    reps,
    rpe: null,
    duration_seconds: null,
    distance_meters: null,
    set_type: setType,
    superset_group: null,
    pr_weight: false,
    pr_e1rm: false,
  }
}

function previous(
  n: number,
  weight: number | null,
  reps: number | null,
  setType: SetType = 'normal',
): PreviousSessionRow {
  return {
    workout_id: 'w0',
    started_at: '2026-08-01T18:00:00.000Z',
    set_number: n,
    weight_kg: weight,
    reps,
    set_type: setType,
  }
}

const plan = (reps: (number | null)[]): PlannedSet[] =>
  reps.map((r) => ({ reps: r, setType: 'normal' as SetType }))

describe('buildBlock — where planned rows come from', () => {
  it('gives one blank ghost when there is no routine and no history', () => {
    const block = buildBlock({ exerciseId: EXERCISE, sets: [] })

    expect(block.rows).toHaveLength(1)
    expect(block.rows[0]).toMatchObject({
      kind: 'ghost',
      label: '1',
      weightKg: null,
      reps: null,
    })
    expect(block.planned).toBe(1)
    expect(block.committed).toBe(0)
  })

  it('takes count and both values from the previous session when freestyle', () => {
    const block = buildBlock({
      exerciseId: EXERCISE,
      sets: [],
      previous: [previous(1, 100, 8), previous(2, 100, 8), previous(3, 100, 6)],
    })

    expect(block.rows.map((r) => [r.weightKg, r.reps])).toEqual([
      [100, 8],
      [100, 8],
      [100, 6],
    ])
    expect(block.planned).toBe(3)
  })

  it('takes count and reps from the routine, weight from the previous session', () => {
    const block = buildBlock({
      exerciseId: EXERCISE,
      sets: [],
      previous: [previous(1, 100, 8), previous(2, 100, 8)],
      plan: plan([5, 5, 5, 5]),
    })

    expect(block.rows).toHaveLength(4)
    expect(block.rows.map((r) => r.reps)).toEqual([5, 5, 5, 5])
    // Rows 1-2 match last session's rows; 3-4 fall back to its last one.
    expect(block.rows.map((r) => r.weightKg)).toEqual([100, 100, 100, 100])
  })

  it('leaves the weight blank when a routine plans a lift with no history', () => {
    const block = buildBlock({
      exerciseId: EXERCISE,
      sets: [],
      plan: plan([12, 12, 12]),
    })

    expect(block.rows.map((r) => [r.weightKg, r.reps])).toEqual([
      [null, 12],
      [null, 12],
      [null, 12],
    ])
  })

  it('carries today into the remaining ghosts, so a repeat is one tap', () => {
    const block = buildBlock({
      exerciseId: EXERCISE,
      sets: [set(1, 102.5, 8)],
      previous: [previous(1, 100, 8), previous(2, 100, 8), previous(3, 100, 8)],
    })

    const ghosts = block.rows.filter((r) => r.kind === 'ghost')
    expect(ghosts).toHaveLength(2)
    expect(ghosts.every((g) => g.weightKg === 102.5)).toBe(true)
  })

  it('never plans fewer rows than have already been logged', () => {
    const block = buildBlock({
      exerciseId: EXERCISE,
      sets: [set(1, 100, 8), set(2, 100, 8), set(3, 100, 8), set(4, 100, 8)],
      plan: plan([8, 8]),
    })

    expect(block.committed).toBe(4)
    expect(block.planned).toBe(4)
    expect(block.rows.filter((r) => r.kind === 'ghost')).toHaveLength(0)
  })

  it('does not let a warm-up steal a working number or a previous row', () => {
    const block = buildBlock({
      exerciseId: EXERCISE,
      sets: [set(1, 60, 10, 'warmup'), set(2, 100, 8)],
      previous: [previous(1, 95, 8), previous(2, 95, 8)],
      plan: plan([8, 8]),
    })

    expect(block.rows.map((r) => r.label)).toEqual(['W', '1', '2'])
    expect(block.rows[0].previous).toBeNull()
    expect(block.rows[1].previous).toEqual({ weightKg: 95, reps: 8 })
    expect(block.committed).toBe(1)
  })

  it('ignores the previous session’s warm-ups when planning', () => {
    const block = buildBlock({
      exerciseId: EXERCISE,
      sets: [],
      previous: [previous(1, 40, 12, 'warmup'), previous(2, 100, 8)],
    })

    expect(block.rows).toHaveLength(1)
    expect(block.rows[0]).toMatchObject({ weightKg: 100, reps: 8 })
  })

  it('falls back to a warm-up-only history rather than pretending there is none', () => {
    const block = buildBlock({
      exerciseId: EXERCISE,
      sets: [],
      previous: [previous(1, 40, 12, 'warmup')],
    })

    expect(block.rows[0]).toMatchObject({ weightKg: 40, reps: 12 })
  })

  it('every ghost row is a working set — warm-ups are never ghosted', () => {
    const block = buildBlock({
      exerciseId: EXERCISE,
      sets: [],
      plan: plan([8, 8, 8]),
    })

    expect(block.rows.every((r) => r.setType === 'normal')).toBe(true)
  })
})

describe('buildBlock — the previous ghost and its comparison', () => {
  it('compares a committed row against the same row last session', () => {
    const block = buildBlock({
      exerciseId: EXERCISE,
      sets: [set(1, 102.5, 8), set(2, 100, 8), set(3, 97.5, 8)],
      previous: [previous(1, 100, 8), previous(2, 100, 8), previous(3, 100, 8)],
    })

    expect(block.rows.map((r) => r.delta)).toEqual([2.5, 0, -2.5])
  })

  it('has no comparison for a bodyweight set or a row with no counterpart', () => {
    const block = buildBlock({
      exerciseId: EXERCISE,
      sets: [set(1, null, 12), set(2, 100, 8)],
      previous: [previous(1, 90, 12)],
    })

    expect(block.rows[0].delta).toBeNull()
    expect(block.rows[1].delta).toBeNull()
  })

  it('shows the previous row on a ghost so last time is visible before you lift', () => {
    const block = buildBlock({
      exerciseId: EXERCISE,
      sets: [],
      previous: [previous(1, 100, 8), previous(2, 100, 6)],
    })

    expect(block.rows.map((r) => r.previous)).toEqual([
      { weightKg: 100, reps: 8 },
      { weightKg: 100, reps: 6 },
    ])
  })

  it('keeps a committed row’s identity so it is not remounted on commit', () => {
    const block = buildBlock({ exerciseId: EXERCISE, sets: [set(1, 100, 8)] })
    expect(block.rows[0].key).toBe('set-1-normal')
  })
})

describe('supersetRound', () => {
  const bench = (committed: number, planned: number) => ({
    exerciseId: 'a',
    supersetGroup: 1,
    rows: [],
    committed,
    planned,
  })

  it('is whoever is furthest behind, because a round is not done until both are', () => {
    expect(supersetRound([bench(2, 3), { ...bench(1, 3), exerciseId: 'b' }])).toEqual({
      round: 2,
      total: 3,
    })
  })

  it('never runs past the planned rounds', () => {
    expect(supersetRound([bench(3, 3), { ...bench(3, 3), exerciseId: 'b' }])).toEqual({
      round: 3,
      total: 3,
    })
  })
})

describe('mergeOrder', () => {
  it('keeps the stored order and appends what it has not heard about', () => {
    expect(mergeOrder(['c', 'a'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b'])
  })

  it('drops ids that are no longer in the workout', () => {
    expect(mergeOrder(['gone', 'a'], ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('is stable when nothing has changed', () => {
    expect(mergeOrder(['a', 'b'], ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('derives the order from the workout when nothing is stored', () => {
    expect(mergeOrder([], ['b', 'a'])).toEqual(['b', 'a'])
  })
})

describe('groupAdjacent', () => {
  const groups: Record<string, number | null> = { a: 1, b: null, c: 1, d: 2, e: 2 }
  const groupOf = (id: string) => groups[id] ?? null

  it('pulls a split superset back together at the first member’s place', () => {
    expect(groupAdjacent(['a', 'b', 'c'], groupOf)).toEqual(['a', 'c', 'b'])
  })

  it('leaves an already-adjacent group untouched', () => {
    expect(groupAdjacent(['d', 'e', 'b'], groupOf)).toEqual(['d', 'e', 'b'])
  })

  it('does not merge different groups', () => {
    expect(groupAdjacent(['a', 'd', 'c', 'e'], groupOf)).toEqual(['a', 'c', 'd', 'e'])
  })
})

describe('moveItem', () => {
  it('moves down', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
  })

  it('moves up', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('is a no-op out of range or in place', () => {
    expect(moveItem(['a', 'b'], 0, 0)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], -1, 1)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 0, 9)).toEqual(['a', 'b'])
  })

  it('does not mutate its input', () => {
    const items = ['a', 'b']
    moveItem(items, 0, 1)
    expect(items).toEqual(['a', 'b'])
  })
})

describe('dropIndex', () => {
  it('settles on the nearest centre rather than the nearest edge', () => {
    const centres = [100, 200, 300]
    expect(dropIndex(centres, 90)).toBe(0)
    expect(dropIndex(centres, 149)).toBe(0)
    expect(dropIndex(centres, 151)).toBe(1)
    expect(dropIndex(centres, 400)).toBe(2)
  })

  it('answers 0 for an empty list rather than -1', () => {
    expect(dropIndex([], 50)).toBe(0)
  })
})
