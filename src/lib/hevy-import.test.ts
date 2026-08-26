import { describe, expect, it } from 'vitest'
import {
  LBS_TO_KG,
  afterCutoff,
  analyse,
  parseHevyDate,
  setRowsFor,
} from './hevy-import'
import type { PlannedWorkout } from './hevy-import'

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

  it('reads the MONTH-FIRST form a US-locale export writes', () => {
    // The format of `workouts_corrected.csv`, this repo's own Hevy export and
    // the source of every row in production — and the one form this parser did
    // not know until 2026-08-26. Running the native importer against that file
    // reported 3,197 rows with "a date this app could not read", which is all
    // of them. `scripts/import_hevy.ts` has parsed it correctly since the seed.
    expect(parseHevyDate('Jul 19, 2026, 7:01 PM', 'America/Chicago')).toBe(
      '2026-07-20T00:01:00.000Z',
    )
  })

  it('gets midnight and noon right, which is where a meridiem parser fails', () => {
    // 12 AM is hour 0 and 12 PM is hour 12. A `+ 12` without the `% 12` makes
    // noon into midnight of the next day, silently, on one row in twelve.
    expect(parseHevyDate('Jul 19, 2026, 12:30 AM', 'UTC')).toBe(
      '2026-07-19T00:30:00.000Z',
    )
    expect(parseHevyDate('Jul 19, 2026, 12:30 PM', 'UTC')).toBe(
      '2026-07-19T12:30:00.000Z',
    )
  })

  it('reads a month-first export with no meridiem as a 24-hour clock', () => {
    expect(parseHevyDate('Jul 19, 2026, 19:01', 'UTC')).toBe('2026-07-19T19:01:00.000Z')
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

/**
 * The second import.
 *
 * The importer was written for a switcher's first session against an empty
 * account, and it was never told what the log already held. `writeWorkout` is
 * a plain insert, `public.workouts` has no unique constraint beyond its
 * primary key, and the resume counter only skips within one interrupted run.
 * So importing the same export twice wrote every session again: 149 workouts
 * became 298, volume doubled, and every e1RM, plateau and forecast built on
 * them became fiction.
 *
 * Nothing warned. That is the part these tests exist for.
 */
describe('analyse — a log that already has workouts in it', () => {
  // 18:04 Chicago on 21 Oct 2025 is 23:04Z; the second is a day later.
  const FIRST = '2025-10-21T23:04:00.000Z'
  const SECOND = '2025-10-22T23:04:00.000Z'
  const two = () =>
    file(
      row(),
      row({ start_time: '22 Oct 2025, 18:04', exercise_title: 'Squat (Barbell)' }),
    )

  it('writes nothing twice when the file has already been imported', () => {
    const plan = analyse(two(), CATALOGUE, 'America/Chicago', [FIRST, SECOND])
    expect(plan.workouts).toHaveLength(0)
    expect(plan.duplicates).toBe(2)
    expect(plan.fatal).toBe('Every session in that file is already in your log.')
  })

  it('keeps only the sessions the log has never seen', () => {
    const plan = analyse(two(), CATALOGUE, 'America/Chicago', [FIRST])
    expect(plan.workouts.map((w) => w.startedAt)).toEqual([SECOND])
    expect(plan.duplicates).toBe(1)
    // The preview must not promise sets it will not write.
    expect(plan.setCount).toBe(1)
  })

  it('says so, rather than skipping silently', () => {
    const plan = analyse(two(), CATALOGUE, 'America/Chicago', [FIRST])
    expect(plan.problems.join(' ')).toContain('already in your log')
  })

  it('is unchanged for a first import', () => {
    // Every existing caller passes no fourth argument, and must behave
    // exactly as it did.
    const plan = analyse(two(), CATALOGUE, 'America/Chicago')
    expect(plan.workouts).toHaveLength(2)
    expect(plan.duplicates).toBe(0)
    expect(plan.latestLogged).toBeNull()
    expect(plan.problems.join(' ')).not.toContain('already in your log')
  })

  it('flags a session inside the logged period that matched nothing', () => {
    // This is what a timezone difference looks like: the same session, hours
    // off, matching no instant. It is NOT dropped — it might be a real session
    // this app has never seen — but the user is told.
    const shifted = file(row({ start_time: '21 Oct 2025, 12:04' }))
    const plan = analyse(shifted, CATALOGUE, 'America/Chicago', [FIRST, SECOND])
    expect(plan.workouts).toHaveLength(1)
    expect(plan.overlapping).toBe(1)
    expect(plan.problems.join(' ')).toContain('did not match one')
  })

  it('reports the newest logged session, for the cutoff to be offered against', () => {
    const plan = analyse(two(), CATALOGUE, 'America/Chicago', [SECOND, FIRST])
    expect(plan.latestLogged).toBe(SECOND)
  })
})

describe('afterCutoff', () => {
  const FIRST = '2025-10-21T23:04:00.000Z'
  const three = () =>
    file(
      row(),
      row({ start_time: '22 Oct 2025, 18:04' }),
      row({ start_time: '23 Oct 2025, 18:04' }),
    )

  it('drops everything on or before the cutoff', () => {
    const plan = analyse(three(), CATALOGUE, 'America/Chicago')
    const cut = afterCutoff(plan, FIRST)
    expect(cut.workouts.map((w) => w.startedAt)).toEqual([
      '2025-10-22T23:04:00.000Z',
      '2025-10-23T23:04:00.000Z',
    ])
    expect(cut.setCount).toBe(2)
    expect(cut.range?.from).toBe('2025-10-22T23:04:00.000Z')
  })

  it('is the defence that survives a timezone difference', () => {
    // None of these instants match the log, so exact-instant dedupe saves
    // nothing. The cutoff still does.
    const shifted = file(
      row({ start_time: '21 Oct 2025, 12:04' }),
      row({ start_time: '23 Oct 2025, 12:04' }),
    )
    const plan = analyse(shifted, CATALOGUE, 'America/Chicago', [FIRST])
    expect(plan.duplicates).toBe(0)
    expect(afterCutoff(plan, FIRST).workouts).toHaveLength(1)
  })

  it('returns the plan untouched when there is no cutoff', () => {
    const plan = analyse(three(), CATALOGUE, 'America/Chicago')
    expect(afterCutoff(plan, null)).toBe(plan)
  })

  it('can empty the plan without throwing', () => {
    const plan = analyse(three(), CATALOGUE, 'America/Chicago')
    const cut = afterCutoff(plan, '2030-01-01T00:00:00.000Z')
    expect(cut.workouts).toHaveLength(0)
    expect(cut.range).toBeNull()
    expect(cut.setCount).toBe(0)
  })
})

describe('setRowsFor', () => {
  const planned: PlannedWorkout = {
    name: 'Push',
    startedAt: '2026-08-01T10:00:00.000Z',
    endedAt: '2026-08-01T11:00:00.000Z',
    sets: [
      {
        setNumber: 1,
        weightKg: 60,
        reps: 5,
        rpe: 8,
        durationSeconds: null,
        distanceMeters: null,
        setType: 'normal',
        supersetGroup: 2,
        exerciseName: 'Bench Press (Barbell)',
      },
      {
        setNumber: 2,
        weightKg: 40,
        reps: 10,
        rpe: null,
        durationSeconds: null,
        distanceMeters: null,
        setType: 'warmup',
        supersetGroup: null,
        exerciseName: 'Nothing In The Catalogue',
      },
    ],
  }

  it('carries every column the board reads, superset and RPE included', () => {
    const rows = setRowsFor(planned, 'w-1', new Map([['bench press (barbell)', 'e-1']]))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      workout_id: 'w-1',
      exercise_id: 'e-1',
      set_number: 1,
      weight_kg: 60,
      reps: 5,
      rpe: 8,
      duration_seconds: null,
      distance_meters: null,
      set_type: 'normal',
      superset_group: 2,
    })
  })

  it('matches on a trimmed, lowercased name, the way `analyse` does', () => {
    const rows = setRowsFor(planned, 'w-1', new Map([['bench press (barbell)', 'e-1']]))
    expect(rows[0].exercise_id).toBe('e-1')
  })

  it('DROPS a set whose exercise is missing rather than defaulting it', () => {
    // The unmatched names are created up front, so a miss here is a bug
    // upstream. Filing those reps under whichever lift happened to be first
    // would be worse than losing them, and losing them silently is why the
    // caller counts rows before it writes.
    expect(setRowsFor(planned, 'w-1', new Map())).toEqual([])
  })
})
