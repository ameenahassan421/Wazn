import type { PreviousSessionRow, SetType, WorkoutSet } from './types'

/**
 * The workout overview's shape, as pure data.
 *
 * Design v2.2 (`docs/design/v2.2-workout-overview.md`) separates two things the
 * app had allowed to be one: the rule that **a set row means it happened**, and
 * the interface that rule was dictating. The rule stays exactly where it was —
 * in the database. Everything below is client state.
 *
 * A **ghost row** is a planned set. It has never been in `workout_sets` and is
 * not in it now; it becomes a real INSERT at the moment its check is pressed,
 * and never before. Nothing in this module writes anything.
 *
 * It lives in `lib/` and not in the component for the reason every other pure
 * module here does: the precedence rules below are the part that is easy to get
 * quietly wrong, and a wrong ghost weight is a lifter loading the wrong bar.
 */

/** One planned set from a routine. Weight is deliberately absent — see below. */
export interface PlannedSet {
  reps: number | null
  setType: SetType
}

/** Routine targets for this workout, keyed by exercise. Empty when freestyle. */
export type WorkoutPlan = Map<string, PlannedSet[]>

export interface RowPrevious {
  weightKg: number | null
  reps: number | null
}

export interface OverviewRow {
  /** Stable across a commit: a ghost keeps its identity when it becomes real. */
  key: string
  kind: 'committed' | 'ghost'
  /** Working sets number from 1; a warm-up carries the letter instead. */
  label: string
  /** Present on a committed row only. */
  set: WorkoutSet | null
  weightKg: number | null
  reps: number | null
  setType: SetType
  /** The same-numbered working set from the previous session, if there is one. */
  previous: RowPrevious | null
  /**
   * Committed working rows only: today's weight minus the previous session's at
   * the same index. Null when either side is missing or the row is a warm-up.
   */
  delta: number | null
  /**
   * What the routine asked this row for, when there is a routine.
   *
   * Carried on the row rather than looked up by the component because v3's
   * board reads it on COMMITTED rows too — the design's `→ planned 8` on a set
   * that came in at six. Deriving that in the component would mean re-deciding
   * which plan entry belongs to which row, which is the indexing this module
   * exists to own.
   */
  plannedReps: number | null
}

export interface WorkoutBlock {
  exerciseId: string
  supersetGroup: number | null
  rows: OverviewRow[]
  /** Working sets actually logged. The numerator in the header's `3 / 4`. */
  committed: number
  /** Working sets planned, never less than what has been logged. The `/ 4`. */
  planned: number
}

/**
 * Working sets only, in order.
 *
 * Warm-ups are excluded everywhere in this module, for the same reason they are
 * excluded from PRs and charts (plan §5): they are not the work. A previous
 * session's warm-up must not become today's ghost, and a warm-up logged today
 * must not consume a working row's number.
 */
function working<T extends { set_type: SetType }>(rows: T[]): T[] {
  return rows.filter((r) => r.set_type !== 'warmup')
}

/**
 * Where a ghost row's values come from.
 *
 * Precedence, per the addendum, with one addition that the protect list
 * requires:
 *
 *  - **reps** — the routine's target for that row first, because a routine
 *    stores what to do. Then what you have already done today, then the same
 *    row last session, then last session's final row.
 *  - **weight** — what you have already done today first, because that is the
 *    1-tap repeat the protect list guards; then the same row last session, then
 *    last session's final row. A routine never supplies a weight: only history
 *    knows what you lifted.
 *
 * Both fall through to null rather than inventing anything. A blank is honest;
 * a made-up weight is the app lying about a bar it never watched you load.
 */
function ghostValues(
  index: number,
  plan: PlannedSet[] | undefined,
  committedWorking: WorkoutSet[],
  previousWorking: PreviousSessionRow[],
): { weightKg: number | null; reps: number | null } {
  const lastToday = committedWorking.at(-1)
  const sameRow = previousWorking[index]
  const lastPrevious = previousWorking.at(-1)

  const planned = plan?.[index]
  const reps =
    planned?.reps ?? lastToday?.reps ?? sameRow?.reps ?? lastPrevious?.reps ?? null
  const weightKg =
    lastToday?.weight_kg ?? sameRow?.weight_kg ?? lastPrevious?.weight_kg ?? null

  return { weightKg, reps }
}

/**
 * One exercise's block: what happened, then what is planned.
 *
 * `sets` are this workout's rows for this exercise in the order they were
 * logged, warm-ups included — a warm-up that happened is a fact and belongs on
 * screen. `previous` is the `previous_session` RPC's answer for this exercise.
 */
