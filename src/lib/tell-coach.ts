/**
 * "Tell the coach" — design v3.0 §07, the ONE conversational surface.
 *
 * This is the single amendment to v2.1's "no chat anywhere", and the contract
 * below is what keeps it from becoming a chatbot. Three properties, and each
 * one is structural rather than a rule somebody has to remember:
 *
 *  1. **The output type cannot hold prose.** `ProposedEdit` is a closed union
 *     of the app's own objects — adjusted ghosts, a swap, a trimmed plan, a
 *     note. There is no `advice: string` for a sentence to arrive in. GATE V3
 *     asks that red-teaming cannot make this surface emit prose advice; the
 *     way to pass that is to have nowhere to put it.
 *  2. **No model is involved.** Classification is deterministic keyword
 *     matching, on-device, and it always terminates in one of four edits. A
 *     provider outage, a spent quota and a jailbreak attempt all produce the
 *     same thing a normal utterance does.
 *  3. **The unclassifiable case is a NOTE, not a question.** "No follow-up
 *     question" is in the spec. When the app cannot tell what someone meant it
 *     attaches their own words to the exercise and offers Accept / Keep as
 *     planned — which is a useful outcome, and it is the lifter's sentence
 *     rather than one this module wrote.
 *
 * Pain words get an ease-off plus the non-medical micro line. The coach never
 * diagnoses, and `note: 'non-medical'` is a flag the component renders from an
 * existing string — not a sentence generated here.
 */

/** The four chips, in the order the sheet draws them. Copy lives in i18n. */
export const TELL_COACH_CHIPS = [
  'too-heavy',
  'shoulder-off',
  'no-bench-free',
  'short-on-time',
] as const

export type TellCoachChip = (typeof TELL_COACH_CHIPS)[number]

export type ProposedEdit =
  /** Adjusted ghosts: the remaining planned sets come down one increment. */
  | {
      kind: 'ease-load'
      exerciseId: string
      fromKg: number
      toKg: number
      /** Set when pain words were used. Renders the existing non-medical line. */
      nonMedical: boolean
    }
  /** The swap card (§10). The picker ranks candidates; this names the need. */
  | { kind: 'swap'; exerciseId: string }
  /** A trimmed session plan: fewer working sets, same lifts. */
  | { kind: 'trim'; exerciseId: string; fromSets: number; toSets: number }
  /** The lifter's own words, attached to the exercise. Never generated text. */
  | { kind: 'note'; exerciseId: string; text: string }

export interface TellCoachContext {
  exerciseId: string
  /** The working weight the ghosts are currently sitting at, in kg. */
  currentKg: number | null
  /** Planned working sets for this block. */
  plannedSets: number
  /** Working sets already committed. A trim never goes below this. */
  committedSets: number
  /** The smallest jump the lifter can load. */
  incrementKg: number
}

/**
 * Words that mean "this hurts".
 *
 * Deliberately narrow. "Sore" is not here: sore is what training feels like,
 * and easing every session that starts with a sore lifter would make the
 * feature useless within a week. Arabic terms are included because the classifier
 * is the only thing standing between an Arabic utterance and the fallback, and
 * the fallback for a pain sentence should not be a note.
 */
const PAIN = [
  'pain',
  'hurt',
  'sharp',
  'twinge',
  'tweak',
  'pinch',
  'ache',
  'aching',
  'injur',
  'strain',
  'pulled',
  'off',
  'ألم',
  'يؤلم',
  'وجع',
  'إصابة',
]

const HEAVY = ['heavy', 'too much', 'grind', 'grinding', 'slow', 'ثقيل', 'صعب']

const UNAVAILABLE = [
  'taken',
  'busy',
  'occupied',
  'no bench',
  'no rack',
  'no squat',
  'free',
  'in use',
  'مشغول',
  'محجوز',
]

const SHORT_ON_TIME = [
  'time',
  'quick',
  'hurry',
  'rush',
  'late',
  'short on',
  'وقت',
  'مستعجل',
  'سريع',
]

function hits(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w))
}

/**
 * One utterance in, one proposed edit out. Total: there is no input for which
 * this returns nothing, because a sheet that sometimes answers is a sheet
 * somebody has to tap twice.
 *
 * `chip` short-circuits the classifier — a chip is not ambiguous, and running
 * "Shoulder's off" through keyword matching that also contains "off" as a pain
 * word is the kind of coincidence that works until somebody renames a chip.
 */
export function proposeEdit(
  input: { chip?: TellCoachChip | null; text?: string | null },
  ctx: TellCoachContext,
): ProposedEdit {
  if (input.chip) return fromChip(input.chip, ctx)

  const text = (input.text ?? '').trim()
  if (text.length === 0) return note(ctx, '')

  const lower = text.toLowerCase()

  // Pain first. It outranks everything else in the sentence: "shoulder hurts,
  // and the bench is taken" is a body to look after, not a machine to swap.
  if (hits(lower, PAIN)) return easeLoad(ctx, true)
  if (hits(lower, HEAVY)) return easeLoad(ctx, false)
  if (hits(lower, UNAVAILABLE)) return { kind: 'swap', exerciseId: ctx.exerciseId }
  if (hits(lower, SHORT_ON_TIME)) return trim(ctx)

  // Unclassifiable: the lifter's own words, attached to the lift. Not a
  // question back, and not a guess dressed as an edit.
  return note(ctx, text)
}

function fromChip(chip: TellCoachChip, ctx: TellCoachContext): ProposedEdit {
  switch (chip) {
    case 'too-heavy':
      return easeLoad(ctx, false)
    case 'shoulder-off':
      return easeLoad(ctx, true)
    case 'no-bench-free':
      return { kind: 'swap', exerciseId: ctx.exerciseId }
    case 'short-on-time':
      return trim(ctx)
  }
}

function easeLoad(ctx: TellCoachContext, nonMedical: boolean): ProposedEdit {
  // With no working weight to ease — a brand-new lift, or a bodyweight
  // movement — there is nothing to propose against, so the honest edit is the
  // note. Proposing "0 kg → −2.5 kg" would be worse than saying nothing.
  if (ctx.currentKg === null || ctx.currentKg <= 0) {
    return { kind: 'note', exerciseId: ctx.exerciseId, text: '' }
  }
  const step = ctx.incrementKg > 0 ? ctx.incrementKg : 2.5
  const toKg = Math.max(step, Number((ctx.currentKg - step).toFixed(2)))
  return {
    kind: 'ease-load',
    exerciseId: ctx.exerciseId,
    fromKg: ctx.currentKg,
    toKg,
    nonMedical,
  }
}

function trim(ctx: TellCoachContext): ProposedEdit {
  // Never below what has already been done, and never below one set: a session
  // trimmed to nothing is a session somebody abandons instead.
  const floor = Math.max(1, ctx.committedSets)
  const toSets = Math.max(floor, ctx.plannedSets - 1)
  if (toSets >= ctx.plannedSets) {
    return { kind: 'note', exerciseId: ctx.exerciseId, text: '' }
  }
  return {
    kind: 'trim',
    exerciseId: ctx.exerciseId,
    fromSets: ctx.plannedSets,
    toSets,
  }
}

function note(ctx: TellCoachContext, text: string): ProposedEdit {
  // Trimmed to what an exercise note column will hold. Truncating the lifter's
  // own sentence is better than a write that fails silently mid-workout.
  return { kind: 'note', exerciseId: ctx.exerciseId, text: text.slice(0, 200) }
}
