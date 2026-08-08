import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  checkBlockPrivacy,
  checkNoteContract,
} from '../../supabase/functions/_shared/note-contract'

/**
 * The eval harness, tiers 1 and 2 (`docs/INFRASTRUCTURE_AUDIT.md` §4).
 *
 * Tier 1 — the stat block's own contract: shape, and the privacy boundary that
 * was previously only a comment on `coach_stats()`.
 * Tier 2 — model output against the contract, using the checked-in responses
 * in `evals/responses/`.
 *
 * Both run in CI with no network and no provider. Tier 3 — the same assertions
 * against fresh answers from the real model — is `npm run eval:live`, manual on
 * purpose: a build that goes red because of someone else's rate limit teaches
 * people to ignore red builds.
 *
 * **The adversarial fixtures are the point.** An eval that can only pass is a
 * decoration; the two `expect: "ungrounded" | "unsafe"` responses must fail, and
 * this file asserts that they do. That is what makes a green run mean anything.
 */

const ROOT = join(import.meta.dirname, '..', '..', 'evals')

interface Fixture {
  name: string
  note?: string
  block: Record<string, unknown>
}

interface Response {
  fixture: string
  source: 'hand-authored' | 'recorded' | 'adversarial'
  expect?: 'ungrounded' | 'unsafe'
  model: string | null
  insights: { title: string; body: string; chip?: string }[]
}

const read = <T>(dir: string, file: string): T =>
  JSON.parse(readFileSync(join(ROOT, dir, file), 'utf8')) as T

const fixtureFiles = readdirSync(join(ROOT, 'fixtures')).filter((f) =>
  f.endsWith('.json'),
)
const responseFiles = readdirSync(join(ROOT, 'responses')).filter((f) =>
  f.endsWith('.json'),
)

const fixtures = new Map<string, Fixture>(
  fixtureFiles.map((f) => {
    const fixture = read<Fixture>('fixtures', f)
    return [fixture.name, fixture]
  }),
)

describe('tier 1 — the stat block contract', () => {
  it('has fixtures at all', () => {
    // A harness with no fixtures passes silently, which is the failure mode
    // that makes people trust it.
    expect(fixtures.size).toBeGreaterThanOrEqual(3)
  })

  it.each([...fixtures.keys()])('%s carries the keys the prompt relies on', (name) => {
    const block = fixtures.get(name)!.block
    // Each of these is named in the system prompt as something the model
    // should reason from. A block missing one silently degrades the notes.
    for (const key of [
      'unit',
      'window_days',
      'sessions_last_7',
      'sessions_last_28',
      'weekly_sets_by_muscle',
      'weekly_sets_by_muscle_4w_ago',
      'lifts',
      'records_last_28',
      'total_sets_90d',
    ]) {
      expect(block, `${name} is missing ${key}`).toHaveProperty(key)
    }
  })

  it.each([...fixtures.keys()])('%s reports weights in kg', (name) => {
    // Storage is kg always; a block that said lb would make every figure in
    // every note wrong by a factor and every one of them grounded.
    expect(fixtures.get(name)!.block.unit).toBe('kg')
  })

  it.each([...fixtures.keys()])('%s carries nothing identifying', (name) => {
    // `coach_stats()` says "no identifying fields, by construction". This is
    // that sentence as a check rather than a comment.
    expect(checkBlockPrivacy(fixtures.get(name)!.block)).toEqual([])
  })

  it('would catch an identifying field if one appeared', () => {
    const leaky = {
      email: 'someone@example.com',
      lifts: [{ name: 'Bench Press (Barbell)', best_e1rm: 100 }],
    }
    const rules = checkBlockPrivacy(leaky).map((v) => v.rule)
    expect(rules).toContain('identifying-key')
    expect(rules).toContain('email-in-block')
  })

  it('does not mistake an exercise name for a person', () => {
    // `lifts[].name` is explicitly allowed by §2C — numbers and exercise
    // names. A privacy check that flagged it would be turned off within a day.
    expect(checkBlockPrivacy({ lifts: [{ name: 'Squat (Barbell)' }] })).toEqual([])
  })
})

describe('tier 2 — model output against the contract', () => {
  const responses = responseFiles.map((f) => ({
    file: f,
    body: read<Response>('responses', f),
  }))

  it('every response names a fixture that exists', () => {
    for (const { file, body } of responses) {
      expect(fixtures.has(body.fixture), `${file} names unknown fixture`).toBe(true)
    }
  })

  const good = responses.filter((r) => r.body.source !== 'adversarial')
  const bad = responses.filter((r) => r.body.source === 'adversarial')

  it.each(good.map((r) => r.file))('%s satisfies the contract', (file) => {
    const body = read<Response>('responses', file)
    const violations = checkNoteContract(
      body.insights,
      fixtures.get(body.fixture)!.block,
    )
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([])
  })

  it('has adversarial fixtures, so a green run means something', () => {
    expect(bad.length).toBeGreaterThanOrEqual(2)
  })

  it.each(bad.map((r) => r.file))('%s is caught', (file) => {
    const body = read<Response>('responses', file)
    const violations = checkNoteContract(
      body.insights,
      fixtures.get(body.fixture)!.block,
    )
    expect(violations.length).toBeGreaterThan(0)

    // And caught for the stated reason — a fixture that fails for an
    // unrelated typo would look like the guard working while it slept.
    const rules = violations.map((v) => v.rule)
    if (body.expect === 'ungrounded') expect(rules).toContain('ungrounded')
    if (body.expect === 'unsafe') {
      expect(rules).toContain('forbidden-advice')
      expect(rules).not.toContain('ungrounded')
    }
  })
})

describe('the contract itself', () => {
  const block = { lifts: [{ name: 'Bench Press (Barbell)', best_e1rm: 100 }] }

  it('rejects a headline longer than eight words', () => {
    const violations = checkNoteContract(
      [
        {
          title: 'This headline runs on for rather a lot more words than allowed',
          body: 'Bench is at 100.',
        },
      ],
      block,
    )
    expect(violations.map((v) => v.rule)).toContain('title-words')
  })

  it('rejects an empty answer and an over-long one', () => {
    expect(checkNoteContract([], block).map((v) => v.rule)).toContain('count')
    const many = Array.from({ length: 6 }, () => ({
      title: 'Fine',
      body: 'Bench 100.',
    }))
    expect(checkNoteContract(many, block).map((v) => v.rule)).toContain('count')
  })

  it('rejects emoji and exclamation marks', () => {
    const rules = checkNoteContract(
      [{ title: 'Nice work', body: 'Bench is 100! 💪' }],
      block,
    ).map((v) => v.rule)
    expect(rules).toContain('emoji')
    expect(rules).toContain('exclamation')
  })

  it('rejects diet, supplement and injury vocabulary', () => {
    for (const body of [
      'Add more protein to move past 100.',
      'That pattern often means an injury.',
      'Eat in a deficit and bench 100.',
    ]) {
      const rules = checkNoteContract([{ title: 'Bench', body }], block).map(
        (v) => v.rule,
      )
      expect(rules, body).toContain('forbidden-advice')
    }
  })

  it('does not trip on ordinary training words that merely contain one', () => {
    // "paint" contains "pain"; "cutting" is not the word "cut". A check that
    // cries wolf gets deleted.
    const violations = checkNoteContract(
      [{ title: 'Bench holding', body: 'Bench sits at 100 and is not moving.' }],
      block,
    )
    expect(violations).toEqual([])
  })
})
