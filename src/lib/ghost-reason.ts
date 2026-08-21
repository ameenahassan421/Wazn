import type { PlannedSet, RowPrevious } from './plan'
import type { CoachMode } from './coach-mode'
import { MODE_BEHAVIOUR } from './coach-mode'
import type { Readiness } from './readiness'
import { loadFactor, setsToTrim } from './readiness'

/**
 * The adaptive ghost — design v3.0 §02, the hero surface.
 *
 * v2.2's ghost rows, upgraded from MEMORY to JUDGMENT. Precedence for a
 * ghost's values becomes **routine targets + progression verdict + readiness**,
 * not merely "previous session". Everything here is pure: the module decides
 * what a planned set should say, and `plan.ts` still decides that a ghost has
 * never been in the database and only the check makes it real. That boundary
 * is the whole safety property of v2.2 and v3 does not touch it.
 *
 * ── ONE CHIP PER ROW, AND NO CHIP WITHOUT A NUMBER ──────────────────────────
 * A verdict carries the figures it was computed from, and the component
 * renders exactly one chip from them. `repeat` is the honest silence: it means
 * the coach has nothing to say and the row keeps v2.2's `↺ previous` glyph.
 * A lift with no history produces `repeat` with null values — a blank ghost,
 * which is what the app has always shown rather than inventing a bar.
 *
 * ── WHY AUTO-REGULATION IS A PURE FUNCTION OF A CAUSE ───────────────────────
 * "Recalculation never touches committed rows and never fires twice for the
 * same cause — a coach who changes the plan every thirty seconds is noise."
 * The temptation is to implement that with a flag somewhere in the component
 * ("have I already recalculated?"), which is a bug the first time a re-render
 * beats the flag. Instead `causeOf` derives a STABLE STRING from the log
 * itself: the first committed row that fell short. Recomputing on every render
 * is free and idempotent, the cause cannot fire twice because it IS the same
 * cause, and a second shortfall later in the block is a genuinely different
 * string and therefore a genuinely new adjustment.
 */

/** What the coach did to a planned set, and why. */
export type VerdictKind = 'raise' | 'hold' | 'ease' | 'repeat'

export type VerdictCause =
  /** Last session finished every target rep, so the bar goes up. */
  | 'progression'
  /** Readiness is light: same lifts, less of them. */
  | 'readiness'
  /** A set earlier in this block came in under plan. */
  | 'under-plan'
  /** The rep ladder for the mode, rather than anything about this lifter. */
  | 'rep-band'
  /** Nothing to say. */
  | 'none'

export interface GhostVerdict {
  kind: VerdictKind
  cause: VerdictCause
  weightKg: number | null
  reps: number | null
  /**
   * The figures behind the sentence, for the chip and the explainer. Never
   * prose — the component translates, so no English lives in this module.
   */
  facts: {
    /** What the previous session did at this row, when there was one. */
    previousKg?: number
    previousReps?: number
    /** Every rep count from the previous session, for `8/8/8 last time`. */
    previousRepsRun?: number[]
    /** The row label that caused an under-plan recalculation. */
    causeSetLabel?: string
    /** Reps planned vs reps done, on that row. */
    plannedReps?: number
    actualReps?: number
  }
}

const SILENT: GhostVerdict = {
  kind: 'repeat',
  cause: 'none',
  weightKg: null,
  reps: null,
  facts: {},
}

export interface GhostContext {
  mode: CoachMode
  readiness: Readiness
  /** Working rows from the previous session for this exercise, in order. */
  previous: RowPrevious[]
  /** The routine's targets for this exercise, when there is a routine. */
  plan?: PlannedSet[]
  /** Working sets already committed today, in order. */
  committed: { weightKg: number | null; reps: number | null; label: string }[]
  /**
   * The smallest jump the lifter can actually load, in kg. A plate increment,
   * not a percentage: "Plates decide the jumps" (mode.strength.body), and a
   * 2.3 kg progression is a coach who has never stood at a rack.
   */
  incrementKg: number
}

/**
 * Did the previous session finish every rep it was asked for?
 *
 * Double progression: reps first, then load. A session where every working set
 * hit its target is the only thing that earns a jump — which is why this reads
 * the PLAN's targets and not merely whether the reps were equal to each other.
 * With no plan, the previous session's own top rep count stands in as the
 * target, so a freestyle lifter still progresses off their own consistency.
 */
