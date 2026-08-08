/**
 * What one line from the coach must satisfy.
 *
 * The briefing and the debrief are the same object in two moods: a sentence or
 * two, one data chip, written from a block of figures computed in SQL. They
 * are also the two surfaces that sit closest to the core loop — the briefing
 * is the last thing read before Start, the debrief the first thing read after
 * Finish — so the caps here are tighter than the review's on purpose. Under
 * the one law, a paragraph at either of those moments is not a longer answer,
 * it is an ignored one.
 *
 * Same three homes as every other contract in this directory: production, CI,
 * and `eval:live`.
 */

import { checkGrounded, collectAllowedNumbers, ungroundedNames } from './grounding.ts'
import type { ContractViolation } from './note-contract.ts'
import { EMOJI_RE, FORBIDDEN_RE } from './note-contract.ts'

export type { ContractViolation } from './note-contract.ts'

export interface BriefLine {
  line: string
  chip?: string
}

/**
 * "≤2 sentences" from the plan, as characters — a sentence count is a fight
 * about abbreviations, and 200 characters is about two sentences of the terse
 * register the prompt asks for.
 */
const MAX_LINE_CHARS = 200
const MAX_CHIP_CHARS = 44

export function checkBriefContract(
  brief: BriefLine,
  block: unknown,
  { catalog = [] }: { catalog?: readonly string[] } = {},
): ContractViolation[] {
  const violations: ContractViolation[] = []
  const at = (rule: string, detail: string) =>
    violations.push({ index: 0, rule, detail })

  if (!brief?.line?.trim()) {
    return [{ index: 0, rule: 'line-missing', detail: 'empty' }]
  }
  if (brief.line.length > MAX_LINE_CHARS) {
    at('line-length', `${brief.line.length}, max ${MAX_LINE_CHARS}`)
  }
  if (brief.chip && brief.chip.length > MAX_CHIP_CHARS) {
    at('chip-length', `${brief.chip.length}, max ${MAX_CHIP_CHARS}`)
  }

  // Three sentences is the failure that actually happens: the model has three
  // facts and writes all three. Counted on terminators followed by a space or
  // end, so "62.5 kg" and "e1RM." do not each become a sentence.
  const sentences = brief.line
    .trim()
    .split(/[.?][\s]+|[.?]$/)
    .filter(Boolean).length
  if (sentences > 2) at('too-many-sentences', `${sentences}`)

  const text = `${brief.line} ${brief.chip ?? ''}`

  const forbidden = FORBIDDEN_RE.exec(text)
  if (forbidden) at('forbidden-advice', forbidden[0])
  if (EMOJI_RE.test(text)) at('emoji', 'emoji in output')
  if (text.includes('!')) at('exclamation', 'exclamation mark')

  const grounding = checkGrounded(text, collectAllowedNumbers(block))
  if (!grounding.grounded) at('ungrounded', grounding.ungrounded.join(', '))

  const names = ungroundedNames(text, block, catalog)
  if (names.length > 0) at('unknown-exercise', names.join(', '))

  return violations
}
