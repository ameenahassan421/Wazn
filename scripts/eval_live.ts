/**
 * Eval tier 3 — the same assertions, against the real model.
 *
 *     npm run eval:live              # check, print a report, change nothing
 *     npm run eval:live -- --record  # also rewrite evals/responses/*.recorded.json
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
 *   data: the stat blocks are the fixtures in `evals/fixtures/`, which is what
 *   makes it safe to run and to paste the output of.
 *
 * WEEKLY, DURING BETA. The plan asks for a spot-check of real outputs; this is
 * that spot-check with the judgement taken out of it.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { config } from 'dotenv'
import { checkNoteContract } from '../supabase/functions/_shared/note-contract'

config()

const ROOT = join(import.meta.dirname, '..', 'evals')
const RECORD = process.argv.includes('--record')

// Kept in step with the Edge Function by hand, and that is a real seam: a
// prompt edited there and not here means this tier grades yesterday's prompt.
// PROMPT_VERSION is what makes the drift visible rather than silent.
const PROMPT_VERSION = 'coach-notes@2'
const SYSTEM = readFileSync(
  join(import.meta.dirname, '..', 'supabase', 'functions', 'coach-notes', 'index.ts'),
  'utf8',
)
  .split('const SYSTEM = `')[1]
  ?.split('`')[0]

interface Fixture {
  name: string
  block: Record<string, unknown>
}

interface Insight {
  title: string
  body: string
  chip?: string
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

async function askModel(
  block: unknown,
): Promise<{ insights: Insight[]; model: string }> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) fail('OPENROUTER_API_KEY is not set. Put it in .env or the environment.')

  const model = process.env.COACH_MODEL_FREE ?? 'nvidia/nemotron-3-super-120b-a12b:free'
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
      max_tokens: 2400,
      temperature: 0.4,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: JSON.stringify(block) },
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
  const parsed = JSON.parse(content.slice(start, end + 1)) as { insights?: Insight[] }
  if (!Array.isArray(parsed.insights)) throw new Error('no insights array')
  return { insights: parsed.insights, model }
}

async function main(): Promise<void> {
  if (!SYSTEM) fail('could not read the SYSTEM prompt out of coach-notes/index.ts')

  const fixtures = readdirSync(join(ROOT, 'fixtures'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(ROOT, 'fixtures', f), 'utf8')) as Fixture)

  console.log(`eval:live — ${fixtures.length} fixtures, prompt ${PROMPT_VERSION}\n`)

  let failures = 0

  for (const fixture of fixtures) {
    const startedAt = Date.now()
    try {
      const { insights, model } = await askModel(fixture.block)
      const elapsed = Date.now() - startedAt
      const violations = checkNoteContract(insights, fixture.block)

      if (violations.length === 0) {
        console.log(`  ok    ${fixture.name}  ${insights.length} notes  ${elapsed}ms`)
      } else {
        failures += 1
        console.log(`  FAIL  ${fixture.name}  ${elapsed}ms`)
        for (const violation of violations) {
          console.log(
            `          [${violation.rule}] #${violation.index} ${violation.detail}`,
          )
        }
        // Printed in full on failure, because the useful next step is reading
        // what it actually wrote.
        console.log(
          `        ${JSON.stringify(insights, null, 2).replace(/\n/g, '\n        ')}`,
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
                source: 'recorded',
                model,
                promptVersion: PROMPT_VERSION,
                insights,
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
