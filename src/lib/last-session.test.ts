import { describe, expect, it } from 'vitest'

import { lastLoggedSession, sessionVolume, type SessionRow } from './last-session'

const working = (weight: number, reps: number) => ({
  weight_kg: weight,
  reps,
  set_type: 'normal',
})

const session = (name: string, startedAt: string, sets: SessionRow['sets']) => ({
  name,
  started_at: startedAt,
  sets,
})

describe('sessionVolume', () => {
  it('sums weight by reps over working sets', () => {
    expect(sessionVolume([working(100, 5), working(60, 10)])).toBe(1100)
  })

  it('ignores warm-ups and sets missing either half', () => {
    expect(
      sessionVolume([
        { weight_kg: 100, reps: 5, set_type: 'warmup' },
        { weight_kg: null, reps: 5, set_type: 'normal' },
        { weight_kg: 100, reps: null, set_type: 'normal' },
        working(50, 2),
      ]),
    ).toBe(100)
  })

  it('is zero for a session with no sets at all', () => {
    expect(sessionVolume([])).toBe(0)
  })
})

describe('lastLoggedSession', () => {
  /**
   * The defect, verbatim. Seen on a simulator 2026-08-21: an account with 163
   * workouts and 3,476 sets rendered "Your first workout / Your log starts
   * today" because the newest finished workout was a 21-second start-and-
   * abandon with no sets.
   */
  it('skips an empty newest session and answers the last real one', () => {
    const found = lastLoggedSession([
      session('Upper', '2026-08-21T20:03:39Z', []),
      session('Lower', '2026-08-20T18:00:00Z', [working(140, 5)]),
    ])
    expect(found).not.toBeNull()
    expect(found?.name).toBe('Lower')
    expect(found?.volumeKg).toBe(700)
    // The date has to travel with it. Taking `started_at` from the empty row
    // would answer "0 days rested" for somebody who has not trained in a
    // month, which is migration 0029's bug in a different function.
    expect(found?.startedAt).toBe('2026-08-20T18:00:00Z')
  })

  it('skips a run of empty sessions, not just one', () => {
    const found = lastLoggedSession([
      session('a', '2026-08-21T00:00:00Z', []),
      session('b', '2026-08-20T00:00:00Z', []),
      session('c', '2026-08-19T00:00:00Z', [
        { weight_kg: 100, reps: 5, set_type: 'warmup' },
      ]),
      session('d', '2026-08-18T00:00:00Z', [working(60, 10)]),
    ])
    expect(found?.name).toBe('d')
  })

  it('answers null when nothing in the window has volume', () => {
    expect(lastLoggedSession([session('a', '2026-08-21T00:00:00Z', [])])).toBeNull()
    expect(lastLoggedSession([])).toBeNull()
  })

  it('takes the newest qualifying row, not the heaviest', () => {
    const found = lastLoggedSession([
      session('light today', '2026-08-21T00:00:00Z', [working(20, 1)]),
      session('heavy last week', '2026-08-14T00:00:00Z', [working(200, 10)]),
    ])
    expect(found?.name).toBe('light today')
  })
})
