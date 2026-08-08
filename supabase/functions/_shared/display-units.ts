/**
 * The coach speaks the unit the app is showing.
 *
 * ── THE BUG THIS EXISTS FOR ─────────────────────────────────────────────────
 * Weight is stored in kg, always, so every block these functions compute is in
 * kg. The model is told to copy figures verbatim, and the grounding gate
 * enforces it. Both of those are right, and together they produced a card that
 * read "Bench Press was 102.5 kg × 5" directly under a header toggle set to
 * lbs, on a screen where every other number was in pounds. Caught by looking
 * at a screenshot (`npm run shots`), not by a test.
 *
 * The deterministic skeleton never had this problem — it converts on the
 * client, where the toggle lives. It is the *phrased* line that was stuck in
 * kg, which means the coach contradicted the app for every lifter in the
 * United States, one of the two markets PRODUCT.md names.
 *
 * ── WHY CONVERT HERE AND NOT IN SQL ─────────────────────────────────────────
 * Grounding is set membership against the block the model was handed. If SQL
 * emitted kg and the model wrote pounds, every figure would read as fabricated
 * and the retry would loop until it gave up. So the block itself has to be in
 * the display unit *before* the prompt is built, and the same converted block
 * has to be what grounding checks. One conversion, one source of truth, and
 * the database is untouched — `unit` in the block says which one it is.
 *
 * ── WHY THE FIELD LIST IS EXPLICIT ──────────────────────────────────────────
 * The tempting version walks the block and converts anything whose key ends in
 * `_kg` or contains `e1rm`. That is the kind of magic that silently converts a
 * count called `sets_kg_something` one day, or silently stops converting a
 * field renamed the next — and the symptom is a wrong number in a product
 * whose whole promise is that the numbers are right. So every field is named,
 * and a field added to the SQL without being added here stays in kg and is
 * *visibly* wrong next to its neighbours rather than quietly wrong.
 */

export type DisplayUnit = 'kg' | 'lbs'

const LBS_PER_KG_FACTOR = 0.453592

/**
 * A LOAD: something you put on a bar. Rounded to the nearest half pound,
 * matching `toDisplayWeight` in `src/lib/units.ts` exactly, so the phrased line
 * and the client-rendered chip beside it never disagree by a rounding step.
 */
function load(kg: number, unit: DisplayUnit): number {
  if (unit === 'kg') return kg
  return Math.round(kg / LBS_PER_KG_FACTOR / 0.5) * 0.5
}

/**
 * An ESTIMATE: an e1RM, or a change in one. Never snapped to a plate step,
 * matching `formatEstimate` — nobody racks an estimated 1RM, and snapping it
 * prints a figure the Progress screen disagrees with.
 */
function estimate(kg: number, unit: DisplayUnit): number {
  const raw = unit === 'kg' ? kg : kg / LBS_PER_KG_FACTOR
  return Math.round(raw * 10) / 10
}

/** Volume is a load summed, so it rounds like one — to the nearest unit. */
function volume(kg: number, unit: DisplayUnit): number {
  return Math.round(unit === 'kg' ? kg : kg / LBS_PER_KG_FACTOR)
}

type Block = Record<string, unknown>

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/** Convert the named fields of `target`, in place on a copy. */
function convertFields(
  source: unknown,
  fields: [string, (kg: number, unit: DisplayUnit) => number][],
  unit: DisplayUnit,
): unknown {
  if (!source || typeof source !== 'object') return source
  const out: Block = { ...(source as Block) }
  for (const [key, fn] of fields) {
    if (isNumber(out[key])) out[key] = fn(out[key], unit)
  }
  return out
}

const TARGET_FIELDS: [string, typeof load][] = [
  ['last_weight_kg', load],
  ['next_weight_kg', load],
  ['last_e1rm', estimate],
  ['best_e1rm', estimate],
  ['next_e1rm', estimate],
]

const ANCHOR_FIELDS: [string, typeof load][] = [
  ['top_weight_kg', load],
  ['e1rm', estimate],
  ['previous_e1rm', estimate],
  ['gain_since_last_e1rm', estimate],
  ['e1rm_28d', estimate],
  ['e1rm_before_28d', estimate],
]

const LIFT_FIELDS: [string, typeof load][] = [
  ['e1rm_28d', estimate],
  ['e1rm_before', estimate],
  ['gain', estimate],
  ['first_e1rm', estimate],
  ['last_e1rm', estimate],
  ['slope_per_session', estimate],
]

export function toDisplayBlock(block: unknown, unit: DisplayUnit): unknown {
  if (unit === 'kg' || !block || typeof block !== 'object') return block
  const out: Block = { ...(block as Block) }

  out.unit = unit

  if (out.target) out.target = convertFields(out.target, TARGET_FIELDS, unit)
  if (out.anchor) out.anchor = convertFields(out.anchor, ANCHOR_FIELDS, unit)
  if (isNumber(out.volume_kg)) out.volume_kg = volume(out.volume_kg, unit)

  for (const key of ['wins', 'plateaus'] as const) {
    if (Array.isArray(out[key])) {
      out[key] = (out[key] as unknown[]).map((row) =>
        convertFields(row, LIFT_FIELDS, unit),
      )
    }
  }

  // `recommendation` carries whichever figures its `kind` needs, and the only
  // weight among them is a `gain`.
  if (out.recommendation) {
    out.recommendation = convertFields(out.recommendation, [['gain', estimate]], unit)
  }

  return out
}

/** Only two values are accepted; anything else is treated as the storage unit. */
export function parseUnit(value: unknown): DisplayUnit {
  return value === 'lbs' ? 'lbs' : 'kg'
}