export function earnedProgression(
  previous: RowPrevious[],
  plan: PlannedSet[] | undefined,
): boolean {
  const rows = previous.filter((r) => r.reps !== null && r.reps > 0)
  if (rows.length === 0) return false

  const targets = plan?.filter((p) => p.setType !== 'warmup') ?? []
  if (targets.length > 0) {
    // Every planned row must have been done, and done in full. A session that
    // stopped two sets early did not prove anything about the weight.
    if (rows.length < targets.filter((p) => p.reps !== null).length) return false
    return targets.every((target, i) => {
      if (target.reps === null) return true
      const done = rows[i]?.reps
      return typeof done === 'number' && done >= target.reps
    })
  }

  const top = Math.max(...rows.map((r) => r.reps as number))
  return rows.every((r) => (r.reps as number) >= top)
}

/**
 * The cause string for a mid-session recalculation, or null.
 *
 * "Commit a row at lower reps than planned → remaining ghosts in that block
 * recalculate once." The FIRST shortfall owns the block: a second short set is
 * the same story, not a new one, and re-easing on every set is how a coach
 * becomes noise. The string is derived rather than stored so it cannot fire
 * twice — see the module note.
 */
export function causeOf(ctx: GhostContext): {
  label: string
  planned: number
  actual: number
} | null {
  const targets = ctx.plan?.filter((p) => p.setType !== 'warmup') ?? []
  for (const [i, row] of ctx.committed.entries()) {
    if (row.reps === null) continue
    const planned = targets[i]?.reps ?? ctx.previous[i]?.reps ?? null
    if (planned === null) continue
    if (row.reps < planned) {
      return { label: row.label, planned, actual: row.reps }
    }
  }
  return null
}

/** Round to something a lifter can actually load. */
function toIncrement(kg: number, incrementKg: number): number {
  const step = incrementKg > 0 ? incrementKg : 2.5
  return Number((Math.round(kg / step) * step).toFixed(2))
}

/**
 * What ghost row `index` should say, and why.
 *
 * Precedence, in order, each one able to stop the search:
 *
 *  1. **Under-plan recalculation.** A set that fell short this session governs
 *     every ghost after it, because it is the most recent evidence and it is
 *     about today. It eases the load one increment and matches the reps that
 *     were actually managed.
 *  2. **Readiness.** A light day eases the bar and trims the tail of the
 *     block. Never on a row the lifter has already worked past.
 *  3. **Progression.** Last session finished the job: add one increment and
 *     keep the reps.
 *  4. **Silence.** Everything else is v2.2 — the previous session's values
 *     with the `↺` glyph, or a blank row when the lift is new.
 */
