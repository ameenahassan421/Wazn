import { describe, expect, it } from 'vitest'
import {
  bandState,
  e1rmProgress,
  heatStep,
  ladderBands,
  liftBalance,
  monthlyVolume,
  recentRecords,
  repMaxLadder,
  sessionsPerWeek,
  trainingCalendar,
  underBand,
  weekStart,
  weeklyVolume,
} from './progress'
import type { LadderSet } from './progress'
import type { ExerciseBest, MuscleGroupSets, SessionVolumeRow } from './progress'

/** Local-time ISO so the buckets under test see the same day the user would. */
function at(y: number, m: number, d: number, h = 12): string {
  return new Date(y, m - 1, d, h).toISOString()
}

function session(iso: string, volume = 1000): SessionVolumeRow {
  return { workout_id: iso, started_at: iso, volume_kg: volume, set_count: 10 }
}

describe('weekStart', () => {
  it('returns the Monday of the containing week', () => {
    // 2026-08-02 is a Sunday; its week began Monday the 27th of July.
    expect(weekStart(new Date(2026, 7, 2)).getDate()).toBe(27)
    expect(weekStart(new Date(2026, 6, 27)).getDate()).toBe(27)
    // A Monday is its own week start.
    expect(weekStart(new Date(2026, 7, 3)).getDate()).toBe(3)
  })

  it('is idempotent', () => {
    const once = weekStart(new Date(2026, 7, 2))
    expect(weekStart(once).getTime()).toBe(once.getTime())
  })
})

describe('sessionsPerWeek', () => {
  const now = new Date(2026, 7, 2, 12)

  it('counts sessions into their week and keeps empty weeks', () => {
    const rows = [
      session(at(2026, 8, 1)),
      session(at(2026, 7, 30)),
      session(at(2026, 7, 20)),
    ]
    const weeks = sessionsPerWeek(rows, 4, now)
    expect(weeks).toHaveLength(4)
    // Oldest first, current week last.
    expect(weeks[weeks.length - 1].sessions).toBe(2)
    expect(weeks.map((w) => w.sessions).reduce((a, b) => a + b, 0)).toBe(3)
  })

  it('drops sessions older than the window', () => {
    const weeks = sessionsPerWeek([session(at(2025, 1, 1))], 4, now)
    expect(weeks.every((w) => w.sessions === 0)).toBe(true)
  })

  it('returns the requested number of weeks even with no data', () => {
    expect(sessionsPerWeek([], 13, now)).toHaveLength(13)
  })
})

describe('monthlyVolume', () => {
  const now = new Date(2026, 7, 2)

  it('sums volume per calendar month, oldest first', () => {
    const rows = [
      session(at(2026, 8, 1), 500),
      session(at(2026, 8, 2), 700),
      session(at(2026, 7, 15), 300),
    ]
    const months = monthlyVolume(rows, 3, now)
    expect(months).toHaveLength(3)
    expect(months[months.length - 1].volumeKg).toBe(1200)
    expect(months[months.length - 2].volumeKg).toBe(300)
    expect(months[0].volumeKg).toBe(0)
  })

  it('parses the numeric strings PostgREST returns', () => {
    const rows: SessionVolumeRow[] = [
      {
        workout_id: 'a',
        started_at: at(2026, 8, 1),
        volume_kg: '250.5',
        set_count: '4',
      },
    ]
    expect(monthlyVolume(rows, 1, now)[0].volumeKg).toBeCloseTo(250.5)
  })
})

describe('trainingCalendar', () => {
  const now = new Date(2026, 7, 2, 23)

  it('merges two sessions on one day into one cell', () => {
    const days = trainingCalendar(
      [session(at(2026, 8, 1, 7), 400), session(at(2026, 8, 1, 19), 600)],
      2,
      now,
    )
    const loaded = days.filter((d) => d.volumeKg > 0)
    expect(loaded).toHaveLength(1)
    expect(loaded[0].volumeKg).toBe(1000)
  })

  it('never runs past today', () => {
    const days = trainingCalendar([], 4, now)
    expect(days.every((d) => d.date <= now)).toBe(true)
  })
})

describe('heatStep', () => {
  it('separates a rest day from any logged day', () => {
    expect(heatStep(0, 1000)).toBe(0)
    expect(heatStep(1, 1000)).toBe(1)
  })

  it('scales to the busiest day in view', () => {
    expect(heatStep(1000, 1000)).toBe(4)
    expect(heatStep(600, 1000)).toBe(3)
    expect(heatStep(400, 1000)).toBe(2)
    expect(heatStep(100, 1000)).toBe(1)
  })

  it('does not divide by zero when nothing was logged', () => {
    expect(heatStep(5, 0)).toBe(1)
  })
})

