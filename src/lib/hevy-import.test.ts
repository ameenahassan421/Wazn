import { describe, expect, it } from 'vitest'
import { LBS_TO_KG, analyse, parseHevyDate } from './hevy-import'

const HEADER =
  'title,start_time,end_time,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_lbs,reps,distance_miles,duration_seconds,rpe'

const row = (over: Partial<Record<string, string>> = {}) => {
  const base: Record<string, string> = {
    title: 'Upper A',
    start_time: '21 Oct 2025, 18:04',
    end_time: '21 Oct 2025, 19:02',
    exercise_title: 'Bench Press (Barbell)',
    superset_id: '',
    exercise_notes: '',
    set_index: '0',
    set_type: 'normal',
    weight_lbs: '225',
    reps: '8',
    distance_miles: '',
    duration_seconds: '',
    rpe: '',
    ...over,
  }
  return (
    HEADER.split(',')
      .map((c) => base[c] ?? '')
      // Hevy's own dates contain a comma ("21 Oct 2025, 18:04"), so a fixture
      // that does not quote them is not a CSV. Getting this wrong first is how
      // the parser proved it splits on unquoted commas correctly.
      .map((v) => (v.includes(',') ? `"${v}"` : v))
      .join(',')
  )
}

const file = (...rows: string[]) => [HEADER, ...rows].join('\n')
const CATALOGUE = ['Bench Press (Barbell)', 'Squat (Barbell)']

describe('parseHevyDate', () => {
  it('reads Hevy’s text format in the given zone', () => {
    // 18:04 in Chicago on 21 Oct 2025 is CDT, UTC-5.
    expect(parseHevyDate('21 Oct 2025, 18:04', 'America/Chicago')).toBe(
      '2025-10-21T23:04:00.000Z',
    )
  })

  it('reads the ISO-ish variant some exports use', () => {
    expect(parseHevyDate('2025-10-21 18:04:00', 'America/Chicago')).toBe(
      '2025-10-21T23:04:00.000Z',
    )
  })

  it('resolves the same wall clock differently across a DST boundary', () => {
    // Same local time, one in CDT (-5) and one in CST (-6).
    expect(parseHevyDate('1 Jul 2025, 12:00', 'America/Chicago')).toBe(
      '2025-07-01T17:00:00.000Z',
    )
    expect(parseHevyDate('1 Jan 2025, 12:00', 'America/Chicago')).toBe(
      '2025-01-01T18:00:00.000Z',
    )
  })

  it('uses the caller’s zone, not a hardcoded one', () => {
    expect(parseHevyDate('1 Jul 2025, 12:00', 'UTC')).toBe('2025-07-01T12:00:00.000Z')
    expect(parseHevyDate('1 Jul 2025, 12:00', 'Africa/Cairo')).toBe(
      '2025-07-01T09:00:00.000Z',
    )
  })

  it('is null for anything it cannot read, rather than an invalid date', () => {
    expect(parseHevyDate('', 'UTC')).toBeNull()
    expect(parseHevyDate(undefined, 'UTC')).toBeNull()
    expect(parseHevyDate('not a date', 'UTC')).toBeNull()
    expect(parseHevyDate('21 Xxx 2025, 18:04', 'UTC')).toBeNull()
  })
})

describe('analyse — the wrong file', () => {
  it('names what is missing and where to get the right file', () => {
    const plan = analyse('a,b\n1,2', CATALOGUE, 'UTC')
    expect(plan.fatal).toMatch(/does not look like a Hevy export/)
    expect(plan.fatal).toMatch(/Export Data/)
    expect(plan.workouts).toHaveLength(0)
  })

  it('refuses an empty file', () => {
    expect(analyse('', CATALOGUE, 'UTC').fatal).toMatch(/no rows/)
  })

  it('refuses a file whose every row is unreadable', () => {
    const plan = analyse(file(row({ start_time: 'nonsense' })), CATALOGUE, 'UTC')
    expect(plan.fatal).toMatch(/Nothing in that file/)
  })
})

