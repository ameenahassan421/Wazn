import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkBlockPrivacy } from '../../supabase/functions/_shared/note-contract'
import {
  REVIEW_BLOCK_KEYS,
  SECTIONS,
  checkReviewBlock,
  checkReviewContract,
  type WeeklyReview,
} from '../../supabase/functions/_shared/review-contract'
import { checkBriefContract } from '../../supabase/functions/_shared/brief-contract'

/**
 * The eval harness for B1's two surfaces and B2's review — offense plan §7.
 *
 * `eval-notes.test.ts` covers the pre-B2 note list and still runs, because the
 * cache still holds answers in that shape. This file covers what replaced it,
 * on the same three tiers and with the same discipline:
 *
 *   tier 1  the stat blocks' own contract — shape, keys, privacy boundary
 *   tier 2  model output against the contract, from `evals/responses/`
 *   tier 3  `npm run eval:live`, manual, against the real provider
 *
 * **The adversarial fixtures are the point.** Five of the responses here MUST
 * fail — an ungrounded figure, an invented lift, forbidden advice, a dropped
 * section, and four sentences where two were allowed — and this file asserts
 * that each fails for its stated reason. An eval that can only pass is a
 * decoration.
 *
 * The golden blocks are not hand-written guesses. `review-plateau`,
 * `brief-target` and `debrief-streak` were printed by the real SQL functions
 * running on a real Postgres (`./scripts/check_sql.sh`), so a renamed key
 * breaks this suite instead of quietly producing a vaguer review.
 */

const ROOT = join(import.meta.dirname, '..', '..', 'evals')

interface Fixture {
  name: string
  kind: 'weekly_review' | 'briefing' | 'debrief'
  note?: string
  catalog?: string[]
  block: Record<string, unknown>
}

interface Response {
  fixture: string
  kind: 'weekly_review' | 'briefing' | 'debrief'
  source: 'hand-authored' | 'recorded' | 'adversarial'
  expect?: string
  model: string | null
  review?: WeeklyReview
  brief?: { line: string; chip?: string }
}

const read = <T>(dir: string, file: string): T =>
  JSON.parse(readFileSync(join(ROOT, dir, file), 'utf8')) as T

const KINDS = new Set(['weekly_review', 'briefing', 'debrief'])

