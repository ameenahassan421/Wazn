/**
 * The proactive coach's two one-line surfaces — B1, offense plan §4-A1/A2.
 *
 *   POST /coach-brief  { "surface": "briefing" }
 *   POST /coach-brief  { "surface": "debrief", "workoutId": "<uuid>" }
 *
 * ── WHAT THIS FUNCTION IS FOR, AND WHAT IT IS NOT FOR ───────────────────────
 * It phrases. That is all. Every figure on both surfaces comes from
 * `session_brief()` / `session_debrief()` in migration 0021, and **the client
 * calls those itself** — it renders a deterministic skeleton from the SQL
 * before this function has answered, and keeps that skeleton if this function
 * never answers at all.
 *
 * So the sentence is an upgrade to a card that already works, never the card
 * itself. That is what "if AI is dark, render the deterministic skeleton or
 * nothing — never an error in the flow" means in code rather than in prose,
 * and it is why this function returning 503 is not a user-visible failure.
 *
 * ── WHY IT RECOMPUTES THE BLOCK ─────────────────────────────────────────────
 * The client has the figures already and does not send them. It cannot: a
 * request body carrying numbers is a request body that can carry any numbers,
 * and the grounding gate would then be checking the model against whatever the
 * browser claimed. The block is recomputed here, under the caller's JWT, from
 * the same function. One extra cheap query buys "the model is checked against
 * the database" rather than "against the client".
 *
 * ── THE CORE-LOOP RULE ──────────────────────────────────────────────────────
 * Neither surface exists during a workout. §4-A1 is explicit — "the moment a
 * workout starts, the coach disappears until Finish" — and that is enforced in
 * the client, where the screen state lives. Nothing here can enforce it, which
 * is worth saying out loud so nobody assumes it does.
 */

import {
  authenticate,
  assertWithinQuota,
  CORS_HEADERS,
  HttpError,
  isMissingSchema,
  json,
  recordGeneration,
} from '../_shared/context.ts'
import { chat, ModelError } from '../_shared/openrouter.ts'
import { parseJsonObject } from '../_shared/parse-json-object.ts'
import { checkBriefContract } from '../_shared/brief-contract.ts'
import { exerciseCatalog } from '../_shared/catalog.ts'
import { parseUnit, toDisplayBlock } from '../_shared/display-units.ts'

/** Bump when SYSTEM, SCHEMA or either surface's instruction block changes. */
const PROMPT_VERSION = 'coach-brief@1'

type Surface = 'briefing' | 'debrief'

/**
 * Static and identical on every call, so the provider caches the prefix.
 * Everything user-specific is in the second message.
 *
 * The register is set here rather than per surface because it is the same
 * voice at both moments — the plan calls it "terse gym partner", which mostly
 * means: no greeting, no praise, no exclamation, and never more than the
 * lifter asked for.
 */
const SYSTEM = `You write one short line for a strength-training app called Wazn.

You are given a block of statistics that has ALREADY been computed. Never
recompute, re-add, or second-guess a number in it. Never write a number that is
not in it. Never name an exercise that is not in it.

Write:

- "line": at most 2 sentences. Under 200 characters. Say the one thing that
  matters most in this block, and if a second thing genuinely earns its place,
  say it in the second sentence. Not three things.
- "chip": the exact figures the line came from, as a terse fragment — for
  example "60 kg x 8 -> 62.5 kg x 8" or "3rd straight - +5 kg e1RM - 28 d" or
  "calves 4 sets - target 10-20". Copy the numbers from the block verbatim. No
  sentence, no verb, under 44 characters.

Weights are in the block's "unit" field, which is "kg" or "lbs". Write that unit
and no other. Never convert a figure: the block is already in the unit the
reader has chosen.

Voice: a training partner who has read your log and is not impressed by you.
Plain language. No greeting, no sign-off, no emoji, no exclamation marks, no
motivational filler, no "let's", no praise that is not a fact.

Never give medical, injury, diet or supplement advice. If the data suggests
pain or injury, say nothing about it.

Output ONLY the JSON object. Do not explain your reasoning, do not think out
loud, do not write anything before or after the JSON.`

/**
 * Per-surface instruction, appended to the block.
 *
 * Kept short and concrete. Every rule here is one the deterministic layer has
 * already answered — the model is being told which of the answers it was
 * handed to lead with, not asked to work anything out.
 */