describe('liftBalance', () => {
  const bests: ExerciseBest[] = [
    { exercise_id: '1', name: 'Deadlift (Barbell)', best_e1rm_kg: 200 },
    { exercise_id: '2', name: 'Bench Press (Barbell)', best_e1rm_kg: 120 },
    { exercise_id: '3', name: 'Full Squat', best_e1rm_kg: '150' },
  ]

  it('predicts each lift from the deadlift', () => {
    const rows = liftBalance(bests)
    expect(rows.map((r) => r.label)).toEqual(['Deadlift', 'Squat', 'Bench', 'Overhead'])
    expect(rows[0].predictedKg).toBe(200)
    expect(rows[1].predictedKg).toBeCloseTo(170)
    expect(rows[2].predictedKg).toBeCloseTo(150)
  })

  it('reports a missing lift rather than guessing it', () => {
    const overhead = liftBalance(bests).find((r) => r.label === 'Overhead')
    expect(overhead?.measuredKg).toBeNull()
  })

  it('leaves predictions null when there is no deadlift to predict from', () => {
    const rows = liftBalance([bests[1]])
    expect(rows.every((r) => r.predictedKg === null)).toBe(true)
    expect(rows.find((r) => r.label === 'Bench')?.measuredKg).toBe(120)
  })

  it('takes the best when a lift appears more than once', () => {
    const rows = liftBalance([
      ...bests,
      { exercise_id: '4', name: 'Bench Press (Barbell)', best_e1rm_kg: 135 },
    ])
    expect(rows.find((r) => r.label === 'Bench')?.measuredKg).toBe(135)
  })
})

describe('underBand', () => {
  const groups: MuscleGroupSets[] = [
    { muscle_group: 'chest', set_count: 16 },
    { muscle_group: 'calves', set_count: 4 },
    { muscle_group: 'hamstrings', set_count: '6' },
    { muscle_group: 'back', set_count: 22 },
  ]

  it('lists only groups under the band, worst first', () => {
    expect(underBand(groups)).toEqual(['calves', 'hamstrings'])
  })

  it('does not flag a group above the band', () => {
    expect(underBand(groups)).not.toContain('back')
  })
})

describe('weeklyVolume', () => {
  const now = new Date('2026-08-05T12:00:00Z')

  it('buckets by week and keeps empty weeks', () => {
    const rows = [
      {
        workout_id: 'a',
        started_at: '2026-08-04T10:00:00Z',
        volume_kg: 1000,
        set_count: 10,
      },
      {
        workout_id: 'b',
        started_at: '2026-08-05T10:00:00Z',
        volume_kg: 500,
        set_count: 5,
      },
      {
        workout_id: 'c',
        started_at: '2026-07-22T10:00:00Z',
        volume_kg: 800,
        set_count: 8,
      },
    ]
    const weeks = weeklyVolume(rows, 4, now)
    expect(weeks).toHaveLength(4)
    // Two sessions in the current week sum, not overwrite.
    expect(weeks.at(-1)!.volumeKg).toBe(1500)
    // A week with nothing in it is a zero, not a missing point — the gap is
    // the thing the chart is for.
    expect(weeks.some((w) => w.volumeKg === 0)).toBe(true)
  })

  it('parses string numerics from PostgREST', () => {
    const rows = [
      {
        workout_id: 'a',
        started_at: '2026-08-04T10:00:00Z',
        volume_kg: '1234.5',
        set_count: '9',
      },
    ]
    expect(weeklyVolume(rows, 1, now)[0].volumeKg).toBeCloseTo(1234.5)
  })
})

describe('bandState', () => {
  it('splits at the productive band boundaries, inclusive', () => {
    expect(bandState(0)).toBe('under')
    expect(bandState(9)).toBe('under')
    expect(bandState(10)).toBe('in')
    expect(bandState(20)).toBe('in')
    expect(bandState(21)).toBe('over')
  })
})