const fixtures = new Map<string, Fixture>(
  readdirSync(join(ROOT, 'fixtures'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => read<Fixture>('fixtures', f))
    .filter((f) => KINDS.has(f.kind))
    .map((f) => [f.name, f]),
)

const responses = readdirSync(join(ROOT, 'responses'))
  .filter((f) => f.endsWith('.json'))
  .map((file) => ({ file, body: read<Response>('responses', file) }))
  .filter((r) => KINDS.has(r.body.kind))

const byKind = (kind: Fixture['kind']) =>
  [...fixtures.values()].filter((f) => f.kind === kind).map((f) => f.name)

describe('tier 1 — the coach blocks', () => {
  it('has a fixture for every surface', () => {
    // A harness with no fixtures passes silently, which is the failure mode
    // that makes people trust it.
    expect(byKind('weekly_review').length).toBeGreaterThanOrEqual(2)
    expect(byKind('briefing').length).toBeGreaterThanOrEqual(1)
    expect(byKind('debrief').length).toBeGreaterThanOrEqual(1)
  })

  it.each(byKind('weekly_review'))('%s carries every key the prompt uses', (name) => {
    expect(checkReviewBlock(fixtures.get(name)!.block)).toEqual([])
  })

  it('would notice a review block losing a key', () => {
    const { recommendation: _drop, ...missing } = fixtures.get('review-plateau')!.block
    const rules = checkReviewBlock(missing).map((v) => v.rule)
    expect(rules).toContain('block-key-missing')
    expect(rules).toContain('block-no-recommendation')
    // And the key list is the prompt's, not a subset someone trimmed.
    expect(REVIEW_BLOCK_KEYS).toContain('plateau_min_sessions')
  })

  it.each([...fixtures.keys()])('%s reports weights in kg', (name) => {
    // Storage is kg always; a block that said lb would make every figure in
    // every sentence wrong by a factor and every one of them grounded.
    expect(fixtures.get(name)!.block.unit).toBe('kg')
  })

  it.each([...fixtures.keys()])('%s carries nothing identifying', (name) => {
    // The SQL suite asserts this against a real database; this asserts it
    // against the shape the prompt is written for.
    expect(checkBlockPrivacy(fixtures.get(name)!.block)).toEqual([])
  })
})

describe('tier 2 — the weekly review against its contract', () => {
  const reviews = responses.filter((r) => r.body.kind === 'weekly_review')
  const good = reviews.filter((r) => r.body.source !== 'adversarial')
  const bad = reviews.filter((r) => r.body.source === 'adversarial')

  it('every response names a fixture that exists', () => {
    for (const { file, body } of responses) {
      expect(fixtures.has(body.fixture), `${file} names unknown fixture`).toBe(true)
    }
  })

  it.each(good.map((r) => r.file))('%s satisfies the contract', (file) => {
    const body = read<Response>('responses', file)
    const fixture = fixtures.get(body.fixture)!
    const violations = checkReviewContract(body.review!, fixture.block, {
      catalog: fixture.catalog,
    })
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([])
  })

  it('has adversarial responses, so a green run means something', () => {
    expect(bad.length).toBeGreaterThanOrEqual(4)
  })

  it.each(bad.map((r) => r.file))('%s is caught, for its stated reason', (file) => {
    const body = read<Response>('responses', file)
    const fixture = fixtures.get(body.fixture)!
    const violations = checkReviewContract(body.review!, fixture.block, {
      catalog: fixture.catalog,
    })
    expect(violations.length).toBeGreaterThan(0)

    // Caught for the RIGHT reason. A fixture that fails on an unrelated typo
    // would look like the guard working while it slept.
    const rules = violations.map((v) => v.rule)
    if (body.expect === 'unsafe') {
      expect(rules).toContain('forbidden-advice')
      expect(rules).not.toContain('ungrounded')
    } else {
      expect(rules).toContain(body.expect!)
    }
  })

  it('renders the same five sections in the same order every week', () => {
    // The contract IS the fixed shape. Both good responses must fill all five,
    // or "the same sections every week" is aspiration rather than fact.
    for (const { file } of good) {
      const body = read<Response>('responses', file)
      expect(Object.keys(body.review!.sections), file).toEqual([...SECTIONS])
    }
  })
})

describe('tier 2 — the one-line surfaces against their contract', () => {
  const lines = responses.filter((r) => r.body.kind !== 'weekly_review')
  const good = lines.filter((r) => r.body.source !== 'adversarial')
  const bad = lines.filter((r) => r.body.source === 'adversarial')

  it.each(good.map((r) => r.file))('%s satisfies the contract', (file) => {
    const body = read<Response>('responses', file)
    const fixture = fixtures.get(body.fixture)!
    const violations = checkBriefContract(body.brief!, fixture.block, {
      catalog: fixture.catalog,
    })
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([])
  })

  it.each(bad.map((r) => r.file))('%s is caught, for its stated reason', (file) => {
    const body = read<Response>('responses', file)
    const fixture = fixtures.get(body.fixture)!
    const violations = checkBriefContract(body.brief!, fixture.block, {
      catalog: fixture.catalog,
    })
    expect(violations.map((v) => v.rule)).toContain(body.expect!)
  })
})

describe('the contracts themselves', () => {
  const fixture = () => fixtures.get('review-plateau')!

  const valid = (): WeeklyReview => ({
    headline: 'Squat stalled, calves missing',
    sections: {
      adherence: { line: 'One session this week against an average of 1.0.' },
      bands: { line: 'Calves are at 0 sets against 10 to 20.' },
      plateaus: { line: 'Squat has held at 154.0 across 6 sessions.' },
      wins: { line: 'Lat Pulldown is up 20.0 this month.' },
      recommendation: { line: 'Put calves back in next week.' },
    },
  })

  it('accepts a well-formed review', () => {
    expect(checkReviewContract(valid(), fixture().block)).toEqual([])
  })

  it('rejects a headline longer than eight words', () => {
    const review = valid()
    review.headline = 'This headline runs on for rather a lot more words than allowed'
    expect(checkReviewContract(review, fixture().block).map((v) => v.rule)).toContain(
      'headline-words',
    )
  })

  it('rejects a section it has never heard of', () => {
    const review = valid() as WeeklyReview & { sections: Record<string, unknown> }
    review.sections.motivation = { line: 'You have got this.' }
    expect(checkReviewContract(review, fixture().block).map((v) => v.rule)).toContain(
      'section-unknown',
    )
  })

  it('rejects a recommendation that is secretly a list', () => {
    // "Exactly ONE next-week recommendation" is a promise about the product.
    // The deterministic layer picks which one; this is what stops the model
    // turning it back into options.
    const review = valid()
    review.sections.recommendation.line =
      'Two things: - put calves back in, - and drop squat volume.'
    expect(checkReviewContract(review, fixture().block).map((v) => v.rule)).toContain(
      'recommendation-list',
    )
  })

  it('does not flag a single-word lift as an invented one', () => {
    // "Row", "Curl", "Dip" and "Plank" are catalog entries AND ordinary
    // English. A check that flagged "your rows are behind" would be switched
    // off inside a day, and a check people switch off catches nothing.
    const review = valid()
    review.sections.bands.line = 'Your rows and curls are behind at 3 sets.'
    const rules = checkReviewContract(review, fixture().block, {
      catalog: ['Row (Cable)', 'Curl (Dumbbell)', 'Romanian Deadlift (Barbell)'],
    }).map((v) => v.rule)
    expect(rules).not.toContain('unknown-exercise')
  })

  it('flags a multi-word lift the block never mentioned', () => {
    const review = valid()
    review.sections.recommendation.line = 'Add Romanian Deadlift next week.'
    const rules = checkReviewContract(review, fixture().block, {
      catalog: ['Romanian Deadlift (Barbell)'],
    }).map((v) => v.rule)
    expect(rules).toContain('unknown-exercise')
  })

  it('allows a lift the block DID mention, in either spelling', () => {
    // The block says "Lat Pulldown (Cable)" and a model writes "Lat Pulldown".
    // Matching full catalog strings would miss every real mention, which is
    // the quiet way for a guard to be useless.
    const review = valid()
    review.sections.wins.line = 'Lat Pulldown is up 20.0 this month.'
    const rules = checkReviewContract(review, fixture().block, {
      catalog: ['Lat Pulldown (Cable)', 'Romanian Deadlift (Barbell)'],
    }).map((v) => v.rule)
    expect(rules).not.toContain('unknown-exercise')
  })

  it('caps the one-line surfaces at two sentences', () => {
    const block = fixtures.get('brief-target')!.block
    expect(
      checkBriefContract({ line: 'One. Two. Three.' }, block).map((v) => v.rule),
    ).toContain('too-many-sentences')
    // A decimal is not a sentence boundary, and neither is a trailing period.
    expect(
      checkBriefContract(
        { line: 'Bench was 100 kg x 5. Try 102.5 for 116.7.' },
        block,
      ).map((v) => v.rule),
    ).not.toContain('too-many-sentences')
  })

  it('rejects an empty line outright', () => {
    const block = fixtures.get('brief-target')!.block
    expect(checkBriefContract({ line: '   ' }, block).map((v) => v.rule)).toEqual([
      'line-missing',
    ])
  })
})