export function buildBlock({
  exerciseId,
  sets,
  previous = [],
  plan,
  supersetGroup = null,
  extra = 0,
}: {
  exerciseId: string
  sets: WorkoutSet[]
  previous?: PreviousSessionRow[]
  plan?: PlannedSet[]
  supersetGroup?: number | null
  /**
   * Rows added past the plan by pressing "Add set". Working past what was
   * planned is normal and should cost one tap, so it adds a ghost rather than
   * opening anything — and because it extends the plan rather than the log,
   * committing that ghost leaves the offer standing for the next one.
   */
  extra?: number
}): WorkoutBlock {
  const committedWorking = working(sets)
  // A previous session of nothing but warm-ups is not a session to chase, but
  // it is still the only thing known about the lift — fall back to all of it
  // rather than pretending there is no history.
  const previousWorking =
    working(previous).length > 0 ? working(previous) : [...previous]

  // Planned working sets. A routine gives the count; without one, last session
  // does. Never fewer than what is already logged — the plan cannot retract a
  // set you have done.
  const base = Math.max(
    plan?.length ?? previousWorking.length,
    // A lift with neither a routine nor a history still gets one row to aim at,
    // blank. The alternative is a block with nothing in it at all.
    committedWorking.length === 0 ? 1 : 0,
  )
  const target = Math.max(base + Math.max(extra, 0), committedWorking.length)

  const rows: OverviewRow[] = []
  let workingIndex = 0

  for (const set of sets) {
    const isWarmup = set.set_type === 'warmup'
    const previousRow = isWarmup ? null : (previousWorking[workingIndex] ?? null)
    rows.push({
      key: set.id,
      kind: 'committed',
      label: isWarmup ? 'W' : String(workingIndex + 1),
      set,
      weightKg: set.weight_kg,
      reps: set.reps,
      setType: set.set_type,
      previous: previousRow
        ? { weightKg: previousRow.weight_kg, reps: previousRow.reps }
        : null,
      delta:
        !isWarmup && set.weight_kg !== null && previousRow?.weight_kg != null
          ? Number((set.weight_kg - previousRow.weight_kg).toFixed(4))
          : null,
      plannedReps: isWarmup ? null : (plan?.[workingIndex]?.reps ?? null),
    })
    if (!isWarmup) workingIndex += 1
  }

  for (let i = committedWorking.length; i < target; i += 1) {
    const previousRow = previousWorking[i] ?? null
    rows.push({
      key: `ghost:${exerciseId}:${i}`,
      kind: 'ghost',
      label: String(i + 1),
      set: null,
      ...ghostValues(i, plan, committedWorking, previousWorking),
      // A ghost is always a working set. Warm-up ghosting is deliberately not
      // built — see DECISIONS.md; the ramp's one-tap rows already cover it in
      // the focused view, and there is no per-exercise "ramp enabled" setting
      // for a ghost to read.
      setType: 'normal' as SetType,
      previous: previousRow
        ? { weightKg: previousRow.weight_kg, reps: previousRow.reps }
        : null,
      delta: null,
      plannedReps: plan?.[i]?.reps ?? null,
    })
  }

  return {
    exerciseId,
    supersetGroup,
    rows,
    committed: committedWorking.length,
    planned: target,
  }
}

/**
 * Where a superset round stands: `Round 2 of 3`.
 *
 * The app has alternated correctly and rested once per round since Stage 1, and
 * has never shown either fact. The round is whoever is furthest behind — you
 * are not into round 3 until every member has finished round 2.
 */
export function supersetRound(blocks: WorkoutBlock[]): {
  round: number
  total: number
} {
  if (blocks.length === 0) return { round: 1, total: 1 }
  const total = Math.max(...blocks.map((b) => b.planned), 1)
  const behind = Math.min(...blocks.map((b) => b.committed))
  return { round: Math.min(behind + 1, total), total }
}

/**
 * The stored block order, extended with anything it has not heard about yet.
 *
 * `stored` is the order the user chose, read back from `workouts.exercise_order`
 * (migration 0020). `discovered` is what the workout actually contains — sets
 * already logged, then the routine's exercises. Ids in `stored` that are no
 * longer present drop out, so a removed exercise does not leave a hole.
 */
export function mergeOrder(stored: string[], discovered: string[]): string[] {
  const present = new Set(discovered)
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of stored) {
    if (!present.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  for (const id of discovered) {
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/**
 * Pull each superset's members next to each other, first member's place wins.
 *
 * The rail is a single 2px line spanning a group, so a group split by an
 * unrelated exercise cannot be drawn at all. Rather than draw two rails and
 * imply two supersets, the order guarantees adjacency — and it does so
 * stably, so a reorder that keeps a group together is left untouched.
 */
export function groupAdjacent(
  order: string[],
  groupOf: (exerciseId: string) => number | null,
): string[] {
  const out: string[] = []
  const placed = new Set<string>()
  for (const id of order) {
    if (placed.has(id)) continue
    const group = groupOf(id)
    placed.add(id)
    out.push(id)
    if (group === null) continue
    for (const other of order) {
      if (placed.has(other) || groupOf(other) !== group) continue
      placed.add(other)
      out.push(other)
    }
  }
  return out
}

/** Move one item, keeping everything else in order. Out-of-range is a no-op. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const out = [...items]
  if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) {
    return out
  }
  const [moved] = out.splice(from, 1)
  out.splice(to, 0, moved)
  return out
}

/**
 * Which slot a drag has landed in, given each block's centre on screen.
 *
 * Nearest centre wins. Comparing against centres rather than edges is what
 * makes a half-overlapping drag settle rather than flicker between two slots —
 * the pointer has to pass a neighbour's midpoint to displace it.
 */
export function dropIndex(centres: readonly number[], y: number): number {
  if (centres.length === 0) return 0
  let best = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (const [i, centre] of centres.entries()) {
    const distance = Math.abs(centre - y)
    if (distance < bestDistance) {
      bestDistance = distance
      best = i
    }
  }
  return best
}
