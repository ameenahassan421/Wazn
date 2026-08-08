/**
 * Every number the model writes has to be a number we gave it.
 *
 * `BEATING_HEVY_PLAN` §12 sets the tolerance for a fabricated figure at zero —
 * "one confirmed fabricated number pauses the feature" — and until now the
 * check was a human reading a chip. This is that policy as a running guard
 * (`docs/INFRASTRUCTURE_AUDIT.md` §3-A2).
 *
 * The whole approach rests on one property of how this app talks to a model:
 * the stat block is JSON *we* built, from `coach_stats()`, and the system
 * prompt says "never recompute, re-add, or second-guess a number in it. Never
 * invent a number that is not in it." So grounding is set membership, not
 * judgement — no second model, no variance, no cost.
 *
 * The same function runs in three places, which is the point of it being here
 * rather than inside a function: in production before a note is returned, in
 * CI against recorded outputs, and in the live eval against fresh ones. One
 * definition of "grounded".
 *
 * ── WHAT THIS DOES NOT CATCH ───────────────────────────────────────────────
 * Named rather than implied away, because a guard whose limits are undocumented
 * gets trusted past them.
 *
 *  - **A small integer that collides with a window boundary.** Numbers are
 *    harvested from the block's *keys* as well as its values, so
 *    `best_e1rm_28d` grounds "28" and `weekly_sets_by_muscle_4w_ago` grounds
 *    "4". A fabricated "4 sets" therefore passes. That is the price of not
 *    rejecting the legitimate chip "last 4 wk", and dropping a true note is
 *    the more expensive error: the feature's value is the notes it writes.
 *  - **A right number attached to the wrong thing.** "Your chest has 9 sets"
 *    when 9 belongs to back is grounded and wrong. Catching that needs
 *    semantics; this is set membership.
 *  - **Words.** "Your bench is stalling" is unfalsifiable by arithmetic.
 *
 * What it does catch is the class that actually matters and actually happens:
 * a weight, an e1RM, a volume or a set count that appears nowhere in the data
 * the model was handed.
 */

/**
 * Constants the system prompt states as rules, which the model is therefore
 * *expected* to quote back.
 *
 * Only the productive-set band. Everything else a note may legitimately cite
 * is already in the block or in one of its key names, and every entry added
 * here is a number a fabrication could hide behind — so the bar for adding one
 * is that a correct note is impossible without it.
 */
export const PROMPT_CONSTANTS = [10, 20]

/**
 * Numbers as they appear in prose: "156", "1,240", "62.5".
 *
 * Unsigned, because a negative weight is not a thing and the `-` in "10-20" is
 * a range dash, not a minus.
 *
 * The lookbehind is load-bearing, and it was found by a failing test rather
 * than by thinking: **`e1RM` contains a digit.** Without the guard, every note
 * using this app's own central term injected a phantom `1` into the claim set.
 * A digit preceded by a letter is part of an identifier, not a figure — which
 * also does the right thing inside key names, where `best_e1rm_28d` yields 28
 * (preceded by `_`) and not the 1 in `e1rm`.
 *
 * `1RM` and `10RM` are the mirror case: a digit that is part of a term rather
 * than a measurement, recognisable only by what follows it.
 */
const NUMBER_RE = /(?<![A-Za-z0-9.])\d[\d,]*(?:\.\d+)?/g
const REP_MAX_TERM = /^RM/i

export function extractNumbers(text: string): number[] {
  const found: number[] = []
  for (const match of text.matchAll(NUMBER_RE)) {
    const rest = text.slice((match.index ?? 0) + match[0].length)
    if (REP_MAX_TERM.test(rest)) continue
    const value = Number.parseFloat(match[0].replace(/,/g, ''))
    if (Number.isFinite(value)) found.push(value)
  }
  return found
}

/**
 * Every number reachable in the stat block — values, numbers inside strings,
 * and numbers inside key names.
 *
 * Keys matter: `sessions_last_7`, `best_e1rm_28d` and
 * `weekly_sets_by_muscle_4w_ago` are how a note legitimately says "last 4 wk"
 * or "in 28 days". Strings matter because exercise names carry digits —
 * "21s Bicep Curl" would otherwise make its own name a fabrication.
 */
export function collectAllowedNumbers(block: unknown): Set<number> {
  const allowed = new Set<number>(PROMPT_CONSTANTS)

  const walk = (value: unknown): void => {
    if (value === null || value === undefined) return
    if (typeof value === 'number') {
      if (Number.isFinite(value)) allowed.add(value)
      return
    }
    if (typeof value === 'string') {
      for (const n of extractNumbers(value)) allowed.add(n)
      return
    }
    if (Array.isArray(value)) {
      // How many are in the list is a fact the block carries, and one the
      // review contract actively asks the model to state: "plateaus" is an
      // empty array on a good week and the section still has to say so, which
      // in English is "nothing has stalled — 0 lifts". Without this, the
      // truest sentence the coach can write about a healthy week reads as a
      // fabrication.
      //
      // The cost is a handful more small integers in the allowed set, which
      // is the weakest part of this check already (see the note above about
      // window boundaries). The benefit is that "0", "1 win", "3 groups" stop
      // being unwritable.
      allowed.add(value.length)
      for (const item of value) walk(item)
      return
    }
    if (typeof value === 'object') {
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        for (const n of extractNumbers(key)) allowed.add(n)
        walk(item)
      }
    }
  }

  walk(block)
  return allowed
}

