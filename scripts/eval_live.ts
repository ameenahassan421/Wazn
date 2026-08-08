/**
 * Eval tier 3 — the same assertions, against the real model.
 *
 *     npm run eval:live              # check, print a report, change nothing
 *     npm run eval:live -- --record  # also rewrite evals/responses/*.recorded.json
 *     npm run eval:live -- --only briefing
 *
 * WHY IT IS MANUAL
 *   `docs/INFRASTRUCTURE_AUDIT.md` §4. Tiers 1 and 2 run in CI against
 *   checked-in responses, cost nothing, and never flake. This tier calls a
 *   provider, so it costs money and can fail for reasons that have nothing to
 *   do with the code — and a build that goes red because of someone else's
 *   rate limit teaches people to ignore red builds.
 *
 *   It is also the only tier that can catch the two things that have actually
 *   happened here: the free model silently getting worse, and a new free model
 *   not honouring `response_format` at all. Recorded responses go stale by
 *   construction; this is what notices.
 *
 * WHAT IT NEEDS
 *   OPENROUTER_API_KEY in the environment (or in .env — this reads both).
 *   Nothing else. It does not touch the database and never sees a real user's
 *   data: the blocks are the fixtures in `evals/fixtures/`, which is what makes
 *   it safe to run and to paste the output of.
 *
 * WHAT IT COVERS, AS OF B2
 *   The three surfaces that have a live prompt: the weekly review
 *   (`coach-notes`) and the briefing and debrief (`coach-brief`). The legacy
 *   `coach_notes` fixtures — the pre-B2 note list — are SKIPPED, because the
 *   prompt that produced them no longer exists in the repo. They still run in
 *   CI tier 2, where they guard the cached answers users can still be served.
 *
 * WEEKLY, DURING BETA. The plan asks for a spot-check of real outputs; this is
 * that spot-check with the judgement taken out of it.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { config } from 'dotenv'
import { checkReviewContract } from '../supabase/functions/_shared/review-contract'
import type { WeeklyReview } from '../supabase/functions/_shared/review-contract'
import { checkBriefContract } from '../supabase/functions/_shared/brief-contract'
import type { ContractViolation } from '../supabase/functions/_shared/note-contract'

config()

const ROOT = join(import.meta.dirname, '..', 'evals')
const FUNCTIONS = join(import.meta.dirname, '..', 'supabase', 'functions')
const RECORD = process.argv.includes('--record')
const ONLY = process.argv[process.argv.indexOf('--only') + 1]

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

/**
 * The prompts are read out of the Edge Functions rather than duplicated here.
 *
 * That seam is real and named: a prompt edited in the function and not here
 * would mean this tier grades yesterday's prompt. Reading the source is the
 * cheapest way to make drift impossible rather than merely visible, and
 * PROMPT_VERSION is checked below so a rename is still loud.
 */
function extract(file: string, marker: string, terminator = '`'): string {
  const source = readFileSync(join(FUNCTIONS, file), 'utf8')
  const body = source.split(marker)[1]?.split(terminator)[0]
  if (!body) fail(`could not read ${marker} out of ${file}`)
  return body
}

const REVIEW_SYSTEM = extract('coach-notes/index.ts', 'const SYSTEM = `')
const BRIEF_SYSTEM = extract('coach-brief/index.ts', 'const SYSTEM = `')
const BRIEFING_INSTRUCTION = extract('coach-brief/index.ts', '  briefing: `')
const DEBRIEF_INSTRUCTION = extract('coach-brief/index.ts', '  debrief: `')

// Single-quoted, so the terminator is not a backtick. Getting this wrong is
// silent: it yields the version plus the whole next declaration, and the only
// symptom is a strange banner line.
const REVIEW_VERSION = extract('coach-notes/index.ts', "const PROMPT_VERSION = '", "'")
const BRIEF_VERSION = extract('coach-brief/index.ts', "const PROMPT_VERSION = '", "'")

type Kind = 'weekly_review' | 'briefing' | 'debrief'

interface Fixture {
  name: string
  kind?: string
  catalog?: string[]
  block: Record<string, unknown>
}

const SURFACES: Record<
  Kind,
  { system: string; instruction: string; version: string; maxTokens: number }
> = {
  weekly_review: {
    system: REVIEW_SYSTEM,
    instruction: '',
    version: REVIEW_VERSION,
    maxTokens: 1600,
  },
  briefing: {
    system: BRIEF_SYSTEM,
    instruction: BRIEFING_INSTRUCTION,
    version: BRIEF_VERSION,
    maxTokens: 400,
  },
  debrief: {
    system: BRIEF_SYSTEM,
    instruction: DEBRIEF_INSTRUCTION,
    version: BRIEF_VERSION,
    maxTokens: 400,
  },
}

