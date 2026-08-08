/**
 * Coach's Notes — 3-5 prioritised observations about the caller's training.
 *
 * The division of labour, from plan §2C: `coach_stats()` computes every
 * number in SQL, and the model is asked only to decide what matters and say it
 * in a sentence. It is never asked to add, compare, or work out what a plateau
 * is — those answers are already in the block it is handed.
 *
 * Generation is lazy. The Progress screen calls this on open; if the cached
 * notes were written against the user's newest workout, the cache is returned
 * and no model is called. That is what keeps this affordable at a thousand
 * users: cost scales with *training*, not with app opens.
 */

import {
  authenticate,
  assertWithinQuota,
  quotaRemaining,
  CORS_HEADERS,
  HttpError,
  json,
  recordGeneration,
} from '../_shared/context.ts'
import { chat, ModelError } from '../_shared/openrouter.ts'
import { hasTrainingData } from '../_shared/has-training-data.ts'
import { parseJsonObject } from '../_shared/parse-json-object.ts'
import { partitionGrounded } from '../_shared/grounding.ts'

/**
 * Bump when SYSTEM or SCHEMA changes.
 *
 * `coach_notes.model` was stored because "the notes got worse" is otherwise
 * unanswerable — but the prompt changes far more often than the model does,
 * so the model alone could never answer it (audit §3-A4). Stored on both the
 * cache and the ledger.
 */
const PROMPT_VERSION = 'coach-notes@2'

/**
 * Static, and identical for every user on every call — which is the point.
 * Providers cache a prompt prefix; a system block that never varies is the
 * cheapest token in the request. Everything user-specific is in the second
 * message.
 */