describe('e1rmProgress', () => {
  const point = (started_at: string, best_1rm_kg: number | string | null) => ({
    started_at,
    best_1rm_kg,
  })

  it('is null when there is nothing to read', () => {
    expect(e1rmProgress([])).toBeNull()
  })

  it('is null when every point is unusable', () => {
    expect(e1rmProgress([point('2026-01-01', null), point('2026-02-01', 0)])).toBeNull()
  })

  it('reads the delta across the whole series, oldest to newest', () => {
    const p = e1rmProgress([
      point('2026-01-01T00:00:00Z', 100),
      point('2026-03-01T00:00:00Z', 110),
    ])
    expect(p).toMatchObject({
      earliest_kg: 100,
      latest_kg: 110,
      delta_kg: 10,
      since_at: '2026-01-01T00:00:00Z',
      sessions: 2,
    })
  })

  it('sorts an out-of-order series rather than trusting it', () => {
    const p = e1rmProgress([
      point('2026-03-01T00:00:00Z', 110),
      point('2026-01-01T00:00:00Z', 100),
    ])
    expect(p?.delta_kg).toBe(10)
    expect(p?.since_at).toBe('2026-01-01T00:00:00Z')
  })

  it('reports a decline as a negative delta', () => {
    const p = e1rmProgress([
      point('2026-01-01T00:00:00Z', 120),
      point('2026-03-01T00:00:00Z', 110),
    ])
    expect(p?.delta_kg).toBe(-10)
  })

  it('keeps the best separate, so being up is not confused with being at your best', () => {
    const p = e1rmProgress([
      point('2026-01-01T00:00:00Z', 100),
      point('2026-02-01T00:00:00Z', 130),
      point('2026-03-01T00:00:00Z', 110),
    ])
    expect(p?.delta_kg).toBe(10)
    expect(p?.best_kg).toBe(130)
    expect(p?.best_at).toBe('2026-02-01T00:00:00Z')
  })

  it('gives a tied best to the earliest date', () => {
    const p = e1rmProgress([
      point('2026-01-01T00:00:00Z', 130),
      point('2026-02-01T00:00:00Z', 130),
    ])
    expect(p?.best_at).toBe('2026-01-01T00:00:00Z')
  })

  it('accepts the numeric strings PostgREST returns', () => {
    const p = e1rmProgress([point('2026-01-01T00:00:00Z', '100.5')])
    expect(p?.latest_kg).toBe(100.5)
    expect(p?.delta_kg).toBe(0)
  })

  it('drops an unusable point without dropping the series', () => {
    const p = e1rmProgress([
      point('2026-01-01T00:00:00Z', 100),
      point('2026-02-01T00:00:00Z', null),
      point('2026-03-01T00:00:00Z', 105),
    ])
    expect(p?.sessions).toBe(2)
    expect(p?.delta_kg).toBe(5)
  })
})

describe('recentRecords', () => {
  const NAMES: Record<string, string> = { e1: 'Bench Press', e2: 'Squat' }
  const nameFor = (id: string) => NAMES[id]
  const rec = (
    exercise_id: string,
    started_at: string,
    { weight = 100, reps = 5, pr_weight = true, pr_e1rm = false } = {},
  ) => ({ exercise_id, started_at, weight_kg: weight, reps, pr_weight, pr_e1rm })

  it('is empty when nothing is flagged', () => {
    expect(
      recentRecords([rec('e1', '2026-01-01', { pr_weight: false })], nameFor),
    ).toEqual([])
  })

  it('orders newest first', () => {
    const out = recentRecords(
      [rec('e1', '2026-01-01T00:00:00Z'), rec('e2', '2026-03-01T00:00:00Z')],
      nameFor,
    )
    expect(out.map((r) => r.name)).toEqual(['Squat', 'Bench Press'])
  })

  it('reports one set that beat both as a single entry', () => {
    const out = recentRecords(
      [rec('e1', '2026-01-01', { pr_weight: true, pr_e1rm: true })],
      nameFor,
    )
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('both')
  })

  it('distinguishes a load record from an estimate record', () => {
    const out = recentRecords(
      [
        rec('e1', '2026-02-01', { pr_weight: true, pr_e1rm: false }),
        rec('e2', '2026-01-01', { pr_weight: false, pr_e1rm: true }),
      ],
      nameFor,
    )
    expect(out.map((r) => r.kind)).toEqual(['weight', 'e1rm'])
  })

  it('excludes a bodyweight set, which cannot be a load record', () => {
    expect(
      recentRecords([{ ...rec('e1', '2026-01-01'), weight_kg: null }], nameFor),
    ).toEqual([])
  })

  it('excludes a set with no reps', () => {
    expect(
      recentRecords([{ ...rec('e1', '2026-01-01'), reps: null }], nameFor),
    ).toEqual([])
  })

  it('skips an exercise the catalogue does not know yet', () => {
    expect(recentRecords([rec('missing', '2026-01-01')], nameFor)).toEqual([])
  })

  it('honours the limit after sorting, not before', () => {
    const out = recentRecords(
      [
        rec('e1', '2026-01-01T00:00:00Z'),
        rec('e2', '2026-05-01T00:00:00Z'),
        rec('e1', '2026-03-01T00:00:00Z'),
      ],
      nameFor,
      2,
    )
    expect(out.map((r) => r.at)).toEqual([
      '2026-05-01T00:00:00Z',
      '2026-03-01T00:00:00Z',
    ])
  })

  it('parses the numeric strings PostgREST returns', () => {
    const out = recentRecords(
      [{ ...rec('e1', '2026-01-01'), weight_kg: '102.5' }],
      nameFor,
    )
    expect(out[0].weight_kg).toBe(102.5)
  })
})

