import { describe, expect, it } from 'vitest'
import {
  heatStep,
  liftBalance,
  monthlyVolume,
  sessionsPerWeek,
  trainingCalendar,
  underBand,
  weekStart,
} from './progress'
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
