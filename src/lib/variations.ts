import type { Exercise, ExerciseUsageRow } from './types'

/**
 * "Same lift, different implement" — design v3.0 §10, the smart swap.
 *
 * The spec asks for a **"Closest to your plan"** row pinned above search:
 * three candidates ranked by muscle-group overlap and equipment on hand. This
 * is that ranking, kept out of the component so it can be tested without a
 * DOM and reused by the routine editor and, later, the mid-workout picker.
 *
 * ── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────────
 * Swapping one exercise in a routine currently costs: remove it (×), open the
 * picker, search, pick — which **appends to the end** — then press ↑ once per
 * exercise between the end and where it belonged. On a six-exercise routine
 * that is nine taps to change a bench press to dumbbells, and the sets and
 * reps are lost on the way. The rack being busy is the single most common
 * reason a lifter deviates from a plan, so the app charged the most for the
 * thing that happens most.
 *
 * ── THE RANKING, AND WHY IT IS IN THIS ORDER ────────────────────────────────
 * 1. **Same base movement, different equipment.** "Bench Press (Barbell)" and
 *    "Bench Press (Dumbbell)" are the same lift with a different implement,
 *    and this is what a lifter means by "swap" nine times out of ten. It is
 *    also the strongest signal available without a movement taxonomy nobody
 *    has written.
 * 2. **A named variant of the same movement.** "Incline Bench Press
 *    (Dumbbell)" contains the base name and trains the same group. Close, but
 *    a genuinely different stimulus, so it ranks under a pure implement swap.
 * 3. **Same muscle group, ranked by what they actually train.** The fallback
 *    when nothing shares a name. Usage is the only honest proxy this app has
 *    for "equipment on hand": a machine you have used forty times is a machine
 *    your gym owns, and one you have never touched probably is not.
 *
 * Ties inside a tier break on usage, then on name, so the order is stable —
 * a picker whose top row reshuffles between renders is a picker you cannot
 * learn.
 */

/** How close a candidate is. Lower sorts first. */
export type VariationTier = 'implement' | 'variant' | 'group'

export interface Variation {
  exercise: Exercise
  tier: VariationTier
  /**
   * Why it is being offered, as a short phrase for the chip. The design's own
   * rule: no claim without the reason beside it.
   */
  reason: string
}

const TIER_ORDER: Record<VariationTier, number> = {
  implement: 0,
  variant: 1,
  group: 2,
}

/**
 * "Bench Press (Barbell)" → "bench press". The parenthetical is the implement,
 * and stripping it is what makes two rows comparable at all.
 *
 * Shared shape with `baseName` in `supabase/functions/_shared/grounding.ts`,
 * deliberately not shared code: that one runs in Deno against a model's prose
 * and this one runs in the browser against a catalogue. Coupling them would
 * mean a change made for the grounding gate silently reordering this picker.
 */
export function baseMovement(name: string): string {
  return name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** The implement, when the name declares one: "Bench Press (Barbell)" → "Barbell". */
export function implementOf(name: string): string | null {
  const match = name.match(/\(([^)]*)\)\s*$/)
  return match ? match[1].trim() : null
}

export const MAX_VARIATIONS = 3

/**
 * Ranked alternatives to `current`, best first.
 *
 * `usage` is the caller's own set counts — the same map the picker already
 * orders by — and is optional so a caller without it still gets tiers 1 and 2,
 * which are the ones that matter.
 *
 * Archived exercises are never offered: they are lifts the user has explicitly
 * put away, and surfacing one as a suggestion undoes that decision for them.
 */
export function variationsFor(
  current: Exercise,
  catalogue: readonly Exercise[],
  usage: Map<string, ExerciseUsageRow> = new Map(),
  limit: number = MAX_VARIATIONS,
): Variation[] {
  const base = baseMovement(current.name)
  if (!base) return []

  const scored: Variation[] = []

  for (const candidate of catalogue) {
    if (candidate.id === current.id) continue
    if (candidate.archived_at) continue

    const candidateBase = baseMovement(candidate.name)

    if (candidateBase === base) {
      // The same movement under a different implement. If the name declares
      // one, say which — "as dumbbell" reads better than "same movement" and
      // is the thing the lifter is actually choosing.
      const implement = implementOf(candidate.name)
      scored.push({
        exercise: candidate,
        tier: 'implement',
        reason: implement ? `as ${implement.toLowerCase()}` : 'same movement',
      })
      continue
    }

    // A named variant: the base movement appears inside a longer name, and it
    // trains the same group. Both halves are required — "Press" appears in
    // "Leg Press" and that is not a bench press variant.
    const containsBase =
      candidate.muscle_group === current.muscle_group &&
      ` ${candidateBase} `.includes(` ${base} `)

    if (containsBase) {
      scored.push({
        exercise: candidate,
        tier: 'variant',
        reason: 'same movement, varied',
      })
      continue
    }

    if (candidate.muscle_group === current.muscle_group) {
      scored.push({
        exercise: candidate,
        tier: 'group',
        reason: `also ${candidate.muscle_group}`,
      })
    }
  }

  const sets = (id: string) => usage.get(id)?.set_count ?? 0

  scored.sort((a, b) => {
    const tier = TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
    if (tier !== 0) return tier
    const used = sets(b.exercise.id) - sets(a.exercise.id)
    if (used !== 0) return used
    const affinity =
      implementDistance(current, a.exercise) - implementDistance(current, b.exercise)
    if (affinity !== 0) return affinity
    // Stable last resort. A picker whose top row reshuffles between renders
    // is a picker nobody can learn.
    return a.exercise.name.localeCompare(b.exercise.name)
  })

  return scored.slice(0, limit)
}

/**
 * Free weights move like free weights; fixed paths move like fixed paths.
 *
 * This only decides ties that usage could not — which in practice means a new
 * account, or two implements the lifter has trained equally. Alphabetical
 * order was the first answer and it put "Bench Press (Cable)" above "Bench
 * Press (Dumbbell)", which is not what anybody means when the rack is busy.
 *
 * Usage still wins whenever it exists: a machine used forty times beats a
 * dumbbell never touched, because the gym that has one is the gym they are
 * standing in. This is strictly the fallback.
 */
const FREE = new Set(['barbell', 'dumbbell', 'bodyweight'])

function implementDistance(current: Exercise, candidate: Exercise): number {
  const sameFamily =
    FREE.has(current.equipment.toLowerCase()) ===
    FREE.has(candidate.equipment.toLowerCase())
  return sameFamily ? 0 : 1
}