describe('analyse — a real export', () => {
  it('groups rows into workouts by start time', () => {
    const plan = analyse(
      file(
        row({ set_index: '0' }),
        row({ set_index: '1', weight_lbs: '230' }),
        row({ start_time: '23 Oct 2025, 18:00', title: 'Lower A' }),
      ),
      CATALOGUE,
      'UTC',
    )
    expect(plan.fatal).toBeNull()
    expect(plan.workouts).toHaveLength(2)
    expect(plan.workouts[0].sets).toHaveLength(2)
    expect(plan.workouts[1].name).toBe('Lower A')
    expect(plan.setCount).toBe(3)
  })

  it('orders workouts oldest first and reports the range', () => {
    const plan = analyse(
      file(
        row({ start_time: '23 Oct 2025, 18:00' }),
        row({ start_time: '21 Oct 2025, 18:00' }),
      ),
      CATALOGUE,
      'UTC',
    )
    expect(plan.workouts[0].startedAt < plan.workouts[1].startedAt).toBe(true)
    expect(plan.range).toEqual({
      from: '2025-10-21T18:00:00.000Z',
      to: '2025-10-23T18:00:00.000Z',
    })
  })

  it('converts pounds to kilograms, because storage is always kg', () => {
    const plan = analyse(file(row({ weight_lbs: '225' })), CATALOGUE, 'UTC')
    expect(plan.workouts[0].sets[0].weightKg).toBeCloseTo(225 * LBS_TO_KG, 2)
  })

  /**
   * Hevy names the weight column after the account's unit. The Node importer
   * reads `weight_lbs` unconditionally, which for a kg account would make
   * every weight silently null — the defect this column check exists to stop.
   */
  it('reads a kg export without converting it', () => {
    const header = HEADER.replace('weight_lbs', 'weight_kg')
    const text = [header, row({ weight_lbs: '102.5' })].join('\n')
    expect(analyse(text, CATALOGUE, 'UTC').workouts[0].sets[0].weightKg).toBe(102.5)
  })

  it('numbers sets from one, not from Hevy’s zero', () => {
    const plan = analyse(
      file(row({ set_index: '0' }), row({ set_index: '1' })),
      CATALOGUE,
      'UTC',
    )
    expect(plan.workouts[0].sets.map((s) => s.setNumber)).toEqual([1, 2])
  })

  it('carries set type, rpe, superset group, duration and distance', () => {
    const plan = analyse(
      file(
        row({
          set_type: 'warmup',
          rpe: '8.5',
          superset_id: '3',
          duration_seconds: '45',
          distance_miles: '1',
        }),
      ),
      CATALOGUE,
      'UTC',
    )
    const set = plan.workouts[0].sets[0]
    expect(set.setType).toBe('warmup')
    expect(set.rpe).toBe(8.5)
    expect(set.supersetGroup).toBe(3)
    expect(set.durationSeconds).toBe(45)
    expect(set.distanceMeters).toBe(1609)
  })

  it('maps an unknown set type to a normal set rather than refusing the row', () => {
    const plan = analyse(file(row({ set_type: 'something_new' })), CATALOGUE, 'UTC')
    expect(plan.workouts[0].sets[0].setType).toBe('normal')
  })

  it('reads a bodyweight set as null weight, not as zero', () => {
    expect(
      analyse(file(row({ weight_lbs: '' })), CATALOGUE, 'UTC').workouts[0].sets[0]
        .weightKg,
    ).toBeNull()
  })
})

describe('analyse — matching against the user’s catalogue', () => {
  it('splits known lifts from ones this app has never seen', () => {
    const plan = analyse(
      file(row(), row({ exercise_title: 'Nordic Curl' })),
      CATALOGUE,
      'UTC',
    )
    expect(plan.matched).toEqual(['Bench Press (Barbell)'])
    expect(plan.unmatched).toEqual(['Nordic Curl'])
  })

  it('matches case-insensitively on a trimmed name', () => {
    const plan = analyse(
      file(row({ exercise_title: '  bench press (barbell)  ' })),
      CATALOGUE,
      'UTC',
    )
    expect(plan.unmatched).toEqual([])
  })

  /**
   * Never dropped. Refusing the whole import over one unknown lift would be
   * the app throwing away someone's training history to protect a lookup
   * table — the exact reason this module does not reuse the script's `fail()`.
   */
  it('keeps an unmatched lift’s sets in the plan', () => {
    const plan = analyse(file(row({ exercise_title: 'Nordic Curl' })), [], 'UTC')
    expect(plan.setCount).toBe(1)
    expect(plan.workouts[0].sets[0].exerciseName).toBe('Nordic Curl')
  })
})

describe('analyse — problems are reported, never silent', () => {
  it('counts rows with no exercise name', () => {
    const plan = analyse(file(row(), row({ exercise_title: '' })), CATALOGUE, 'UTC')
    expect(plan.problems.join(' ')).toMatch(/1 row had no exercise name/)
    expect(plan.setCount).toBe(1)
  })

  it('counts rows with an unreadable date', () => {
    const plan = analyse(file(row(), row({ start_time: 'garbage' })), CATALOGUE, 'UTC')
    expect(plan.problems.join(' ')).toMatch(/1 row had a date/)
    expect(plan.setCount).toBe(1)
  })

  it('says nothing when there is nothing to say', () => {
    expect(analyse(file(row()), CATALOGUE, 'UTC').problems).toEqual([])
  })
})