async function askModel(
  kind: Kind,
  block: unknown,
): Promise<{ answer: Record<string, unknown>; model: string }> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) fail('OPENROUTER_API_KEY is not set. Put it in .env or the environment.')

  const surface = SURFACES[kind]
  const model =
    (kind === 'weekly_review'
      ? process.env.COACH_MODEL_FREE
      : (process.env.BRIEF_MODEL_FREE ?? process.env.COACH_MODEL_FREE)) ??
    'nvidia/nemotron-3-super-120b-a12b:free'

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://trywazn.app',
      'X-Title': 'Wazn eval',
    },
    body: JSON.stringify({
      model,
      max_tokens: surface.maxTokens,
      temperature: 0.4,
      messages: [
        { role: 'system', content: surface.system },
        { role: 'user', content: JSON.stringify(block) + surface.instruction },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(
      `provider ${response.status}: ${(await response.text()).slice(0, 200)}`,
    )
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = payload.choices?.[0]?.message?.content ?? ''
  // The same recovery the Edge Function uses, inline — importing the Deno
  // module here would drag in `Deno.env`.
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('no JSON object in the answer')
  return {
    answer: JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>,
    model,
  }
}

function check(
  kind: Kind,
  answer: Record<string, unknown>,
  fixture: Fixture,
): { violations: ContractViolation[]; recorded: Record<string, unknown> } {
  if (kind === 'weekly_review') {
    const review = answer as unknown as WeeklyReview
    return {
      violations: checkReviewContract(review, fixture.block, {
        catalog: fixture.catalog,
      }),
      recorded: { review },
    }
  }
  const brief = answer as { line: string; chip?: string }
  return {
    violations: checkBriefContract(brief, fixture.block, { catalog: fixture.catalog }),
    recorded: { brief },
  }
}

async function main(): Promise<void> {
  const fixtures = readdirSync(join(ROOT, 'fixtures'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(ROOT, 'fixtures', f), 'utf8')) as Fixture)
    .filter((f): f is Fixture & { kind: Kind } => {
      if (!f.kind || !(f.kind in SURFACES)) return false
      return !ONLY || f.kind === ONLY
    })

  if (fixtures.length === 0) fail('no live-evaluable fixtures matched')

  console.log(
    `eval:live — ${fixtures.length} fixtures, prompts ${REVIEW_VERSION} / ${BRIEF_VERSION}\n`,
  )

  let failures = 0

  for (const fixture of fixtures) {
    const startedAt = Date.now()
    try {
      const { answer, model } = await askModel(fixture.kind, fixture.block)
      const elapsed = Date.now() - startedAt
      const { violations, recorded } = check(fixture.kind, answer, fixture)

      if (violations.length === 0) {
        console.log(`  ok    ${fixture.name}  ${fixture.kind}  ${elapsed}ms`)
      } else {
        failures += 1
        console.log(`  FAIL  ${fixture.name}  ${fixture.kind}  ${elapsed}ms`)
        for (const violation of violations) {
          console.log(
            `          [${violation.rule}] #${violation.index} ${violation.detail}`,
          )
        }
        // Printed in full on failure, because the useful next step is reading
        // what it actually wrote.
        console.log(
          `        ${JSON.stringify(answer, null, 2).replace(/\n/g, '\n        ')}`,
        )
      }

      if (RECORD) {
        // Only clean answers are recorded. Checking in a failing response
        // would make CI red forever and teach someone to delete the fixture.
        if (violations.length > 0) {
          console.log(`        not recorded — it failed`)
        } else {
          writeFileSync(
            join(ROOT, 'responses', `${fixture.name}.recorded.json`),
            JSON.stringify(
              {
                fixture: fixture.name,
                kind: fixture.kind,
                source: 'recorded',
                model,
                promptVersion: SURFACES[fixture.kind].version,
                ...recorded,
              },
              null,
              2,
            ) + '\n',
          )
          console.log(`        recorded`)
        }
      }
    } catch (error) {
      failures += 1
      console.log(
        `  ERROR ${fixture.name}  ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  console.log(
    `\n${fixtures.length - failures}/${fixtures.length} fixtures satisfied the contract`,
  )
  // Exits non-zero so it can be wired into something later, but nothing in CI
  // calls it today and nothing should.
  process.exit(failures > 0 ? 1 : 0)
}

// Only when invoked directly, matching import_hevy.ts — so a future importer
// of these helpers does not fire a paid run by importing the module.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  void main()
}
