import type { Exercise, WorkoutSet } from './types'
import { estimatedOneRepMax } from './epley'

/**
 * Post-workout summary maths.
 *
 * All of it is derived from sets already in memory — no extra round trip when
 * the user taps Finish. The only query the summary needs is the historical
 * bests for PR comparison, and that is one call for the whole workout.
 */

export interface WorkoutSummary {
  durationSeconds: number | null
  totalVolumeKg: number
  setCount: number
  exerciseCount: number
  prs: PersonalRecord[]
}

export interface PersonalRecord {
  exerciseId: string
  exerciseName: string
  kind: 'weight' | 'e1rm'
  /** kg for weight, estimated kg for e1rm. */
  value: number
  previousBest: number | null
}

/** Warm-ups and sets missing weight or reps never count. Plan section 5. */
export function countsForRecords(set: WorkoutSet): boolean {
  return set.set_type !== 'warmup' && set.weight_kg !== null && set.reps !== null
}

export function totalVolumeKg(sets: WorkoutSet[]): number {
  return sets.reduce((sum, s) => {
    if (s.weight_kg === null || s.reps === null) return sum
    return sum + s.weight_kg * s.reps
  }, 0)
}

export function durationSeconds(
  startedAt: string,
  endedAt: string | null,
): number | null {
  if (!endedAt) return null
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 1000) : null
}

/**
 * PRs hit in this workout, against bests from every earlier workout.
 *
 * Two kinds, because they answer different questions: heaviest single weight
 * (did I move more iron?) and best estimated 1RM (did I get stronger?). A
 * 5×5 that beats a 1×3 on e1RM is a real PR even though the bar was lighter.
 *
 * `previousBests` must EXCLUDE this workout's sets, or every first set of a
 * new exercise reports a PR against itself.
 */
export function detectPrs(
  sets: WorkoutSet[],
  exercisesById: Map<string, Exercise>,
  previousBests: Map<string, { weightKg: number; e1rmKg: number }>,
): PersonalRecord[] {
  const best = new Map<string, { weightKg: number; e1rmKg: number }>()

  for (const s of sets) {
    if (!countsForRecords(s)) continue
    const w = s.weight_kg!
    const e = estimatedOneRepMax(w, s.reps, s.set_type) ?? 0
    const cur = best.get(s.exercise_id)
    best.set(s.exercise_id, {
      weightKg: Math.max(cur?.weightKg ?? 0, w),
      e1rmKg: Math.max(cur?.e1rmKg ?? 0, e),
    })
  }

  const prs: PersonalRecord[] = []
  for (const [exerciseId, todays] of best) {
    const name = exercisesById.get(exerciseId)?.name ?? 'Exercise'
    const prior = previousBests.get(exerciseId)

    if (todays.weightKg > (prior?.weightKg ?? 0)) {
      prs.push({
        exerciseId,
        exerciseName: name,
        kind: 'weight',
        value: todays.weightKg,
        previousBest: prior?.weightKg ?? null,
      })
    }
    // Only report an e1RM PR when it is not just restating the weight PR.
    if (
      todays.e1rmKg > (prior?.e1rmKg ?? 0) &&
      todays.weightKg <= (prior?.weightKg ?? 0)
    ) {
      prs.push({
        exerciseId,
        exerciseName: name,
        kind: 'e1rm',
        value: todays.e1rmKg,
        previousBest: prior?.e1rmKg ?? null,
      })
    }
  }

  return prs
}

export function summarise(
  sets: WorkoutSet[],
  startedAt: string,
  endedAt: string | null,
  exercisesById: Map<string, Exercise>,
  previousBests: Map<string, { weightKg: number; e1rmKg: number }>,
): WorkoutSummary {
  return {
    durationSeconds: durationSeconds(startedAt, endedAt),
    totalVolumeKg: totalVolumeKg(sets),
    setCount: sets.length,
    exerciseCount: new Set(sets.map((s) => s.exercise_id)).size,
    prs: detectPrs(sets, exercisesById, previousBests),
  }
}
