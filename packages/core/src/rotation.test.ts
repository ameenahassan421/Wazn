import { describe, expect, it } from 'vitest'
import { dueRoutine, rotationOrder } from './rotation'
import type { RoutineWithRun } from './rotation'

const routine = (
  name: string,
  last_run_at: string | null,
  position = 0,
  created_at = '2026-01-01T00:00:00Z',
): RoutineWithRun => ({
  id: name,
  user_id: 'u1',
  name,
  position,
  created_at,
  updated_at: created_at,
  last_run_at,
})

describe('rotationOrder', () => {
  it('leads with a routine that has never been run', () => {
    const order = rotationOrder([
      routine('Push', '2026-08-01T00:00:00Z'),
      routine('Core', null),
      routine('Pull', '2026-07-01T00:00:00Z'),
    ])
    expect(order.map((r) => r.name)).toEqual(['Core', 'Pull', 'Push'])
  })

  it('orders run routines longest-since-run first', () => {
    const order = rotationOrder([
      routine('Recent', '2026-08-08T00:00:00Z'),
      routine('Stale', '2026-06-01T00:00:00Z'),
      routine('Middle', '2026-07-15T00:00:00Z'),
    ])
    expect(order.map((r) => r.name)).toEqual(['Stale', 'Middle', 'Recent'])
  })

  it('keeps several never-run routines in the user order', () => {
    const order = rotationOrder([
      routine('Third', null, 3),
      routine('First', null, 1),
      routine('Second', null, 2),
    ])
    expect(order.map((r) => r.name)).toEqual(['First', 'Second', 'Third'])
  })

  it('falls back to id when position ties, matching the SQL exactly', () => {
    // `session_brief()` ends `..., r.position, r.id`. The id here is the name,
    // per the builder above, so "Apple" precedes "Banana".
    const order = rotationOrder([routine('Banana', null, 0), routine('Apple', null, 0)])
    expect(order.map((r) => r.name)).toEqual(['Apple', 'Banana'])
  })

  it('does not mutate its input', () => {
    const rows = [routine('B', '2026-08-01T00:00:00Z'), routine('A', null)]
    const before = rows.map((r) => r.name)
    rotationOrder(rows)
    expect(rows.map((r) => r.name)).toEqual(before)
  })

  it('handles an empty list', () => {
    expect(rotationOrder([])).toEqual([])
  })
})

describe('dueRoutine', () => {
  it('is null with nothing to choose from', () => {
    expect(dueRoutine([])).toBeNull()
  })

  it('is null with exactly one routine, because the only door is the door', () => {
    expect(dueRoutine([routine('Only', null)])).toBeNull()
  })

  it('is the head of the rotation once there is a real choice', () => {
    const due = dueRoutine([
      routine('Push', '2026-08-01T00:00:00Z'),
      routine('Pull', '2026-06-01T00:00:00Z'),
    ])
    expect(due?.name).toBe('Pull')
  })

  it('prefers a never-run routine over a stale one', () => {
    const due = dueRoutine([
      routine('Stale', '2025-01-01T00:00:00Z'),
      routine('Fresh', null),
    ])
    expect(due?.name).toBe('Fresh')
  })
})
