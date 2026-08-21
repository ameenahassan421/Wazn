import { describe, expect, it } from 'vitest'
import {
  ImportError,
  MAX_PLAUSIBLE_REPS,
  buildCatalogue,
  buildSessions,
  buildSetRows,
  catalogueNames,
  checkPlausible,
  implausibleSets,
  parseHevyDate,
  readCsv,
} from './import_hevy'
import { deriveEquipment, EXTRA_EXERCISES, MUSCLE_GROUPS } from './muscle_groups'
import type { CsvRow } from './import_hevy'

const ALLOWED_GROUPS = new Set([
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'cardio',
])

const rows = readCsv(new URL('../workouts_corrected.csv', import.meta.url).pathname)

describe('parseHevyDate', () => {
  it('reads a Hevy timestamp as America/Chicago', () => {
    // July is CDT (UTC-5).
    expect(parseHevyDate('Jul 19, 2026, 7:01 PM')).toBe('2026-07-20T00:01:00.000Z')
  })

  it('handles standard time', () => {
    // January is CST (UTC-6).
    expect(parseHevyDate('Jan 5, 2026, 7:01 PM')).toBe('2026-01-06T01:01:00.000Z')
  })

  it('handles midnight and noon across the AM/PM boundary', () => {
    expect(parseHevyDate('Jul 19, 2026, 12:30 AM')).toBe('2026-07-19T05:30:00.000Z')
    expect(parseHevyDate('Jul 19, 2026, 12:30 PM')).toBe('2026-07-19T17:30:00.000Z')
  })

  it('resolves a wall clock on the spring-forward day', () => {
    // 2026-03-08: clocks jump 2am -> 3am. 3:30am is already CDT.
    expect(parseHevyDate('Mar 8, 2026, 3:30 AM')).toBe('2026-03-08T08:30:00.000Z')
    expect(parseHevyDate('Mar 8, 2026, 1:30 AM')).toBe('2026-03-08T07:30:00.000Z')
  })

  it('treats an empty end_time as null rather than failing', () => {
    expect(parseHevyDate('')).toBeNull()
    expect(parseHevyDate('   ')).toBeNull()
  })

  it('refuses an unrecognised format instead of guessing', () => {
    expect(() => parseHevyDate('2026-07-19 19:01')).toThrow(/Unrecognised date/)
  })
})

describe('exercise catalogue', () => {
  const names = catalogueNames(rows)

  it('covers every distinct exercise in the export plus the program lifts', () => {
    const csvNames = new Set(rows.map((r) => r.exercise_title.trim()))
    expect(csvNames.size).toBe(131)
    expect(names).toHaveLength(134)
    for (const extra of EXTRA_EXERCISES) expect(names).toContain(extra)
  })

  it('maps every name to one of the eleven allowed muscle groups', () => {
    for (const name of names) {
      expect(MUSCLE_GROUPS[name], `${name} has no muscle group`).toBeDefined()
      expect(ALLOWED_GROUPS.has(MUSCLE_GROUPS[name])).toBe(true)
    }
  })

  it('invents no muscle group beyond the allowed set', () => {
    const used = new Set(Object.values(MUSCLE_GROUPS))
    for (const group of used) expect(ALLOWED_GROUPS.has(group)).toBe(true)
  })

  it('derives equipment from the parenthetical suffix only', () => {
    expect(deriveEquipment('Bench Press (Barbell)', 'chest')).toBe('barbell')
    expect(deriveEquipment('Chest Fly (Dumbbell)', 'chest')).toBe('dumbbell')
    expect(deriveEquipment('Lat Pulldown (Cable)', 'back')).toBe('cable')
    expect(deriveEquipment('Leg Press (Machine)', 'quads')).toBe('machine')
    expect(deriveEquipment('Hip Thrust (Smith Machine)', 'glutes')).toBe('machine')
    expect(deriveEquipment('Chin Up', 'back')).toBe('bodyweight')
    expect(deriveEquipment('Treadmill', 'cardio')).toBe('other')
  })

  it('marks nothing as custom and leaves seeded rows unowned', () => {
    for (const exercise of buildCatalogue(names)) {
      expect(exercise.is_custom).toBe(false)
      expect(exercise.owner_id).toBeNull()
    }
  })

  it('rejects a name with no mapping rather than importing it blind', () => {
    expect(() => buildCatalogue(['Nonexistent Lift'])).toThrow(/No muscle group mapped/)
  })
})

describe('workout grouping', () => {
  const sessions = buildSessions(rows)

  it('groups the export into the expected workouts', () => {
    expect(sessions).toHaveLength(149)
    expect(sessions.reduce((total, s) => total + s.rows.length, 0)).toBe(rows.length)
  })

  it('keys each workout on a distinct start instant', () => {
    expect(new Set(sessions.map((s) => s.startedAt)).size).toBe(sessions.length)
  })

  it('carries the workout title through as the name', () => {
    expect(sessions[0].name).toBe('Upper')
    expect(sessions[0].startedAt).toBe('2026-07-20T00:01:00.000Z')
    expect(sessions[0].endedAt).toBe('2026-07-20T01:10:00.000Z')
  })
})

