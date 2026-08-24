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
  /**
   * How hard the set felt, 6 to 10, or null for "not said".
   *
   * ── WHY IT IS OPTIONAL AND STAYS OPTIONAL ─────────────────────────────
   * `workout_sets.rpe` has existed since 0001 and no client has ever written
   * it, so every row in production is null. A required field would make the
   * commonest logging path slower for a number most lifters do not track,
   * which is exactly the trade this app refuses. Null is a real answer.
   *
   * NOT seeded from the previous session, unlike weight, reps and type. Those
   * are a prescription and RPE is a reading: last week's 8 says nothing about
   * how today's set went, and pre-filling one would put a number the lifter
   * did not choose into their own record of effort.
   */
  rpe: number | null
  /** True once banked. A committed row is never edited from the board. */
  done: boolean
  /** The same row from the previous session, for the ghost and the LAST line. */
  previousKg: number | null
  previousReps: number | null
}

export interface BoardExercise {
  exerciseId: string
  name: string
  /**
   * Whether this lift is done with no external load, from
   * `exercises.equipment`.
   *
   * ── WHY IT IS ON THE EXERCISE AND NOT DERIVED FROM THE WEIGHT ───────────
   * The board used to answer this with `set.weightKg === null`, and the two
   * are not the same question. A null weight means EITHER "this is a pull-up"
   * OR "the lifter has never done this lift, so there is nothing to pre-dial".
   * `seedBoard` produces the second case for every set of any exercise with no
   * history — so the screen hid the weight stepper, and a lift you had never
   * done could not be given a weight at all. Observed on a simulator: Squat
   * set 6 of 6, where the previous session had five sets, rendered with a REPS
   * control and nothing else.
   *
   * `addExercise` already knew the difference and encoded it the same lossy
   * way, as `weightKg: bodyweight ? null : 0`. Carrying the fact means the
   * value no longer has to double as a flag.
   */
  bodyweight: boolean
  /**
   * Which superset this lift is part of during THIS session, or null.
   *
   * On the exercise rather than on each set, mirroring
   * `workout_sets.superset_group`, which is where it lands: a superset is a
   * property of the sets in the database so the same two lifts can be paired
   * one week and not the next, and the Hevy history backfills straight in.
   * The board holds one value per lift because a lifter cannot pair set 2 of
   * the bench and set 4 of the row; they pair the LIFTS, for the session.
   *
   * `supersets.ts` in this same directory owns the equivalent arithmetic over
   * database rows. It is not reused here because the shapes genuinely differ
   * — that module answers questions about a finished workout, this one about
   * the board in front of somebody — but the semantics are deliberately the
   * same, down to a group of one dissolving rather than lingering.
   */
  supersetGroup: number | null
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
  const straight = firstUndone(exercises)
  if (straight === null) return null

  /* `?? null`, and it is load-bearing: a checkpoint written before supersets
     existed restores this field as `undefined`, and `undefined === null` is
     false, so without it every restored workout would take the alternating
     branch and silently reorder itself. */
  const group = exercises[straight.exerciseIndex].supersetGroup ?? null
  if (group === null) return straight

  /*
   * ── A SUPERSET ALTERNATES, AND THAT IS THE ONLY THING IT DOES ────────────
   * Whoever in the group has banked the fewest sets goes next; ties break by
   * board order. So A B A B falls out with no cursor to keep, and a lifter who
   * banks two of A before remembering B is not stranded — B simply has the
   * fewest and comes up next, which is `nextInGroup`'s rule in `supersets.ts`
   * applied to the board.
   *
   * A member with nothing left to log is not a candidate. Without that check a
   * finished 2-set lift paired with a 4-set one keeps winning the tie on count
   * and `setIndex` comes back -1, which indexes nothing and freezes the board.
   */
  let best = straight.exerciseIndex
  let fewest = Number.POSITIVE_INFINITY
  for (let ei = 0; ei < exercises.length; ei += 1) {
    const exercise = exercises[ei]
    if (exercise.supersetGroup !== group) continue
    const setIndex = exercise.sets.findIndex((s) => !s.done)
    if (setIndex === -1) continue
    const done = workingDone(exercise)
    if (done < fewest) {
      fewest = done
      best = ei
    }
  }
  return {
    exerciseIndex: best,
    setIndex: exercises[best].sets.findIndex((s) => !s.done),
  }
}

/** The first unbanked set in plain board order, ignoring supersets. */
function firstUndone(exercises: BoardExercise[]): BoardPosition | null {
  for (let ei = 0; ei < exercises.length; ei += 1) {
    const sets = exercises[ei].sets
    for (let si = 0; si < sets.length; si += 1) {
      if (!sets[si].done) return { exerciseIndex: ei, setIndex: si }
    }
  }
  return null
}