describe('ladderBands', () => {
  const rung = (reps: number, kg: number, at = '2026-01-01') => ({
    reps,
    best_weight_kg: kg,
    achieved_at: at,
  })

  it('is empty for an empty ladder', () => {
    expect(ladderBands([])).toEqual([])
  })

  it('merges the tied top of the ladder into one row', () => {
    expect(ladderBands([rung(1, 102.5), rung(3, 102.5), rung(5, 102.5)])).toEqual([
      { label: '1-5', best_weight_kg: 102.5, achieved_at: '2026-01-01' },
    ])
  })

  it('keeps genuinely different rungs apart', () => {
    const bands = ladderBands([rung(1, 120), rung(3, 120), rung(5, 100), rung(8, 90)])
    expect(bands.map((b) => [b.label, b.best_weight_kg])).toEqual([
      ['1-3', 120],
      ['5', 100],
      ['8', 90],
    ])
  })

  it('does not merge across a gap in weight and back again', () => {
    const bands = ladderBands([rung(1, 120), rung(3, 100), rung(5, 120)])
    expect(bands.map((b) => b.label)).toEqual(['1', '3', '5'])
  })

  it('keeps the earliest date of a merged band', () => {
    const bands = ladderBands([rung(1, 100, '2026-01-01'), rung(3, 100, '2026-03-01')])
    expect(bands[0].achieved_at).toBe('2026-01-01')
  })

  it('leaves a single rung alone', () => {
    expect(ladderBands([rung(8, 80)])).toEqual([
      { label: '8', best_weight_kg: 80, achieved_at: '2026-01-01' },
    ])
  })
})

describe('repMaxLadder', () => {
  const set = (
    weight_kg: number | null,
    reps: number | null,
    set_type = 'normal',
    started_at = '2026-01-01T00:00:00.000Z',
  ): LadderSet => ({ weight_kg, reps, set_type, started_at })

  it('is empty for no sets', () => {
    expect(repMaxLadder([])).toEqual([])
  })

  it('counts one set toward every rung at or below its reps', () => {
    expect(repMaxLadder([set(100, 8)])).toEqual([
      { reps: 1, best_weight_kg: 100, achieved_at: '2026-01-01T00:00:00.000Z' },
      { reps: 3, best_weight_kg: 100, achieved_at: '2026-01-01T00:00:00.000Z' },
      { reps: 5, best_weight_kg: 100, achieved_at: '2026-01-01T00:00:00.000Z' },
      { reps: 8, best_weight_kg: 100, achieved_at: '2026-01-01T00:00:00.000Z' },
    ])
  })

  it('reads as a strength curve when heavy-low and light-high coexist', () => {
    const ladder = repMaxLadder([set(120, 3), set(100, 8)])
    expect(ladder.map((r) => [r.reps, r.best_weight_kg])).toEqual([
      [1, 120],
      [3, 120],
      [5, 100],
      [8, 100],
    ])
  })

  it('never counts a warm-up, however heavy', () => {
    const ladder = repMaxLadder([
      set(140, 3, 'warmup', '2026-01-02T00:00:00.000Z'),
      set(100, 8),
    ])
    expect(ladder.every((r) => r.best_weight_kg === 100)).toBe(true)
  })

  it('counts failure and drop sets, which are real performances', () => {
    expect(repMaxLadder([set(130, 3, 'failure')])[0].best_weight_kg).toBe(130)
    expect(repMaxLadder([set(130, 3, 'drop')])[0].best_weight_kg).toBe(130)
  })

  it('excludes a set missing weight or reps', () => {
    expect(repMaxLadder([set(null, 10), set(100, null)])).toEqual([])
  })

  it('excludes zero and negative values as bad data, not light sets', () => {
    expect(repMaxLadder([set(0, 5), set(100, 0), set(-50, 5), set(80, -5)])).toEqual([])
  })

  it('gives a tied weight to the earliest date', () => {
    const ladder = repMaxLadder([
      set(100, 5, 'normal', '2026-02-01T00:00:00.000Z'),
      set(100, 5, 'normal', '2026-01-01T00:00:00.000Z'),
    ])
    expect(ladder[0].achieved_at).toBe('2026-01-01T00:00:00.000Z')
  })

  it('omits a rung nothing reaches', () => {
    expect(repMaxLadder([set(100, 8)]).some((r) => r.reps === 10)).toBe(false)
  })

  it('returns rungs ascending even when asked out of order', () => {
    const ladder = repMaxLadder([set(100, 12)], [10, 1, 5])
    expect(ladder.map((r) => r.reps)).toEqual([1, 5, 10])
  })

  it('does not mutate its input', () => {
    const sets = [set(100, 8), set(120, 3, 'warmup'), set(null, 5)]
    const before = JSON.stringify(sets)
    repMaxLadder(sets)
    expect(JSON.stringify(sets)).toBe(before)
  })
})
