import { beforeEach, describe, expect, it } from 'vitest'

import {
  addDraftExercise,
  beginDraft,
  draftChildRows,
  draftIsSavable,
  moveDraftExercise,
  removeDraftExercise,
  renameDraft,
  setDraftSets,
  snapshot,
  subscribe,
} from './routine-draft'

/**
 * The draft store.
 *
 * Worth testing for one reason: the editor screen and the exercise PICKER are
 * separate routes writing into the same object, so nothing on either screen
 * can assert what the other did. Reordering in particular is the classic
 * silent defect, a swap that looks right on screen and saves the set counts
 * against the wrong lifts.
 */
const lift = (n: string) => ({ exerciseId: `id-${n}`, name: n, sets: 3 })

beforeEach(() => {
  beginDraft({ routineId: null, name: '', exercises: [] })
})

describe('routine draft', () => {
  it('starts blank and is not savable', () => {
    expect(snapshot()).toEqual({ routineId: null, name: '', exercises: [] })
    expect(draftIsSavable(snapshot())).toBe(false)
  })

  it('needs BOTH a name and a lift to save', () => {
    renameDraft('Upper push')
    expect(draftIsSavable(snapshot())).toBe(false)
    addDraftExercise('id-1', 'Bench Press')
    expect(draftIsSavable(snapshot())).toBe(true)
  })

  it('refuses a name that is only whitespace', () => {
    renameDraft('   ')
    addDraftExercise('id-1', 'Bench Press')
    expect(draftIsSavable(snapshot())).toBe(false)
  })

  it('accepts the same lift twice', () => {
    addDraftExercise('id-1', 'Bench Press')
    addDraftExercise('id-1', 'Bench Press')
    expect(snapshot().exercises).toHaveLength(2)
  })

  it('moves a lift and keeps its set count with it', () => {
    beginDraft({
      routineId: 'r1',
      name: 'Pull',
      exercises: [
        { ...lift('a'), sets: 1 },
        { ...lift('b'), sets: 2 },
        { ...lift('c'), sets: 3 },
      ],
    })
    moveDraftExercise(1, -1)
    expect(snapshot().exercises.map((e) => [e.name, e.sets])).toEqual([
      ['b', 2],
      ['a', 1],
      ['c', 3],
    ])
  })

  it('does nothing at either end', () => {
    beginDraft({ routineId: null, name: 'x', exercises: [lift('a'), lift('b')] })
    moveDraftExercise(0, -1)
    moveDraftExercise(1, 1)
    expect(snapshot().exercises.map((e) => e.name)).toEqual(['a', 'b'])
  })

  it('removes by index, not by id', () => {
    beginDraft({
      routineId: null,
      name: 'x',
      // The same lift twice: removing "the Bench row" has to mean the one
      // that was pressed, and an id-keyed remove would drop both.
      exercises: [lift('a'), lift('a'), lift('b')],
    })
    removeDraftExercise(0)
    expect(snapshot().exercises.map((e) => e.name)).toEqual(['a', 'b'])
  })

  it('clamps the set count to 1..12', () => {
    addDraftExercise('id-1', 'Bench Press')
    setDraftSets(0, 0)
    expect(snapshot().exercises[0].sets).toBe(1)
    setDraftSets(0, 99)
    expect(snapshot().exercises[0].sets).toBe(12)
  })

  it('hands out a new object on every change, so useSyncExternalStore sees it', () => {
    const before = snapshot()
    let notified = 0
    const off = subscribe(() => {
      notified += 1
    })
    renameDraft('Legs')
    off()
    expect(notified).toBe(1)
    expect(snapshot()).not.toBe(before)
  })
})

describe('draftChildRows', () => {
  /** Sequential, so every assertion below is about identity rather than shape. */
  function counter() {
    let n = 0
    return () => `x${++n}`
  }

  it('numbers positions from 0 and set_number from 1', () => {
    const { exercises, sets } = draftChildRows(
      'r1',
      [
        { exerciseId: 'bench', name: 'Bench', sets: 2 },
        { exerciseId: 'row', name: 'Row', sets: 1 },
      ],
      counter(),
    )
    expect(exercises).toEqual([
      { id: 'x1', routine_id: 'r1', exercise_id: 'bench', position: 0 },
      { id: 'x2', routine_id: 'r1', exercise_id: 'row', position: 1 },
    ])
    expect(sets).toEqual([
      { routine_exercise_id: 'x1', set_number: 1 },
      { routine_exercise_id: 'x1', set_number: 2 },
      { routine_exercise_id: 'x2', set_number: 1 },
    ])
  })

  it('keeps each set batch with its OWN lift when the counts differ', () => {
    /*
     * The defect this exists for. The two lists are built from one array by
     * index, and if they ever fall out of step the set counts land on the
     * wrong lifts — a board that opens with the wrong number of rows, weeks
     * later, with nothing pointing back here. Distinct counts are what make
     * a mispairing visible; three lifts of three sets each would pass either
     * way.
     */
    const { exercises, sets } = draftChildRows(
      'r1',
      [
        { exerciseId: 'a', name: 'A', sets: 1 },
        { exerciseId: 'b', name: 'B', sets: 5 },
        { exerciseId: 'c', name: 'C', sets: 2 },
      ],
      counter(),
    )
    const countFor = (exerciseId: string) => {
      const row = exercises.find((e) => e.exercise_id === exerciseId)
      return sets.filter((s) => s.routine_exercise_id === row?.id).length
    }
    expect([countFor('a'), countFor('b'), countFor('c')]).toEqual([1, 5, 2])
  })

  it('mints a fresh id per lift, so the same lift twice does not collide', () => {
    const { exercises, sets } = draftChildRows(
      'r1',
      [
        { exerciseId: 'bench', name: 'Bench', sets: 3 },
        { exerciseId: 'bench', name: 'Bench', sets: 1 },
      ],
      counter(),
    )
    expect(exercises[0].id).not.toBe(exercises[1].id)
    expect(sets.filter((s) => s.routine_exercise_id === exercises[1].id)).toHaveLength(
      1,
    )
  })

  it('writes no weight, reps or set_type', () => {
    /* A planned weight rendered under "last time" would be the app inventing a
       history. `routinePlan` counts these rows and reads nothing else. */
    const { sets } = draftChildRows(
      'r1',
      [{ exerciseId: 'a', name: 'A', sets: 1 }],
      counter(),
    )
    expect(Object.keys(sets[0]).sort()).toEqual(['routine_exercise_id', 'set_number'])
  })

  it('returns empty lists for an empty draft', () => {
    expect(draftChildRows('r1', [], counter())).toEqual({ exercises: [], sets: [] })
  })
})
