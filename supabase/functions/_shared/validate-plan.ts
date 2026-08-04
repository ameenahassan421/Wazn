/**
 * Turning what a model returned into something safe to write to the database.
 *
 * Deliberately free of Deno APIs, network calls and imports, so the test suite
 * can exercise it directly. This is the part of the routine generator that has
 * to be right: everything upstream of it is a suggestion, and everything
 * downstream of it is an INSERT.
 */

export interface AvailableExercise {
  id: string
  name: string
}

export interface PlannedDay {
  name: string
  exercises: { id: string; sets: number; reps: number }[]
}

export interface ValidationResult {
  days: PlannedDay[]
  /** Names the model returned that are not real exercises. */
  dropped: string[]
}

/** Bounds that match the routine editor's own, so a generated routine cannot
 *  express something a hand-built one could not. */
const SETS_MIN = 1
const SETS_MAX = 6
const REPS_MIN = 1
const REPS_MAX = 30
const NAME_MAX = 60

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  // `Number(null)` is 0 and `Number('')` is 0, so a missing field would clamp
  // to the minimum and prescribe a single rep rather than falling back to a
  // sensible default. Absence is checked before conversion, not after.
  if (value === null || value === undefined || value === '') return fallback
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

/**
 * Every exercise name is looked up in the real table, even though the model
 * was handed the list and told to copy from it. A model that is told to pick
 * from a list will still occasionally invent one, and the failure mode of
 * trusting it is a routine containing a lift that does not exist.
 *
 * Unknown names are dropped rather than the whole plan rejected: a four-day
 * plan that is real beats a five-day plan with a hallucination in it. A day
 * that loses every exercise is dropped with them.
 */
export function validatePlan(
  raw: unknown,
  available: AvailableExercise[],
  maxDays: number,
): ValidationResult {
  const byName = new Map(available.map((e) => [e.name.toLowerCase().trim(), e]))
  const dropped: string[] = []

  const rawDays = Array.isArray((raw as { days?: unknown })?.days)
    ? ((raw as { days: unknown[] }).days ?? [])
    : []

  const days: PlannedDay[] = []
  for (const day of rawDays.slice(0, maxDays)) {
    const dayName = (day as { name?: unknown })?.name
    const name =
      typeof dayName === 'string' && dayName.trim()
        ? dayName.trim().slice(0, NAME_MAX)
        : 'Day'

    const rawExercises = Array.isArray((day as { exercises?: unknown })?.exercises)
      ? ((day as { exercises: unknown[] }).exercises ?? [])
      : []

    const exercises: PlannedDay['exercises'] = []
    for (const item of rawExercises) {
      const label = (item as { exercise?: unknown })?.exercise
      const key = typeof label === 'string' ? label.toLowerCase().trim() : ''
      const match = key ? byName.get(key) : undefined
      if (!match) {
        if (typeof label === 'string' && label.trim()) dropped.push(label.trim())
        continue
      }
      exercises.push({
        id: match.id,
        sets: clamp((item as { sets?: unknown }).sets, SETS_MIN, SETS_MAX, 3),
        reps: clamp((item as { reps?: unknown }).reps, REPS_MIN, REPS_MAX, 8),
      })
    }

    if (exercises.length > 0) days.push({ name, exercises })
  }

  return { days, dropped }
}