/**
 * Is `claim` one of `allowed`, allowing for the model's own rounding?
 *
 * The block carries `round(max(e1rm), 1)` — 156.4 — and a note that says
 * "156 lb" is quoting it, not inventing. Matching at half a unit accepts that
 * and nothing more: 156 matches 156.4, and does not match 157.
 *
 * Percentages are matched too, because a block value of 0.42 written as "42%"
 * is the same figure in different clothes; without this a legitimate share
 * would read as fabricated.
 */
export function isGrounded(claim: number, allowed: Set<number>): boolean {
  if (allowed.has(claim)) return true
  for (const value of allowed) {
    if (Math.abs(value - claim) < 0.5) return true
    if (Math.round(value) === Math.round(claim) && Math.abs(value - claim) <= 1) {
      return true
    }
    if (Math.abs(value * 100 - claim) < 0.5) return true
  }
  return false
}

/* ── Names ────────────────────────────────────────────────────────────────── */

/**
 * The same rule as the numbers, applied to lifts: **an exercise the model
 * names must be an exercise we gave it data about.**
 *
 * The failure this catches is specific and plausible — a model handed a block
 * about a stalled bench reaches for a lift it knows about from training rather
 * than from the block: "add Romanian Deadlifts on Thursday". Every figure in
 * that sentence can be grounded and the sentence is still an invention,
 * because the user may not own a barbell, may never have done one, and
 * certainly did not have one measured.
 *
 * Detecting an invented name needs to know what a name looks like, which is
 * what the catalog is for: `public.exercises` is a shared table, so the set of
 * strings that ARE exercise names is knowable. The check is then set
 * membership again — a catalog name that appears in the output but not in the
 * block is out of bounds.
 *
 * ── WHAT THIS DOES NOT CATCH, and why it is drawn where it is ───────────────
 *  - **Single-word lifts.** "Squat", "Deadlift", "Row", "Curl", "Dip",
 *    "Plank" are catalog entries AND ordinary English. A check that flagged
 *    "your rows are behind" because the block happened to lack a lift called
 *    Row would be turned off inside a day, and a check people turn off catches
 *    nothing. Only multi-word base names are matched, which is also the shape
 *    a fabricated recommendation actually takes.
 *  - **A lift that is not in the catalog at all.** Nothing here can tell
 *    "Bulgarian Split Squat" from a phrase, if the catalog has no such row.
 *  - **The right lift described wrongly.** Semantics again, not membership.
 */

/**
 * "Bench Press (Barbell)" → "bench press".
 *
 * The parenthetical is equipment, and a model quoting the block will almost
 * always drop it — so matching full catalog strings would miss every real
 * mention and flag nothing, which is the quiet way for a guard to be useless.
 */
export function baseName(name: string): string {
  return name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Every exercise name reachable in a block, at any depth, under any key. */
export function collectBlockNames(block: unknown): Set<string> {
  const names = new Set<string>()
  const NAME_KEYS = /^(name|exercise|exercise_name)$/

  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (NAME_KEYS.test(key) && typeof item === 'string') {
          names.add(baseName(item))
        }
        walk(item)
      }
    }
  }

  walk(block)
  return names
}

/**
 * Catalog names mentioned in `text` that the block never mentioned.
 *
 * `catalog` is every exercise name the app knows. Passing an empty catalog
 * disables the check rather than failing everything open-mouthed — the eval
 * fixtures carry their own, and production reads it once per isolate.
 */
export function ungroundedNames(
  text: string,
  block: unknown,
  catalog: readonly string[],
): string[] {
  if (catalog.length === 0) return []
  const allowed = collectBlockNames(block)
  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `

  const found = new Set<string>()
  for (const entry of catalog) {
    const base = baseName(entry)
    // Multi-word only — see the note above.
    if (!base.includes(' ')) continue
    if (allowed.has(base)) continue
    const needle = ` ${base.replace(/[^a-z0-9]+/g, ' ')} `
    if (haystack.includes(needle)) found.add(base)
  }
  return [...found]
}

export interface GroundingResult {
  grounded: boolean
  /** The figures that appear nowhere in the block. Empty when grounded. */
  ungrounded: number[]
}

/**
 * Check one piece of model output against the block it was written from.
 *
 * `text` is everything the note says — title, body and chip concatenated —
 * because a fabricated number is no better in a headline than in a chip.
 */
export function checkGrounded(text: string, allowed: Set<number>): GroundingResult {
  const ungrounded = [...new Set(extractNumbers(text))].filter(
    (claim) => !isGrounded(claim, allowed),
  )
  return { grounded: ungrounded.length === 0, ungrounded }
}

/**
 * Split a set of insights into the ones that are grounded and the ones that
 * are not.
 *
 * Per-insight rather than all-or-nothing on purpose: one bad figure should
 * cost that observation, not the four good ones beside it. `coach-notes`
 * retries once with the violation named and drops what still fails.
 */
export function partitionGrounded<
  T extends { title: string; body: string; chip?: string },
>(
  insights: T[],
  block: unknown,
): { kept: T[]; dropped: { insight: T; ungrounded: number[] }[] } {
  const allowed = collectAllowedNumbers(block)
  const kept: T[] = []
  const dropped: { insight: T; ungrounded: number[] }[] = []

  for (const insight of insights) {
    const text = `${insight.title} ${insight.body} ${insight.chip ?? ''}`
    const result = checkGrounded(text, allowed)
    if (result.grounded) kept.push(insight)
    else dropped.push({ insight, ungrounded: result.ungrounded })
  }

  return { kept, dropped }
}
