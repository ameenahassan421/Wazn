/**
 * The weekly review's contract — B2's "review contract" as a running check.
 *
 * Coach's Notes used to be "3 to 5 observations, most important first". That
 * is a good answer to "what does my training look like" and a bad answer to
 * "what am I reading" — the sections moved every week, so there was nothing to
 * learn to read. §3-A3 replaces it with a **fixed shape**: the same five
 * sections, in the same order, every week, so it can be scanned like a program
 * card rather than read like an essay.
 *
 * A shape is only fixed if something enforces it. This is that something, and
 * it runs in the same three places the note contract does — production before
 * a review is returned, CI against checked-in responses, and `eval:live`
 * against fresh ones.
 *
 * Deterministic throughout: grounding is set membership, the caps are lengths,
 * the safety check is vocabulary, and the sections are a list of five known
 * keys. No judge model — that would add cost, variance, and a second thing to
 * trust on the one surface whose entire promise is that every figure is
 * checkable.
 */

import { checkGrounded, collectAllowedNumbers, ungroundedNames } from './grounding.ts'
import type { ContractViolation } from './note-contract.ts'
import { FORBIDDEN_RE, EMOJI_RE } from './note-contract.ts'

export type { ContractViolation } from './note-contract.ts'

/**
 * The five sections, in render order.
 *
 * `recommendation` is last because it is the thing to act on and the review is
 * read top to bottom: everything above it is the case for it.
 */
export const SECTIONS = [
  'adherence',
  'bands',
  'plateaus',
  'wins',
  'recommendation',
] as const

export type SectionKey = (typeof SECTIONS)[number]

export interface ReviewSection {
  /** 1 to 2 sentences. */
  line: string
  /** The figures it came from, verbatim from the block. */
  chip?: string
}

export interface WeeklyReview {
  /** At most 8 words, the same cap the notes headline had. */
  headline: string
  sections: Record<SectionKey, ReviewSection>
}

const MAX_HEADLINE_WORDS = 8
const MAX_HEADLINE_CHARS = 80
const MAX_LINE_CHARS = 320
const MAX_CHIP_CHARS = 60

export interface ReviewContractOptions {
  /**
   * Every exercise name the app knows, for the invented-lift check. Omit and
   * that check does not run — see `ungroundedNames`.
   */
  catalog?: readonly string[]
}

export function checkReviewContract(
  review: WeeklyReview,
  block: unknown,
  { catalog = [] }: ReviewContractOptions = {},
): ContractViolation[] {
  const violations: ContractViolation[] = []
  const at = (rule: string, detail: string, index = -1) =>
    violations.push({ index, rule, detail })

  const words = review.headline?.trim().split(/\s+/).filter(Boolean).length ?? 0
  if (!review.headline?.trim()) {
    at('headline-missing', 'no headline')
  } else {
    if (words > MAX_HEADLINE_WORDS) {
      at('headline-words', `${words} words, max ${MAX_HEADLINE_WORDS}`)
    }
    if (review.headline.length > MAX_HEADLINE_CHARS) {
      at('headline-length', `${review.headline.length}`)
    }
  }

  // The contract's whole point: every section, every week, no extras. A review
  // that quietly drops "plateaus" in a good week is the old behaviour wearing
  // the new shape — the section is supposed to say "nothing stalled".
  const present = Object.keys(review.sections ?? {})
  for (const key of SECTIONS) {
    if (!review.sections?.[key]?.line?.trim()) {
      at('section-missing', key)
    }
  }
  for (const key of present) {
    if (!(SECTIONS as readonly string[]).includes(key)) {
      at('section-unknown', key)
    }
  }

  const allowed = collectAllowedNumbers(block)

  SECTIONS.forEach((key, index) => {
    const section = review.sections?.[key]
    if (!section?.line) return

    if (section.line.length > MAX_LINE_CHARS) {
      at('line-length', `${key}: ${section.line.length}`, index)
    }
    if (section.chip && section.chip.length > MAX_CHIP_CHARS) {
      at('chip-length', `${key}: ${section.chip.length}`, index)
    }

    const text = `${section.line} ${section.chip ?? ''}`
    const forbidden = FORBIDDEN_RE.exec(text)
    if (forbidden) at('forbidden-advice', `${key}: ${forbidden[0]}`, index)
    if (EMOJI_RE.test(text)) at('emoji', key, index)
    if (text.includes('!')) at('exclamation', key, index)

    const grounding = checkGrounded(text, allowed)
    if (!grounding.grounded) {
      at('ungrounded', `${key}: ${grounding.ungrounded.join(', ')}`, index)
    }

    const names = ungroundedNames(text, block, catalog)
    if (names.length > 0) {
      at('unknown-exercise', `${key}: ${names.join(', ')}`, index)
    }
  })

  // "Exactly ONE next-week recommendation" is a promise about the product, and
  // the deterministic layer already picks which one. What is left to check is
  // that the model did not turn it back into a list.
  const recommendation = review.sections?.recommendation?.line ?? ''
  const bullets = (recommendation.match(/(^|\s)[-•*]\s/g) ?? []).length
  if (bullets > 0) {
    at(
      'recommendation-list',
      `${bullets} bullet(s)`,
      SECTIONS.indexOf('recommendation'),
    )
  }

  return violations
}

/**
 * The review block's own contract.
 *
 * `checkBlockPrivacy` in `note-contract.ts` covers the privacy boundary for
 * any block. This covers the *shape* of `weekly_review()` specifically: the
 * keys the prompt is written against. A block missing one does not error — it
 * silently produces a section about nothing, which reads as the coach having
 * no opinion rather than as a broken query.
 */
export const REVIEW_BLOCK_KEYS = [
  'unit',
  'productive_range',
  'plateau_min_sessions',
  'adherence',
  'bands',
  'plateaus',
  'wins',
  'records_last_7',
  'total_sets_90d',
  'recommendation',
] as const

export function checkReviewBlock(block: unknown): ContractViolation[] {
  const violations: ContractViolation[] = []
  if (!block || typeof block !== 'object') {
    return [{ index: -1, rule: 'block-shape', detail: 'not an object' }]
  }
  const record = block as Record<string, unknown>
  for (const key of REVIEW_BLOCK_KEYS) {
    if (!(key in record)) {
      violations.push({ index: -1, rule: 'block-key-missing', detail: key })
    }
  }
  // The recommendation is chosen in SQL, so a block without one means the
  // review has nothing to end on and the model will invent an ending.
  const recommendation = record.recommendation as { kind?: unknown } | undefined
  if (!recommendation || typeof recommendation.kind !== 'string') {
    violations.push({ index: -1, rule: 'block-no-recommendation', detail: 'kind' })
  }
  return violations
}
