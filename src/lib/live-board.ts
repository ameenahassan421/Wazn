import { estimatedOneRepMax } from './epley'
import type { SetType } from './types'

/**
 * The live board's arithmetic, with no idea that a screen exists.
 *
 * ── WHY THIS IS HERE AND NOT IN `mobile/` ───────────────────────────────────
 * `mobile/` has no test runner. Its CI job typechecks, lints, checks routes
 * and bundles for both platforms, and that is the right shape for a directory
 * that is almost entirely views. But "which set am I on" and "how much have I
 * lifted" are not view questions, they are the two the whole screen is built
 * around, and putting them in a component would make them unassertable.
 *
 * So they live here, in the shared domain, where `portable.test.ts` guards
 * their purity and a real test file can pin their behaviour. The native store
 * holds state and talks to Supabase; every decision it makes comes from this
 * file.
 */

export interface BoardSet {
  /** 1-based within its exercise, matching `workout_sets.set_number`. */
  setNumber: number
  type: SetType
  /** What the lifter has dialled in. Null on a bodyweight lift. */
  weightKg: number | null
  reps: number | null
  /** True once banked. A committed row is never edited from the board. */
  done: boolean
  /** The same row from the previous session, for the ghost and the LAST line. */
  previousKg: number | null
  previousReps: number | null
}

export interface BoardExercise {
  exerciseId: string
  name: string
  sets: BoardSet[]
}

export interface BoardPosition {
  exerciseIndex: number
  setIndex: number
}

/**
 * The set the lifter is on: the first one not yet banked, in board order.
 *
 * Null means every set is logged, which is the finish state rather than an
 * error. Deliberately a scan and not a stored cursor: a stored index and a
 * mutated list are two representations of one fact, and they drift the first
 * time a set is inserted or removed mid-session.
 */
export function currentPosition(exercises: BoardExercise[]): BoardPosition | null {
  for (let ei = 0; ei < exercises.length; ei += 1) {
    const sets = exercises[ei].sets
    for (let si = 0; si < sets.length; si += 1) {
      if (!sets[si].done) return { exerciseIndex: ei, setIndex: si }
    }
  }
  return null
}

/**
 * Volume banked so far, in kg.
 *
 * `estimatedOneRepMax` is reused as the qualifier rather than re-implementing
 * "is this a working set". It already refuses warm-ups and anything missing
 * either half, and those are exactly the rows that must not contribute. One
 * rule, one place, and the same one `useHome` uses to compute the target, so
 * the number being chased and the number climbing towards it are measured
 * identically. They were not, they would disagree, and a lifter would watch a
 * bar that never reaches 100 percent.
 */
export function bankedVolumeKg(exercises: BoardExercise[]): number {
  let total = 0
  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      if (!set.done) continue
      if (estimatedOneRepMax(set.weightKg, set.reps, set.type) === null) continue
      total += (set.weightKg ?? 0) * (set.reps ?? 0)
    }
  }
  return total
}

/**
 * How far along the momentum bar is, 0 to 100 and clamped at neither end by
 * accident.
 *
 * Returns null when there is no target, which is day one. The bar renders
 * nothing rather than a full or empty track, because both of those are claims:
 * an empty bar says "you have done nothing" and a full one says "you have won",
 * and on a lifter's first session neither is true.
 *
 * NOT clamped at the top. Passing the target is the moment the design turns
 * the bar brass and the kicker reads RECORD PACE, so the caller needs to know
 * it happened; the FILL is clamped where it is drawn, not here.
 */
export function momentumPct(bankedKg: number, targetKg: number | null): number | null {
  if (targetKg === null || targetKg <= 0) return null
  return (bankedKg / targetKg) * 100
}

/**
 * Seed a board from the previous session of the same lifts.
 *
 * The ghost values are the previous session's row-for-row, which is what the
 * v5 reference shows on the LAST line and what `verdictFor` reasons from. A
 * lift with no matching row gets nulls, and the screen shows a blank rather
 * than inventing a starting weight: a suggested number the lifter did not
 * choose is the one kind of wrong this app cannot afford, because they will
 * load the bar with it.
 */
export function seedBoard(
  plan: { exerciseId: string; name: string; sets: number }[],
  previous: {
    exerciseId: string
    setNumber: number
    weightKg: number | null
    reps: number | null
    type: SetType
  }[],
): BoardExercise[] {
  return plan.map((entry) => ({
    exerciseId: entry.exerciseId,
    name: entry.name,
    sets: Array.from({ length: Math.max(1, entry.sets) }, (_, i) => {
      const setNumber = i + 1
      const match = previous.find(
        (p) => p.exerciseId === entry.exerciseId && p.setNumber === setNumber,
      )
      return {
        setNumber,
        type: 'normal' as SetType,
        // Pre-dialled to what they did last time. This is the repeat-set
        // path GATE U2 measures: if the previous values are already in the
        // zones, banking the same set again is one tap and nothing else.
        weightKg: match?.weightKg ?? null,
        reps: match?.reps ?? null,
        done: false,
        previousKg: match?.weightKg ?? null,
        previousReps: match?.reps ?? null,
      }
    }),
  }))
}

/**
 * Bank the set at `position`, returning a NEW board.
 *
 * Immutable because the store hands this straight to React. Out-of-range
 * positions return the board unchanged rather than throwing: the only way to
 * get one is a commit racing a finish, and losing that race should cost the
 * lifter nothing.
 */
export function bankSet(
  exercises: BoardExercise[],
  position: BoardPosition,
  weightKg: number | null,
  reps: number | null,
): BoardExercise[] {
  const target = exercises[position.exerciseIndex]?.sets[position.setIndex]
  if (target === undefined || target.done) return exercises

  return exercises.map((exercise, ei) => {
    if (ei !== position.exerciseIndex) return exercise
    return {
      ...exercise,
      sets: exercise.sets.map((set, si) =>
        si === position.setIndex ? { ...set, weightKg, reps, done: true } : set,
      ),
    }
  })
}