/** Lowest unused group id on the board, so the badges read SS 1, SS 2. */
export function nextBoardGroup(exercises: BoardExercise[]): number {
  const used = new Set(
    exercises
      .map((e) => e.supersetGroup)
      .filter((g): g is number => typeof g === 'number'),
  )
  let id = 1
  while (used.has(id)) id += 1
  return id
}

/**
 * Pair the lift at `exerciseIndex` with the one after it, or break it out of
 * the pairing it is in. Returns a NEW board, or the same one when there is
 * nothing to pair with.
 *
 * One control, two directions, because the lifter's question is binary: is
 * this lift supersetted or not. Joining the NEXT lift rather than offering a
 * picker is the whole interaction — a superset is two adjacent things on the
 * board, and anything else is a rewrite of the running order dressed as a
 * pairing.
 *
 * Leaving dissolves a group of one, the same rule `ungroupIds` encodes: a lone
 * exercise still wearing an SS badge is a group whose other half the lifter
 * cannot see.
 */
export function toggleSuperset(
  exercises: BoardExercise[],
  exerciseIndex: number,
): BoardExercise[] {
  const self = exercises[exerciseIndex]
  if (self === undefined) return exercises

  const group = self.supersetGroup ?? null
  if (group !== null) {
    const others = exercises.filter(
      (e, i) => i !== exerciseIndex && e.supersetGroup === group,
    )
    const dissolve = others.length <= 1
    return exercises.map((e, i) =>
      i === exerciseIndex || (dissolve && e.supersetGroup === group)
        ? { ...e, supersetGroup: null }
        : e,
    )
  }

  const next = exercises[exerciseIndex + 1]
  if (next === undefined) return exercises
  const id = next.supersetGroup ?? nextBoardGroup(exercises)
  return exercises.map((e, i) =>
    i === exerciseIndex || i === exerciseIndex + 1 ? { ...e, supersetGroup: id } : e,
  )
}

/**
 * Whether a rest starts after the set at `position` was banked. Takes the
 * board AFTER the bank.
 *
 * A superset rests once per ROUND and not between its exercises, which is the
 * entire reason to run one: the lifter walks to the other bench, and sits down
 * only when the pair has both been through.
 *
 * ── "IS THE NEXT SET IN THE SAME GROUP" IS THE WRONG QUESTION ──────────────
 * That was the first rule here and its own test caught it. Bank A1, next up is
 * B1, same group, no rest — correct. Bank B1 and the next set is A2, also the
 * same group, so it answered no rest again, and the round that had just
 * finished never got one.
 *
 * The right question is whether anybody in the group is still BEHIND the lift
 * just banked. A member with nothing left to log is exempt, which is what
 * makes an uneven pair work: a one-set lift supersetted with a three-set one
 * stops holding up the rest after its single set, rather than suppressing
 * every rest for the remainder of the group.
 *
 * A warm-up starts nothing either. Nobody rests two minutes after an empty
 * bar, and `commitOutcome` encodes the same rule for the web app.
 */
/**
 * Completed WORKING sets. The alternation and the rest rule both count rounds,
 * and a warm-up is not a round.
 *
 * Both used to count `s.done` flat, which this file's own prose already said
 * was wrong two rules further down: "a warm-up starts nothing". Pair a bench
 * carrying two warm-ups with a row carrying none, and after the warm-ups plus
 * one working set the bench reads three to the row's zero. `currentPosition`
 * then picks the row and keeps picking it for every set it has, so the lifter
 * runs one lift straight through while the other idles, which is precisely the
 * walking back and forth the feature exists to produce. `restsAfterBank`
 * compounds it by firing a rest on the first row set, because three is already
 * greater than one.
 *
 * Every superset test in the suite used boards with no warm-ups, so nothing
 * caught it.
 */
function workingDone(exercise: BoardExercise): number {
  return exercise.sets.filter((s) => s.done && s.type !== 'warmup').length
}