const INSTRUCTIONS: Record<Surface, string> = {
  briefing: `

This is the line shown before the workout starts, above the Start button.

Lead with the target if there is one: name the lift, what they did last time,
and the "next_weight_kg" x "last_reps" that beats their best estimate. Mention
the routine that is due by name if "due_routine" is present. Mention the layoff
ONLY if "days_since_last" is more than 5. Mention a muscle group from
"low_bands" only if there is no target to lead with.

Do not tell them to start. They are holding the Start button.`,
  debrief: `

This is the line shown on the summary screen immediately after they finish.

Say what this session MEANT, not what it contained — they can see the sets, the
volume and the duration on the same screen, so repeating those is wasted. The
things worth saying, in order: a "progression_streak" of 2 or more, a
"gain_since_last_e1rm" above zero, or movement between "e1rm_before_28d" and
"e1rm_28d". If "low_band" is present and the session gave you nothing else to
say, one forward cue about it is allowed as the second sentence.

If the session beat nothing and there is nothing forward to say, say that
plainly in one short sentence. Do not manufacture significance.`,
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['line'],
  properties: {
    line: { type: 'string' },
    chip: { type: 'string' },
  },
}

interface BriefResult {
  line: string
  chip?: string
}

function parseBrief(raw: string): BriefResult {
  const parsed = parseJsonObject(raw)
  if (!parsed) throw new HttpError('The coach came back unreadable.', 502, 'parse')

  const line = (parsed as BriefResult).line
  const chip = (parsed as BriefResult).chip
  if (typeof line !== 'string' || !line.trim()) {
    throw new HttpError('The coach came back empty.', 502, 'empty')
  }
  return {
    line: line.trim().slice(0, 200),
    // A missing or over-long chip drops the chip, not the line.
    ...(typeof chip === 'string' && chip.trim()
      ? { chip: chip.trim().slice(0, 44) }
      : {}),
  }
}

/**
 * Is there enough here to be worth a model call?
 *
 * The briefing needs either a target or a routine — without both it would be
 * phrasing "you have trained 0 times", which the client's own empty state says
 * better, instantly and for free. The debrief needs the workout to exist and
 * to have had a working set in it.
 *
 * This is the `hasTrainingData` lesson generalised: two real users spent their
 * weekly quota on a model-written "you have no data" on 2026-08-05. The fix is
 * not to call the model when there is nothing to say.
 */