const SYSTEM = `You write short training notes for a strength-training app called Wazn.

You are given a block of statistics that has ALREADY been computed. Never
recompute, re-add, or second-guess a number in it. Never invent a number that
is not in it.

Write 3 to 5 observations, most important first. Each has three parts:

- "title": a headline of at most 8 words.
- "body": 1 to 2 sentences saying what to do about it.
- "chip": the exact figures the observation came from, as a terse fragment —
  for example "chest 22 sets · back 9 · last 4 wk" or "e1RM 156 -> 156 lb" or
  "quads 6 sets · target 10-20". Copy the numbers from the block verbatim.
  Never write a number in the chip that is not in the block. No sentence, no
  verb, under 40 characters.

Rules:

- Ground every observation in a specific number or exercise name from the block.
- A productive weekly range for a muscle group is 10 to 20 working sets. Say so
  when a group is outside it.
- best_e1rm_28d against best_e1rm_before tells you whether a lift is moving. If
  best_e1rm_28d is null the lift has not been trained in four weeks.
- Prefer what to do next over what happened. "Your back has 4 sets this week,
  under the 10 to 20 range" beats "you did some back work".
- Plain language. No emoji, no exclamation marks, no motivational filler, no
  greeting, no sign-off.
- Never give medical, injury, diet or supplement advice. If the data suggests
  pain or injury, say nothing about it.
- If the block is nearly empty, say that plainly and suggest logging a few
  sessions rather than inventing an analysis.

Output ONLY the JSON object. Do not explain your reasoning, do not think out
loud, do not write anything before or after the JSON.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['insights'],
  properties: {
    insights: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'body', 'chip'],
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          chip: { type: 'string' },
        },
      },
    },
  },
}

interface Insight {
  title: string
  body: string
  /**
   * The figures the observation came from, verbatim from the stat block.
   *
   * Design v2.1 calls this "what makes the AI feel like it read the log", and
   * it is also the cheapest honesty check the feature has: a chip that does
   * not match the charts is a claim the reader can catch without trusting
   * anything. Optional in the type because a model may omit it and one
   * missing chip should not throw away four good notes.
   */
  chip?: string
}

/** Trust nothing a model returns. Shape, types and length are all checked. */
function parseInsights(raw: string): Insight[] {
  // Recovery from fenced blocks and reasoning preambles lives in one shared
  // module, because the routine generator needs exactly the same thing and
  // shipped without it — see `_shared/parse-json-object.ts`.
  const parsed = parseJsonObject(raw)
  if (!parsed) throw new HttpError('The notes came back unreadable.', 502, 'parse')

  const list = (parsed as { insights?: unknown }).insights
  if (!Array.isArray(list) || list.length === 0) {
    throw new HttpError('The notes came back empty.', 502, 'empty')
  }

  const insights: Insight[] = []
  for (const item of list.slice(0, 5)) {
    const title = (item as Insight)?.title
    const body = (item as Insight)?.body
    const chip = (item as Insight)?.chip
    if (typeof title !== 'string' || typeof body !== 'string') continue
    if (!title.trim() || !body.trim()) continue
    insights.push({
      title: title.trim().slice(0, 80),
      body: body.trim().slice(0, 400),
      // A missing chip drops the chip, not the note.
      ...(typeof chip === 'string' && chip.trim()
        ? { chip: chip.trim().slice(0, 60) }
        : {}),
    })
  }
  if (insights.length === 0) {
    throw new HttpError('The notes came back empty.', 502, 'empty')
  }
  return insights
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const caller = await authenticate(request)
    const force = new URL(request.url).searchParams.get('force') === '1'

    // What the notes would be written against: the caller's most recent
    // finished workout. Under RLS, so it is theirs by construction.
    const { data: latest } = await caller.asUser
      .from('workouts')
      .select('started_at')
      .not('ended_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const basis = (latest?.started_at as string | undefined) ?? null

    const { data: cached } = await caller.asUser
      .from('coach_notes')
      .select('*')
      .maybeSingle()

    // The lazy rule, in one line: if the cache was written against the same
    // newest workout, nothing has happened since and the model has nothing new
    // to say. No model call, no cost.
    if (cached && !force && cached.basis_workout_at === basis) {
      return json({
        insights: cached.insights,
        generatedAt: cached.generated_at,
        model: cached.model,
        cached: true,
        regeneratesLeft: await quotaRemaining(caller, 'coach_notes'),
      })
    }

    // Read the stats before the quota is touched, because whether there is
    // anything to say decides whether this costs anything at all.
    //
    // Runs under the caller's JWT. It takes no user id — it cannot be pointed
    // at anyone else.
    const { data: stats, error: statsError } = await caller.asUser.rpc('coach_stats')
    if (statsError) throw new HttpError('Could not read your training data.', 500)

    // A brand-new account has nothing to analyse, and asking a model to say so
    // costs a call, a wait, and — worst of all — the caller's one regenerate
    // for the week. Two real users hit exactly that on 2026-08-05: both opened
    // Coach before logging anything, both got a model-written "no training
    // data" note, and both were then locked out of regenerating for seven days
    // *including after they started training*, which is precisely when the
    // feature becomes worth using.
    //
    // An empty `insights` array is already the client's designed empty state
    // ("Log 3 workouts and the coach will have something to say"), so this
    // returns better copy than the model produced, instantly and for free.
    // §2C's rule, applied: if statistics can answer it, statistics answer it.
    if (!hasTrainingData(stats)) {
      return json({
        insights: [],
        generatedAt: new Date().toISOString(),
        model: 'none',
        cached: false,
        regeneratesLeft: await quotaRemaining(caller, 'coach_notes'),
      })
    }

    await assertWithinQuota(caller, 'coach_notes')

    const startedAt = Date.now()
    let insights: Insight[]
    let result: Awaited<ReturnType<typeof chat>>

    try {
      // ── The grounding gate ────────────────────────────────────────────────
      // §12 sets the tolerance for a fabricated figure at zero. Up to now the
      // check was a human reading a chip; `_shared/grounding.ts` makes it a
      // guard, and this is where it runs. One retry, because a model that
      // invented a number once will usually not do it twice when told which
      // number it invented — and after that the offending note is dropped
      // rather than the whole set, so one bad figure costs one observation.
      let attempt = 0
      let extraInstruction = ''
      for (;;) {
        result = await chat({
          freeModel: Deno.env.get('COACH_MODEL_FREE'),
          paidModel: Deno.env.get('COACH_MODEL') ?? 'moonshotai/kimi-k2.5',
          system: SYSTEM,
          user: JSON.stringify(stats) + extraInstruction,
          jsonSchema: SCHEMA,
        })

        const parsed = parseInsights(result.content)
        const { kept, dropped } = partitionGrounded(parsed, stats)

        if (dropped.length === 0) {
          insights = kept
          break
        }

        const figures = dropped.flatMap((d) => d.ungrounded)
        console.warn('ungrounded figures', {
          attempt,
          figures,
          model: result.model,
          promptVersion: PROMPT_VERSION,
        })

        if (attempt === 0) {
          attempt = 1
          extraInstruction =
            `\n\nYour previous answer contained figures that are not in this block: ` +
            `${figures.join(', ')}. Every number you write must appear above. ` +
            `Write the observations again using only numbers from the block.`
          continue
        }

        // Second attempt still ungrounded. Keep what was clean; if nothing
        // was, that is a failed generation and it says so rather than
        // returning prose nobody can check.
        if (kept.length === 0) {
          throw new HttpError(
            'The notes came back with figures that do not match your log, so they were not saved. Try again in a moment.',
            502,
            'ungrounded',
          )
        }
        insights = kept
        break
      }
    } catch (error) {
      // Every attempt is recorded now, not only the ones that worked — that
      // is what makes the fallback rate, the parse-failure rate and p95
      // latency computable at all (audit §3-A3). Quota counts `ok` rows only,
      // so a failure here does not spend the caller's week.
      await recordGeneration(caller, 'coach_notes', {
        ok: false,
        errorCode:
          error instanceof ModelError
            ? error.code
            : error instanceof HttpError
              ? (error.code ?? 'http')
              : 'unknown',
        latencyMs: Date.now() - startedAt,
        promptVersion: PROMPT_VERSION,
      })
      throw error
    }

    // Service role: `coach_notes` has no client-writable policy, so the only
    // text that can appear under the "AI-generated" label is text that came
    // through here.
    //
    // The retry without `prompt_version` exists because merging to main
    // deploys these functions (deploy-functions.yml) while migrations are
    // applied by hand, so for some window this code is live against a schema
    // that predates 0017. PostgREST answers 42703 for an unknown column and
    // supabase-js returns it rather than throwing — which would have made the
    // cache silently stop working, and a cache that silently stops working
    // means every Coach open calls the model again.
    //
    // Delete this fallback once 0017 is applied. It is a deploy-ordering
    // shim, not a design.
    const cacheRow = {
      user_id: caller.userId,
      generated_at: new Date().toISOString(),
      basis_workout_at: basis,
      model: result.model,
      insights,
    }
    const { error: cacheError } = await caller.asService
      .from('coach_notes')
      .upsert({ ...cacheRow, prompt_version: PROMPT_VERSION })
    if (cacheError?.code === '42703') {
      console.warn('coach_notes is missing prompt_version — apply migration 0017')
      await caller.asService.from('coach_notes').upsert(cacheRow)
    } else if (cacheError) {
      console.error('coach_notes upsert failed', cacheError)
    }
    await recordGeneration(caller, 'coach_notes', {
      ok: true,
      model: result.model,
      usedFree: result.usedFree,
      latencyMs: Date.now() - startedAt,
      finishReason: result.finishReason,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      promptVersion: PROMPT_VERSION,
    })

    return json({
      insights,
      generatedAt: new Date().toISOString(),
      model: result.model,
      cached: false,
      regeneratesLeft: await quotaRemaining(caller, 'coach_notes'),
    })
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status)
    if (error instanceof ModelError) {
      // An open breaker is not an error the user should read as a fault. The
      // surface renders its deterministic skeleton — this is what "the app
      // must be fully usable with AI dark" means in code rather than prose.
      if (error.code === 'breaker_open') {
        return json({ error: error.message, degraded: true }, 503)
      }
      return json({ error: error.message }, error.status)
    }
    console.error('coach-notes', error)
    return json({ error: 'Could not write your notes right now.' }, 500)
  }
})