export function verdictFor(index: number, ctx: GhostContext): GhostVerdict {
  const sameRow = ctx.previous[index] ?? null
  const lastPrevious = ctx.previous.at(-1) ?? null
  const base = sameRow ?? lastPrevious
  const baseKg = base?.weightKg ?? null
  const targets = ctx.plan?.filter((p) => p.setType !== 'warmup') ?? []
  const plannedReps = targets[index]?.reps ?? null

  // A lift with no history and no plan has nothing to reason from, and saying
  // so is the honest answer — v2.2's blank ghost, chip absent.
  if (baseKg === null && plannedReps === null) return SILENT

  const band = MODE_BEHAVIOUR[ctx.mode].repBand

  // 1 — a set that fell short today.
  const cause = causeOf(ctx)
  if (cause !== null && baseKg !== null) {
    // The load the lifter was actually working at when it went wrong, not the
    // plan's — they may already have eased it themselves.
    const workingKg = ctx.committed.at(-1)?.weightKg ?? baseKg
    return {
      kind: 'ease',
      cause: 'under-plan',
      weightKg: toIncrement(workingKg - ctx.incrementKg, ctx.incrementKg),
      reps: cause.actual,
      facts: {
        previousKg: baseKg,
        causeSetLabel: cause.label,
        plannedReps: cause.planned,
        actualReps: cause.actual,
      },
    }
  }

  // 2 — a light day. The trim is expressed as a HOLD on the rows that survive
  // and a shorter block overall (see `trimmedPlan`); the load eases a notch.
  if (ctx.readiness === 'light' && baseKg !== null) {
    return {
      kind: 'hold',
      cause: 'readiness',
      weightKg: toIncrement(baseKg * loadFactor('light'), ctx.incrementKg),
      reps: plannedReps ?? sameRow?.reps ?? lastPrevious?.reps ?? null,
      facts: {
        previousKg: baseKg,
        previousReps: sameRow?.reps ?? undefined,
      },
    }
  }

  // 3 — the mode's progression brain. Which one runs is the whole difference
  // between the modes: hypertrophy ladders REPS inside its band before it
  // touches the bar ("Rep ladders 8–15"), and strength moves the bar because
  // plates decide the jumps. Running them in the other order would make
  // hypertrophy a strength block with a different card on the Coach tab.
  if (band && baseKg !== null && ctx.committed.length === 0) {
    const reps = plannedReps ?? sameRow?.reps ?? null
    if (reps !== null && reps >= band[0] && reps < band[1]) {
      return {
        kind: 'raise',
        cause: 'rep-band',
        weightKg: baseKg,
        reps: reps + 1,
        facts: { previousKg: baseKg, previousReps: reps },
      }
    }
  }

  if (
    baseKg !== null &&
    ctx.committed.length === 0 &&
    earnedProgression(ctx.previous, ctx.plan)
  ) {
    const run = ctx.previous
      .map((r) => r.reps)
      .filter((r): r is number => typeof r === 'number' && r > 0)
    return {
      kind: 'raise',
      cause: 'progression',
      weightKg: toIncrement(baseKg + ctx.incrementKg, ctx.incrementKg),
      reps: plannedReps ?? sameRow?.reps ?? null,
      facts: { previousKg: baseKg, previousRepsRun: run },
    }
  }

  return SILENT
}

/**
 * How many working rows the block should plan for.
 *
 * A light day is "same lifts, two fewer sets" — the copy the Today brief uses,
 * and it has to be true of the board or the brief is lying. Rows already
 * logged are never removed: the plan cannot retract a set you have done, which
 * is `buildBlock`'s rule and this only ever hands it a smaller target.
 */
export function trimmedPlan(
  planned: number,
  committed: number,
  readiness: Readiness,
): number {
  return Math.max(committed, planned - setsToTrim(readiness, planned))
}

/**
 * Which chip a verdict wears, as a key and its raw figures.
 *
 * ── THE BRANCH IS SHARED, THE FORMATTING IS NOT ─────────────────────────────
 * Choosing which of the four chips a cause maps to is a RULE, and a rule that
 * exists twice drifts: the web picked it inside `WorkoutOverview`'s
 * `ReasonChip`, and native was about to grow a second copy of the same
 * if-ladder. This returns the key and the raw numbers; each stack formats the
 * weight for its own display unit and runs it through its own `t`.
 *
 * `weightKg` comes back in KILOGRAMS, always, like everything else stored —
 * the caller converts. Returning a formatted string here would put a display
 * decision in the shared half and make the function untestable without a
 * locale.
 */
export interface GhostChip {
  key: string
  /** Kilograms. Null when there is no weight to name. */
  weightKg: number | null
  /** Every rep count from the previous session, for `8/8/8 last time`. */
  run: number[]
  /** The row that caused an ease-off. */
  label: string
  reps: number | null
  /**
   * Ember when the bar went UP, muted otherwise.
   *
   * One chip per row stays true either way; what changes is that an ease-off
   * does not get the visual weight of a personal record.
   */
  raised: boolean
}

export function ghostChip(verdict: GhostVerdict): GhostChip {
  const base = {
    weightKg: verdict.weightKg,
    run: verdict.facts.previousRepsRun ?? [],
    label: verdict.facts.causeSetLabel ?? '',
    reps: verdict.reps,
    raised: verdict.kind === 'raise',
  }
  if (verdict.cause === 'under-plan') return { ...base, key: 'reason.chip.eased' }
  if (verdict.cause === 'progression') return { ...base, key: 'reason.chip.raised' }
  if (verdict.cause === 'readiness') return { ...base, key: 'reason.chip.hold' }
  return { ...base, key: 'reason.chip.reps' }
}