function worthSaying(surface: Surface, block: Record<string, unknown>): boolean {
  if (surface === 'debrief') {
    return block.found === true && Number(block.sets ?? 0) > 0
  }
  return block.target !== null || block.due_routine !== null
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const caller = await authenticate(request)
    const body = (await request.json().catch(() => ({}))) as {
      surface?: string
      workoutId?: string
      unit?: string
    }

    // A display preference, not data. The client owns the lb/kg toggle, so it
    // is the only thing that can say which one is on screen — and the worst a
    // forged value can do is write the caller their own line in the other unit.
    const unit = parseUnit(body.unit)

    const surface: Surface = body.surface === 'debrief' ? 'debrief' : 'briefing'
    if (surface === 'debrief' && !body.workoutId) {
      throw new HttpError('A debrief needs a workout.', 400, 'no_workout')
    }

    // The block. Under the caller's JWT, so RLS scopes it — and for the
    // debrief, a workout id that is not theirs comes back as `found: false`
    // rather than as anyone else's session.
    const { data: block, error: blockError } =
      surface === 'debrief'
        ? await caller.asUser.rpc('session_debrief', { p_workout: body.workoutId })
        : await caller.asUser.rpc('session_brief')

    // Deploy ordering: merging deploys this function, and 0021 is applied by
    // hand, so for some window these RPCs do not exist. The client is already
    // drawing its own skeleton from the same functions — which will be failing
    // too, so it is drawing nothing — and the correct answer here is silence,
    // not an error. Delete this branch once 0021 is applied.
    if (isMissingSchema(blockError)) {
      console.warn('session_brief/session_debrief missing — apply migration 0021')
      return json({ surface, line: null, cached: false, model: 'none', degraded: true })
    }
    if (blockError)
      throw new HttpError('Could not read your training data.', 500, 'sql')

    // Converted BEFORE the prompt is built, so the model is handed the same
    // unit the app is showing and grounding checks against what it was handed.
    // See `_shared/display-units.ts` for why this is not done in SQL.
    const facts = (toDisplayBlock(block ?? {}, unit) ?? {}) as Record<string, unknown>

    // The cache key. The briefing goes stale when a new workout lands, which
    // is what `days_since_last` moving means; the debrief is about exactly one
    // session and can never go stale, so its own id is the key.
    const basis =
      surface === 'debrief'
        ? (body.workoutId ?? null)
        : JSON.stringify([facts.days_since_last ?? null, facts.sessions_last_28 ?? 0])

    // The unit is part of the cache key. Without it, toggling to pounds would
    // serve back the kilogram sentence — the exact bug this whole conversion
    // exists to fix, reintroduced by the cache.
    const cacheKey = `${unit}:${basis}`

    const { data: cached } = await caller.asUser
      .from('coach_briefs')
      .select('*')
      .eq('surface', surface)
      .maybeSingle()

    if (
      cached &&
      cached.basis === cacheKey &&
      cached.prompt_version === PROMPT_VERSION &&
      cached.line
    ) {
      return json({
        surface,
        line: cached.line,
        chip: cached.chip ?? undefined,
        generatedAt: cached.generated_at,
        model: cached.model,
        cached: true,
      })
    }

    if (!worthSaying(surface, facts)) {
      // 200 with no line. The client keeps its deterministic skeleton, which
      // is the right thing on screen — and no quota was spent to learn that.
      return json({ surface, line: null, cached: false, model: 'none' })
    }

    await assertWithinQuota(caller, surface)

    const startedAt = Date.now()
    let brief: BriefResult
    let result: Awaited<ReturnType<typeof chat>>

    try {
      const catalog = await exerciseCatalog(caller)
      let attempt = 0
      let extra = ''

      for (;;) {
        result = await chat({
          freeModel: Deno.env.get('BRIEF_MODEL_FREE'),
          paidModel: Deno.env.get('BRIEF_MODEL') ?? 'moonshotai/kimi-k2.5',
          system: SYSTEM,
          user: JSON.stringify(facts) + INSTRUCTIONS[surface] + extra,
          jsonSchema: SCHEMA,
          // One short line. A low ceiling is a cost control AND a style
          // control: a model that cannot write four sentences does not.
          maxTokens: 400,
        })

        const parsed = parseBrief(result.content)
        const violations = checkBriefContract(parsed, facts, { catalog })

        if (violations.length === 0) {
          brief = parsed
          break
        }

        console.warn('brief contract violations', {
          surface,
          attempt,
          violations,
          model: result.model,
          promptVersion: PROMPT_VERSION,
        })

        if (attempt === 0) {
          attempt = 1
          extra =
            `\n\nYour previous answer broke these rules: ` +
            `${violations.map((v) => `${v.rule} (${v.detail})`).join('; ')}. ` +
            `Write the line again, using only numbers and exercise names from ` +
            `the block above.`
          continue
        }

        // Twice is enough. There is a good card on screen already, so the
        // honest outcome is no sentence rather than a doubtful one — this is
        // the one place where the deterministic skeleton being good enough
        // lets the AI layer simply decline.
        throw new HttpError(
          'The coach could not write that one.',
          502,
          violations[0].rule,
        )
      }
    } catch (error) {
      await recordGeneration(caller, surface, {
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

    const generatedAt = new Date().toISOString()

    // Service role: `coach_briefs` has no client-writable policy, so the only
    // text that can appear under the "AI-generated" label is text that came
    // through here.
    const { error: cacheError } = await caller.asService.from('coach_briefs').upsert({
      user_id: caller.userId,
      surface,
      generated_at: generatedAt,
      basis: cacheKey,
      model: result.model,
      prompt_version: PROMPT_VERSION,
      line: brief.line,
      chip: brief.chip ?? null,
    })
    if (cacheError) console.error('coach_briefs upsert failed', cacheError)

    await recordGeneration(caller, surface, {
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
      surface,
      line: brief.line,
      chip: brief.chip,
      generatedAt,
      model: result.model,
      cached: false,
    })
  } catch (error) {
    // Every failure below is one the client answers by keeping the skeleton it
    // already drew. `degraded` says so explicitly, so the client never has to
    // guess from a status code whether a card is broken or merely quiet.
    if (error instanceof HttpError) {
      return json({ error: error.message, degraded: true }, error.status)
    }
    if (error instanceof ModelError) {
      return json({ error: error.message, degraded: true }, error.status)
    }
    console.error('coach-brief', error)
    return json({ error: 'The coach is quiet right now.', degraded: true }, 500)
  }
})