export function restsAfterBank(
  exercises: BoardExercise[],
  position: BoardPosition,
): boolean {
  const banked = exercises[position.exerciseIndex]
  if (banked === undefined) return false
  if (banked.sets[position.setIndex]?.type === 'warmup') return false

  const group = banked.supersetGroup ?? null
  if (group === null) return true

  const bankedCount = workingDone(banked)
  return exercises.every(
    (e) =>
      (e.supersetGroup ?? null) !== group ||
      e.sets.every((s) => s.done) ||
      workingDone(e) >= bankedCount,
  )
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
  plan: {
    exerciseId: string
    name: string
    sets: number
    bodyweight?: boolean
    /** Carried from the previous session, so a pairing repeats at zero taps
     *  for the same reason the set TYPE does. Omitted means not supersetted. */
    supersetGroup?: number | null
  }[],
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
    bodyweight: entry.bodyweight === true,
    supersetGroup: entry.supersetGroup ?? null,
    sets: Array.from({ length: Math.max(1, entry.sets) }, (_, i) => {
      const setNumber = i + 1
      const match = previous.find(
        (p) => p.exerciseId === entry.exerciseId && p.setNumber === setNumber,
      )
      return {
        setNumber,
        // The previous row's OWN type, not a hardcoded 'normal'.
        //
        // Every one of those fields is read off `match` except this one, which
        // was minted. A lifter whose last session opened with three warm-ups
        // got them back pre-dialled at warm-up weights and typed as working
        // sets, so repeating a session one tap per set — the path GATE U2
        // measures — wrote fake volume and could set a fake PR. Carrying the
        // type is both the correct record and zero taps; the control on the
        // board is for the first time a lift is done and for the times history
        // is wrong.
        type: match?.type ?? ('normal' as SetType),
        // Pre-dialled to what they did last time. This is the repeat-set
        // path GATE U2 measures: if the previous values are already in the
        // zones, banking the same set again is one tap and nothing else.
        /*
         * STILL null with no history, and an attempt to make it 0 was reverted
         * by this file's own test suite — "leaves a row with no history blank
         * rather than inventing a load", which is a deliberate invariant and a
         * good one. Nothing needed changing here anyway: the board screen
         * already renders a null as `dialled.weightKg ?? 0`, so the stepper has
         * an origin to step from once it is VISIBLE. Visibility was the actual
         * bug, and it is fixed by `bodyweight` above rather than by touching
         * the record.
         */
        weightKg: match?.weightKg ?? null,
        reps: match?.reps ?? null,
        // Never carried. See `BoardSet.rpe`: a prescription repeats, a reading
        // does not.
        rpe: null,
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
  rpe: number | null = null,
): BoardExercise[] {
  const target = exercises[position.exerciseIndex]?.sets[position.setIndex]
  if (target === undefined || target.done) return exercises

  return exercises.map((exercise, ei) => {
    if (ei !== position.exerciseIndex) return exercise
    return {
      ...exercise,
      sets: exercise.sets.map((set, si) =>
        si === position.setIndex ? { ...set, weightKg, reps, rpe, done: true } : set,
      ),
    }
  })
}

/**
 * What the weight dial should show when the board moves to a new set.
 *
 * ── THREE CASES, AND ALL THREE SHIPPED BROKEN ON 2026-08-21 ─────────────────
 *   bodyweight  `weightKg === null` MEANS bodyweight (see `BoardSet` above).
 *               It must stay null, or a pull-up inherits the 60kg from the
 *               bench press before it and 60kg reaches the row.
 *   seeded      A set with a real number uses it. The normal case for a board
 *               built from history, and it beats anything dialled earlier.
 *   fresh       A lift added mid-session seeds `0`, which is "no weight yet"
 *               rather than "zero kilos". Carrying the last dialled value
 *               forward is what makes set 2 of an added lift one tap instead
 *               of eight presses on `+` — GATE U2, on a lift with no history.
 *
 * Here rather than in the screen because it is arithmetic over the board's own
 * types with no React in it, and because the web board has the same three
 * cases the moment it grows an add-exercise path of its own.
 */
/**
 * Change the type of the set at `position`, returning a NEW board.
 *
 * Only the set in front of the lifter can change. A banked row is a fact — it
 * is already in Postgres, and `bankSet` holds the same contract — so a done
 * position returns the board untouched rather than editing history from a
 * screen that has no way to send the update.
 *
 * Returning the SAME array when the type already matches is not a
 * micro-optimisation: the native store checkpoints to AsyncStorage on every
 * `set()`, and a chip tapped twice should not cost a disk write.
 */
export function markSetType(
  exercises: BoardExercise[],
  position: BoardPosition,
  type: SetType,
): BoardExercise[] {
  const target = exercises[position.exerciseIndex]?.sets[position.setIndex]
  if (target === undefined || target.done || target.type === type) return exercises

  return exercises.map((exercise, ei) => {
    if (ei !== position.exerciseIndex) return exercise
    return {
      ...exercise,
      sets: exercise.sets.map((set, si) =>
        si === position.setIndex ? { ...set, type } : set,
      ),
    }
  })
}

export function seedWeight(
  next: Pick<BoardSet, 'weightKg'> | null,
  carried: number | null,
): number | null {
  if (next === null || next.weightKg === null) return null
  return next.weightKg > 0 ? next.weightKg : (carried ?? 0)
}
