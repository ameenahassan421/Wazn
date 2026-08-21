import { estimatedOneRepMax } from './epley'

/**
 * Which session the Home screen should measure the next one against.
 *
 * ── THE BUG THIS EXISTS FOR ─────────────────────────────────────────────────
 * `use-home.ts` asked for the single most recent finished workout and derived
 * its whole state from it: the volume target, the routine name, the days-rested
 * line, and `dayOne`, which is just `target === null`.
 *
 * On 2026-08-21 an account with **163 workouts and 3,476 sets** rendered as a
 * brand-new one — "Welcome, amin", "Your first workout", "Your log starts
 * today" — because the newest finished workout was a 21-second start-and-
 * abandon with no sets. Its volume was zero, so the target was null, so every
 * piece of copy on the screen flipped to first-run. The coach card directly
 * above it was meanwhile quoting "Bench Press (Barbell) 140 lbs x 2 last
 * time", which is how it was noticed: one card contradicting the one above it.
 *
 * It is not a data-import artifact and it is not rare. Any lifter who taps
 * Start, logs nothing, and ends the session gets their history erased from the
 * one screen every workout begins on.
 *
 * ── WHY IT SKIPS RATHER THAN COALESCES ──────────────────────────────────────
 * The hook already carried the right principle one case short: "Finished
 * sessions only. An in-progress workout is not a target — it is the thing you
 * are doing." An EMPTY session is not a target either, for the same reason, so
 * this walks back to the last session that actually moved weight.
 *
 * `daysRested` has to come from the same row or it inherits the mirror defect:
 * an empty session today would answer "0 days rested" for somebody who has not
 * trained in a month. That is migration 0029's scar exactly — the branch that
 * runs when there is nothing to measure must not answer the flattering value.
 */

export interface SessionSet {
  weight_kg: number | null
  reps: number | null
  set_type: string
}

export interface SessionRow {
  name: string | null
  started_at: string | null
  sets: SessionSet[]
}

export interface LastSession {
  /** Total working volume in kg. Always greater than zero. */
  volumeKg: number
  name: string | null
  startedAt: string | null
}

/**
 * Working volume for one session, in kg.
 *
 * `estimatedOneRepMax` is reused as the qualifier rather than re-implementing
 * "is this a working set": it already refuses warm-ups and sets missing either
 * half, and those are exactly the rows that must not contribute volume. One
 * rule, one place.
 */
export function sessionVolume(sets: SessionSet[]): number {
  return sets.reduce((total, set) => {
    if (estimatedOneRepMax(set.weight_kg, set.reps, set.set_type) === null) {
      return total
    }
    return total + (set.weight_kg ?? 0) * (set.reps ?? 0)
  }, 0)
}

/**
 * The most recent session with working volume, or null if none of the rows
 * given has any.
 *
 * `rows` must be newest first. The caller decides how far back to look; null
 * here means "not in the window you asked for", not "never trained", and a
 * caller that treats it as the latter reintroduces the bug above with a
 * longer fuse.
 */
export function lastLoggedSession(rows: SessionRow[]): LastSession | null {
  for (const row of rows) {
    const volumeKg = sessionVolume(row.sets)
    if (volumeKg > 0) {
      return { volumeKg, name: row.name, startedAt: row.started_at }
    }
  }
  return null
}