describe('set conversion', () => {
  const exerciseIds = new Map(catalogueNames(rows).map((name) => [name, `id-${name}`]))
  const all = buildSessions(rows).flatMap((session) =>
    buildSetRows(session, 'workout-1', exerciseIds),
  )

  it('converts every row in the export', () => {
    expect(all).toHaveLength(3197)
  })

  it('converts pounds to kilograms at two decimals', () => {
    const row = { ...blankRow, weight_lbs: '130', reps: '6' }
    const [set] = buildSetRows(sessionOf(row), 'w', exerciseIds)
    expect(set.weight_kg).toBe(58.97)
    expect(set.reps).toBe(6)
  })

  it('converts miles to whole metres', () => {
    const row = { ...blankRow, distance_miles: '0.5', duration_seconds: '600' }
    const [set] = buildSetRows(sessionOf(row), 'w', exerciseIds)
    expect(set.distance_meters).toBe(805)
    expect(set.duration_seconds).toBe(600)
  })

  it('keeps duration-only rows (cardio, planks) with a null weight and reps', () => {
    const durationOnly = all.filter(
      (s) => s.duration_seconds !== null && s.reps === null,
    )
    expect(durationOnly.length).toBeGreaterThan(0)
    for (const set of durationOnly) expect(set.reps).toBeNull()
  })

  it('leaves a missing weight null instead of zero', () => {
    const [set] = buildSetRows(sessionOf({ ...blankRow, reps: '9' }), 'w', exerciseIds)
    expect(set.weight_kg).toBeNull()
    expect(set.reps).toBe(9)
  })

  it('takes set_index as set_number without renumbering', () => {
    const [set] = buildSetRows(
      sessionOf({ ...blankRow, set_index: '3', reps: '5' }),
      'w',
      exerciseIds,
    )
    expect(set.set_number).toBe(3)
  })

  it('only ever emits the three allowed set types', () => {
    const types = new Set(all.map((s) => s.set_type))
    expect([...types].sort()).toEqual(['failure', 'normal', 'warmup'])
  })

  it('rejects an unknown set type', () => {
    expect(() =>
      buildSetRows(sessionOf({ ...blankRow, set_type: 'dropset' }), 'w', exerciseIds),
    ).toThrow(/Unknown set_type/)
  })

  it('rejects an exercise that is not in the catalogue', () => {
    expect(() =>
      buildSetRows(
        sessionOf({ ...blankRow, exercise_title: 'Nope' }),
        'w',
        exerciseIds,
      ),
    ).toThrow(/No exercise id/)
  })
})

const blankRow: CsvRow = {
  title: 'Upper',
  start_time: 'Jul 19, 2026, 7:01 PM',
  end_time: 'Jul 19, 2026, 8:10 PM',
  exercise_title: 'Bench Press (Barbell)',
  superset_id: '',
  set_index: '0',
  set_type: 'normal',
  weight_lbs: '',
  reps: '',
  distance_miles: '',
  duration_seconds: '',
  rpe: '',
}

function sessionOf(row: CsvRow) {
  return buildSessions([row])[0]
}

describe('superset_group', () => {
  const ids = new Map([['Bench Press (Barbell)', 'id-bench']])

  it('carries the export superset id onto the set', () => {
    const rows = buildSetRows(sessionOf({ ...blankRow, superset_id: '2' }), 'w-1', ids)
    expect(rows[0].superset_group).toBe(2)
  })

  it('leaves an unsupersetted set null rather than 0', () => {
    // 0 is a valid group id in the export, so an empty string must not
    // collapse to it — every set would look supersetted together.
    const rows = buildSetRows(sessionOf({ ...blankRow }), 'w-1', ids)
    expect(rows[0].superset_group).toBeNull()
  })
})

describe('the implausible-reps guard', () => {
  /**
   * The real row, verbatim. Seated Cable Row at 100 lb for 95 reps, imported
   * from Hevy on 2026-08-21. Epley returns a 416.7 lb estimate, which became
   * this account's largest "win" on the Coach tab and a permanent all-time PR.
   */
  const typo: CsvRow = {
    ...blankRow,
    exercise_title: 'Seated Cable Row - V Grip (Cable)',
    start_time: 'Aug 5, 2026, 7:31 PM',
    end_time: 'Aug 5, 2026, 8:31 PM',
    weight_lbs: '100',
    reps: '95',
  }

  it('catches the set that shipped a 416.7 lb estimate', () => {
    expect(implausibleSets([typo])).toHaveLength(1)
    expect(implausibleSets([typo])[0].reps).toBe(95)
  })

  it('aborts the import, naming the row rather than repairing it', () => {
    expect(() => checkPlausible([typo], false)).toThrow(ImportError)
    expect(() => checkPlausible([typo], false)).toThrow(/95 reps/)
    expect(() => checkPlausible([typo], false)).toThrow(
      /Seated Cable Row - V Grip \(Cable\)/,
    )
  })

  it('imports them unchanged once the caller has looked', () => {
    expect(() => checkPlausible([typo], true)).not.toThrow()
  })

  /**
   * The three 45-to-70 rep Calf Press sets on 2026-05-31 are real training at
   * 15 lb, and they are flagged too. That is the intended cost: the guard is
   * a prompt, not a filter, and `--allow-implausible` is the answer for them.
   * What must NOT happen is a normal working set tripping it.
   */
  it('leaves ordinary working sets alone', () => {
    const ordinary = [
      { ...blankRow, reps: '5' },
      { ...blankRow, reps: '12' },
      { ...blankRow, reps: String(MAX_PLAUSIBLE_REPS) },
      { ...blankRow, reps: '' },
    ]
    expect(implausibleSets(ordinary)).toEqual([])
    expect(() => checkPlausible(ordinary, false)).not.toThrow()
  })

  it('is derived from the history: 25 keeps 3,350 of 3,354 real sets', () => {
    expect(MAX_PLAUSIBLE_REPS).toBe(25)
  })
})
