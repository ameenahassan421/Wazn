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
  CORS_HEADERS,
  HttpError,
  json,
  recordGeneration,
} from '../_shared/context.ts'
import { chat, ModelError } from '../_shared/openrouter.ts'

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

Write 3 to 5 observations, most important first. Each has a short title (at
most 6 words) and a body of 1 to 2 sentences. Rules:

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

Return JSON only.`

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
        required: ['title', 'body'],
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
        },
      },
    },
  },
}

interface Insight {
  title: string
  body: string
}

/** Trust nothing a model returns. Shape, types and length are all checked. */
function parseInsights(raw: string): Insight[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Some models wrap JSON in a fenced block despite being asked not to.
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (!fenced) throw new HttpError('The notes came back unreadable.', 502)
    parsed = JSON.parse(fenced[1])
  }

  const list = (parsed as { insights?: unknown }).insights
  if (!Array.isArray(list) || list.length === 0) {
    throw new HttpError('The notes came back empty.', 502)
  }

  const insights: Insight[] = []
  for (const item of list.slice(0, 5)) {
    const title = (item as Insight)?.title
    const body = (item as Insight)?.body
    if (typeof title !== 'string' || typeof body !== 'string') continue
    if (!title.trim() || !body.trim()) continue
    insights.push({ title: title.trim().slice(0, 80), body: body.trim().slice(0, 400) })
  }
  if (insights.length === 0) {
    throw new HttpError('The notes came back empty.', 502)
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
      })
    }

    await assertWithinQuota(caller, 'coach_notes')

    // Runs under the caller's JWT. It takes no user id — it cannot be pointed
    // at anyone else.
    const { data: stats, error: statsError } = await caller.asUser.rpc('coach_stats')
    if (statsError) throw new HttpError('Could not read your training data.', 500)

    const result = await chat({
      freeModel: Deno.env.get('COACH_MODEL_FREE'),
      paidModel: Deno.env.get('COACH_MODEL') ?? 'moonshotai/kimi-k2.5',
      system: SYSTEM,
      user: JSON.stringify(stats),
      jsonSchema: SCHEMA,
    })

    const insights = parseInsights(result.content)

    // Service role: `coach_notes` has no client-writable policy, so the only
    // text that can appear under the "AI-generated" label is text that came
    // through here.
    await caller.asService.from('coach_notes').upsert({
      user_id: caller.userId,
      generated_at: new Date().toISOString(),
      basis_workout_at: basis,
      model: result.model,
      insights,
    })
    await recordGeneration(caller, 'coach_notes', result.model, result.usedFree)

    return json({
      insights,
      generatedAt: new Date().toISOString(),
      model: result.model,
      cached: false,
    })
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status)
    if (error instanceof ModelError) return json({ error: error.message }, error.status)
    console.error('coach-notes', error)
    return json({ error: 'Could not write your notes right now.' }, 500)
  }
})
