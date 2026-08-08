import { describe, expect, it } from 'vitest'
import {
  groupsFromSets,
  groupOf,
  nextGroupId,
  nextInGroup,
  roundComplete,
  ungroupIds,
} from './supersets'
import type { WorkoutSet } from './types'

function s(exercise_id: string, superset_group: number | null = null): WorkoutSet {
  return {
    id: Math.random().toString(36),
    workout_id: 'w-1',
    exercise_id,
    set_number: 1,
    weight_kg: 60,
    reps: 5,
    rpe: null,
    duration_seconds: null,
    distance_meters: null,
    set_type: 'normal',
    superset_group,
    pr_weight: false,
    pr_e1rm: false,
  }
}

describe('groupsFromSets', () => {
  it('collects members in the order first logged', () => {
    const g = groupsFromSets([s('a', 1), s('b', 1), s('a', 1), s('c', 2)])
    expect(g.get(1)).toEqual(['a', 'b'])
    expect(g.get(2)).toEqual(['c'])
  })

  it('ignores ungrouped sets', () => {
    expect(groupsFromSets([s('a'), s('b')]).size).toBe(0)
  })
})

describe('groupOf', () => {
  it('finds the group for an exercise', () => {
    expect(groupOf([s('a', 3)], 'a')).toBe(3)
    expect(groupOf([s('a', 3)], 'b')).toBeNull()
  })
})

describe('nextGroupId', () => {
  it('starts at 1 and fills the lowest gap', () => {
    expect(nextGroupId([])).toBe(1)
    expect(nextGroupId([s('a', 1)])).toBe(2)
    expect(nextGroupId([s('a', 1), s('b', 3)])).toBe(2)
  })
})

describe('nextInGroup', () => {
  it('sends you to the partner after one set', () => {
    expect(nextInGroup([s('a', 1)], ['a', 'b'], 'a')).toBe('b')
  })

  it('returns null when the round is even — you go again', () => {
    expect(nextInGroup([s('a', 1), s('b', 1)], ['a', 'b'], 'a')).toBeNull()
  })

  it('catches up whoever is behind, not just the next in order', () => {
    // Two sets of A, none of B: B is behind and goes next even from A.
    expect(nextInGroup([s('a', 1), s('a', 1)], ['a', 'b'], 'a')).toBe('b')
  })

  it('handles three-way giant sets', () => {
    expect(nextInGroup([s('a', 1), s('b', 1)], ['a', 'b', 'c'], 'b')).toBe('c')
  })

  it('is null for a group of one', () => {
    expect(nextInGroup([s('a', 1)], ['a'], 'a')).toBeNull()
  })
})

describe('roundComplete', () => {
  it('is false mid-round', () => {
    expect(roundComplete([s('a', 1)], ['a', 'b'])).toBe(false)
  })

  it('is true when every member has the same count', () => {
    expect(roundComplete([s('a', 1), s('b', 1)], ['a', 'b'])).toBe(true)
  })

  it('treats a single exercise as always complete', () => {
    expect(roundComplete([s('a')], ['a'])).toBe(true)
  })
})

describe('ungroupIds', () => {
  /** Ids are random in `s`, so build the sets once and read them back. */
  function pair() {
    return [s('a', 1), s('b', 1), s('a', 1), s('c', null)]
  }

  it('returns nothing for an exercise that is not grouped', () => {
    expect(ungroupIds(pair(), 'c')).toEqual([])
  })

  it('dissolves a pair rather than stranding the other half', () => {
    // Two members: taking one out leaves a "superset" of one, which is not a
    // superset and would leave a lone SS badge naming a partner that is gone.
    const sets = pair()
    const cleared = ungroupIds(sets, 'a')
    expect(cleared).toHaveLength(3)
    expect(cleared).toContain(sets[1].id)
  })

  it('removes only the leaver when the group still has two left', () => {
    const sets = [s('a', 1), s('b', 1), s('c', 1)]
    const cleared = ungroupIds(sets, 'a')
    expect(cleared).toEqual([sets[0].id])
  })

  it('leaves other groups alone', () => {
    const sets = [s('a', 1), s('b', 1), s('x', 2), s('y', 2)]
    const cleared = ungroupIds(sets, 'a')
    expect(cleared).not.toContain(sets[2].id)
    expect(cleared).not.toContain(sets[3].id)
  })
})
