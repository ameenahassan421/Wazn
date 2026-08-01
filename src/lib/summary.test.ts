import { describe, expect, it } from 'vitest'
import { detectPrs, totalVolumeKg, durationSeconds, countsForRecords } from './summary'
import type { Exercise, WorkoutSet } from './types'

const bench: Exercise = {
  id: 'ex-1',
  name: 'Bench Press (Barbell)',
  muscle_group: 'chest',
  equipment: 'barbell',
  is_custom: false,
  owner_id: null,
  image_url: null,
  default_rest_seconds: null,
}

const byId = new Map([[bench.id, bench]])

function set(over: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: Math.random().toString(36),
    workout_id: 'w-1',
    exercise_id: bench.id,
    set_number: 1,
    weight_kg: 60,
    reps: 5,
    rpe: null,
    duration_seconds: null,
    distance_meters: null,
    set_type: 'normal',
    superset_group: null,
    ...over,
  }
}

describe('countsForRecords', () => {
  it('excludes warmups and incomplete sets', () => {
    expect(countsForRecords(set())).toBe(true)
    expect(countsForRecords(set({ set_type: 'warmup' }))).toBe(false)
    expect(countsForRecords(set({ weight_kg: null }))).toBe(false)
    expect(countsForRecords(set({ reps: null }))).toBe(false)
  })

  it('counts failure and drop sets — they are real work', () => {
    expect(countsForRecords(set({ set_type: 'failure' }))).toBe(true)
    expect(countsForRecords(set({ set_type: 'drop' }))).toBe(true)
  })
})

describe('totalVolumeKg', () => {
  it('sums weight times reps', () => {
    expect(
      totalVolumeKg([
        set({ weight_kg: 60, reps: 5 }),
        set({ weight_kg: 50, reps: 10 }),
      ]),
    ).toBe(800)
  })

  it('ignores sets with no weight rather than counting them as zero-crash', () => {
    expect(totalVolumeKg([set({ weight_kg: null, reps: 10 })])).toBe(0)
  })
})

describe('durationSeconds', () => {
  it('measures the gap', () => {
    expect(durationSeconds('2026-08-01T18:00:00Z', '2026-08-01T19:02:30Z')).toBe(3750)
  })

  it('returns null for an unfinished workout', () => {
    expect(durationSeconds('2026-08-01T18:00:00Z', null)).toBeNull()
  })
})

describe('detectPrs', () => {
  it('reports a weight PR against the previous best', () => {
    const prs = detectPrs(
      [set({ weight_kg: 70, reps: 3 })],
      byId,
      new Map([[bench.id, { weightKg: 65, e1rmKg: 71.5 }]]),
    )
    expect(prs).toHaveLength(1)
    expect(prs[0]).toMatchObject({ kind: 'weight', value: 70, previousBest: 65 })
  })

  it('reports an e1RM PR on a lighter bar for more reps', () => {
    // 60x10 = 80 e1RM beats a previous 70x1 = 72.3, on a lighter bar.
    const prs = detectPrs(
      [set({ weight_kg: 60, reps: 10 })],
      byId,
      new Map([[bench.id, { weightKg: 70, e1rmKg: 72.3 }]]),
    )
    expect(prs).toHaveLength(1)
    expect(prs[0].kind).toBe('e1rm')
  })

  it('does not double-report when the weight PR already covers it', () => {
    const prs = detectPrs(
      [set({ weight_kg: 80, reps: 5 })],
      byId,
      new Map([[bench.id, { weightKg: 65, e1rmKg: 70 }]]),
    )
    expect(prs.map((p) => p.kind)).toEqual(['weight'])
  })

  it('treats a first-ever session as a PR', () => {
    const prs = detectPrs([set()], byId, new Map())
    expect(prs).toHaveLength(1)
    expect(prs[0].previousBest).toBeNull()
  })

  it('never counts a warmup as a PR', () => {
    const prs = detectPrs(
      [set({ weight_kg: 200, set_type: 'warmup' })],
      byId,
      new Map(),
    )
    expect(prs).toEqual([])
  })

  it('reports nothing when the workout does not beat history', () => {
    const prs = detectPrs(
      [set({ weight_kg: 60, reps: 5 })],
      byId,
      new Map([[bench.id, { weightKg: 100, e1rmKg: 120 }]]),
    )
    expect(prs).toEqual([])
  })
})
