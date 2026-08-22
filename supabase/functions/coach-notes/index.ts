/**
 * The weekly review — B2, offense plan §3-A3.
 *
 * ── WHAT CHANGED, AND WHY ───────────────────────────────────────────────────
 * This function used to write "3 to 5 observations, most important first".
 * That is a good answer to "what does my training look like" and a bad answer
 * to "what am I reading": the sections moved every week, so there was nothing
 * to learn to read, and two consecutive reviews could not be compared because
 * they were not about the same things.
 *
 * It now writes a **review contract**: the same five sections, in the same
 * order, every week — adherence, bands, plateaus, wins, and exactly one
 * "next week, change this". A lifter who reads it twice knows where to look
 * the third time, which is the entire point of a fixed shape and the reason
 * §3-A3 asks for one.
 *
 * ── THE DIVISION OF LABOUR IS UNCHANGED ─────────────────────────────────────
 * `weekly_review()` (migration 0021) computes every figure, including WHICH
 * recommendation is made — "exactly one recommendation" is a promise about the
 * product, and a promise a model keeps only when asked nicely is not a
 * promise. The model chooses no facts. It writes five sentences about facts it
 * was handed, and `checkReviewContract` refuses the answer if it strays.
 *
 * Generation is still lazy, still cached against the newest workout, and still
 * capped at one regenerate a week. None of that changed, because none of it
 * was wrong.
 */

import {
  authenticate,
  assertWithinQuota,
  quotaRemaining,
  CORS_HEADERS,
  HttpError,
  isMissingSchema,
  json,
  recordGeneration,
} from '../_shared/context.ts'
import { chat, ModelError } from '../_shared/openrouter.ts'
import { hasTrainingData } from '../_shared/has-training-data.ts'
import { parseJsonObject } from '../_shared/parse-json-object.ts'
import { exerciseCatalog } from '../_shared/catalog.ts'
import { parseUnit, toDisplayBlock } from '../_shared/display-units.ts'
import {
  SECTIONS,
  checkReviewBlock,
  checkReviewContract,
  type ContractViolation,
  type SectionKey,
  type WeeklyReview,
} from '../_shared/review-contract.ts'

/**
 * Bump when SYSTEM or SCHEMA changes.
 *
 * Renamed from `coach-notes@2`, and the rename is load-bearing: it is what
 * makes every cached row from the old shape a miss, so the first Coach open
 * after this deploys regenerates into the new contract instead of rendering
 * last week's list forever.
 *
 * ── @1 to @2, 2026-08-22 ────────────────────────────────────────────────────
 * Migration 0030 changed what `weekly_review()` RETURNS: a workout with no
 * sets stopped counting as a session, and `weeks_trained_of_8` stopped being
 * able to exceed 8. The cache key includes this constant precisely so that a
 * change of that kind can invalidate every stored review, and 0030 did not
 * turn it. The result was a Progress screen showing the figure "8 sessions
 * this week" directly above a cached sentence reading "You completed 10
 * sessions ... trained in 9 of the last 8 weeks".
 *
 * **A bump is only safe because of the fallback added in the same commit.**
 * On its own it forces a miss, a miss forces a model call, and a model call
 * that fails used to rethrow: a bump alone would have replaced a stale but
 * readable review with a permanent error card. Serving the cached review on
 * generation failure is what makes an invalidation survive a model outage,
 * and the two must stay together. Do not bump this again without checking
 * that the catch block below still falls back.
 */
const PROMPT_VERSION = 'coach-review@2'

const SYSTEM = `You write the weekly training review for a strength-training app called Wazn.

You are given a block of statistics that has ALREADY been computed. Never
recompute, re-add, or second-guess a number in it. Never write a number that is
not in it. Never name an exercise that is not in it.

The review has the SAME five sections every week, in this order. Write all five,
every time, even when a section's answer is "nothing":

1. "adherence" — did they turn up. Use sessions_this_week against
   avg_sessions_per_week_8w, weeks_trained_of_8, and longest_gap_days_28.
2. "bands" — working sets per muscle group against the productive range of 10
   to 20. Name the groups that are outside it. If everything is inside, say so.
3. "plateaus" — lifts whose estimated 1RM has stopped moving, from "plateaus".
   Each entry already satisfies the threshold; you do not decide what a plateau
   is. If the list is empty, say nothing has stalled.
4. "wins" — lifts whose estimated 1RM is up, from "wins". If the list is empty,
   say so plainly rather than reaching for something else.
5. "recommendation" — ONE change for next week, and it must be the one in
   "recommendation" in the block. Say it as a single instruction. Never a list,
   never two options, never "you could also".

Each section has:

- "line": 1 to 2 sentences. Under 320 characters.
- "chip": the exact figures it came from, as a terse fragment — for example
  "3 sessions - avg 3.5/wk" or "calves 4 - target 10-20" or "6 sessions - 0.0
  per session". Copy the numbers from the block verbatim. No sentence, no verb,
  under 60 characters.

Weights are in the block's "unit" field, which is "kg" or "lbs". Write that unit
and no other. Never convert a figure: the block is already in the unit the
reader has chosen.

Also write "headline": at most 8 words summing up the week.

Rules:

- Ground every sentence in a specific number or exercise name from the block.
- Prefer what to do next over what happened.
- Plain language. No emoji, no exclamation marks, no motivational filler, no
  greeting, no sign-off.
- Never give medical, injury, diet or supplement advice. If the data suggests
  pain or injury, say nothing about it.
- If the block is nearly empty, say that plainly in every section rather than
  inventing an analysis.

Output ONLY the JSON object. Do not explain your reasoning, do not think out
loud, do not write anything before or after the JSON.`

const SECTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['line', 'chip'],
  properties: {
    line: { type: 'string' },
    chip: { type: 'string' },
  },
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'sections'],
  properties: {
    headline: { type: 'string' },
    sections: {
      type: 'object',
      additionalProperties: false,
      required: [...SECTIONS],
      properties: Object.fromEntries(SECTIONS.map((key) => [key, SECTION_SCHEMA])),
    },
  },
}

/** Trust nothing a model returns. Shape, types and length are all checked. */
function parseReview(raw: string): WeeklyReview {
  const parsed = parseJsonObject(raw)
  if (!parsed) throw new HttpError('The review came back unreadable.', 502, 'parse')

  const record = parsed as { headline?: unknown; sections?: Record<string, unknown> }
  const headline = typeof record.headline === 'string' ? record.headline.trim() : ''
  const sections = {} as WeeklyReview['sections']

  for (const key of SECTIONS) {
    const raw = record.sections?.[key] as { line?: unknown; chip?: unknown } | undefined
    const line = typeof raw?.line === 'string' ? raw.line.trim() : ''
    const chip = typeof raw?.chip === 'string' ? raw.chip.trim() : ''
    sections[key as SectionKey] = {
      line: line.slice(0, 320),
      ...(chip ? { chip: chip.slice(0, 60) } : {}),
    }
  }

  if (!SECTIONS.some((key) => sections[key].line)) {
    throw new HttpError('The review came back empty.', 502, 'empty')
  }

  return { headline: headline.slice(0, 80), sections }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const caller = await authenticate(request)
    const url = new URL(request.url)
    const force = url.searchParams.get('force') === '1'
    // A display preference, not data — see `_shared/display-units.ts`. The
    // review quotes e1RM figures, and quoting them in kilograms to a lifter
    // whose every other screen is in pounds is the bug a screenshot caught on
    // the briefing card.
    const unit = parseUnit(url.searchParams.get('unit'))

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

    const cachedPayload = cached?.insights as unknown
    // Rows written before B2 hold an ARRAY of insights; rows written after
    // hold the review object. Both are valid things to have in the cache and
    // the client renders either, so the shape is sniffed rather than assumed.
    const cachedIsReview =
      !!cachedPayload &&
      !Array.isArray(cachedPayload) &&
      typeof cachedPayload === 'object'

    /*
     * `refreshFailed` is a SEPARATE flag from `stale`, and conflating them was
     * a real defect caught in review.
     *
     * `stale` has one meaning already and two call sites reading it: the
     * cached review is from an older CONTRACT, which `CoachScreen.tsx` renders
     * as the suffix " · in the previous format". Reusing it to mean
     * "generation failed, here is the last one" would print that sentence to
     * every web user during a model outage, when the format is fine and the
     * model is not.
     */
    const serveCached = (
      stale: boolean,
      regeneratesLeft: number,
      refreshFailed = false,
    ) =>
      json({
        review: cachedIsReview ? (cachedPayload as WeeklyReview) : null,
        insights: cachedIsReview ? null : (cachedPayload ?? []),
        generatedAt: cached?.generated_at,
        model: cached?.model,
        cached: true,
        // "Your review is from the previous format and you have no regenerate
        // left this week" is a real state, and it renders as a note rather
        // than as an error. See the quota branch below.
        stale,
        refreshFailed,
        regeneratesLeft,
      })

    const fresh =
      cached &&
      cached.basis_workout_at === basis &&
      cached.prompt_version === `${PROMPT_VERSION}:${unit}`

    if (fresh && !force) {
      return serveCached(false, await quotaRemaining(caller, 'coach_notes'))
    }

    const { data: raw, error: blockError } = await caller.asUser.rpc('weekly_review')

    // Deploy ordering: merging deploys this function, and 0021 is applied by
    // hand. In the window between the two, `weekly_review()` does not exist —
    // and the honest answer is the review they already have, not a 500 on the
    // Coach tab. Delete this branch once 0021 is applied.
    if (isMissingSchema(blockError)) {
      console.warn('weekly_review() is missing — apply migration 0021')
      if (cached) return serveCached(true, await quotaRemaining(caller, 'coach_notes'))
      return json(
        {
          review: null,
          insights: null,
          generatedAt: new Date().toISOString(),
          model: 'none',
          cached: false,
          degraded: true,
          regeneratesLeft: await quotaRemaining(caller, 'coach_notes'),
        },
        200,
      )
    }
    if (blockError)
      throw new HttpError('Could not read your training data.', 500, 'sql')

    // Converted before the prompt is built, so grounding checks the model
    // against the same unit the reader is looking at.
    const block = toDisplayBlock(raw, unit)

    // The block's own shape, checked but not enforced. A missing key degrades
    // one section into vagueness; refusing the whole review over it would turn
    // a small regression into an outage.
    const blockViolations = checkReviewBlock(block)
    if (blockViolations.length > 0) {
      console.warn('weekly_review block is off contract', blockViolations)
    }

    // An account with nothing in it gets the client's one-line empty state,
    // not a review.
    //
    // The first draft filled the contract here — five sections each saying
    // "nothing yet" — and a screenshot settled it: that is five paragraphs of
    // apology on a brand-new account. The fixed shape earns its keep for
    // someone who reads it every week and learns where to look, and a lifter
    // with no sessions is not that person yet. `review: null` with an empty
    // `insights` is the state the Coach tab has always rendered as "Log 3
    // workouts and the coach will have something to say."
    if (!hasTrainingData(block)) {
      return json({
        review: null,
        insights: [],
        generatedAt: new Date().toISOString(),
        model: 'none',
        cached: false,
        regeneratesLeft: await quotaRemaining(caller, 'coach_notes'),
      })
    }

    // ── The stale-cache escape hatch ─────────────────────────────────────────
    // Without this, bumping PROMPT_VERSION would hand a 429 to every user who
    // had already regenerated that week: their cache is a miss, and the quota
    // says no. They would see an error where a review used to be, on the day
    // of a deploy, through no action of their own. Serving the old one and
    // saying it is old is strictly better than that.
    const left = await quotaRemaining(caller, 'coach_notes')
    if (left <= 0 && cached && !force) {
      return serveCached(true, 0)
    }
    await assertWithinQuota(caller, 'coach_notes')

    const startedAt = Date.now()
    let review: WeeklyReview
    let result: Awaited<ReturnType<typeof chat>>
    /**
     * What the last provider call returned, kept beside `result` so the catch
     * below can put it in the ledger.
     *
     * `result` cannot be read there — TypeScript only knows it is assigned on
     * the path that breaks out of the loop — and every failed row written
     * before this had a null model, null finish_reason and null token counts.
     * Twenty-eight of them, which is why five days of outage had to be
     * diagnosed by inference instead of being read off the table.
     */
    let lastCall: Awaited<ReturnType<typeof chat>> | undefined

    try {
      const catalog = await exerciseCatalog(caller)
      let attempt = 0
      let extra = ''

      /**
       * Parse and check in one step, so an unreadable answer takes the same
       * road as a wrong one.
       *
       * `parseReview` used to throw straight past the retry below. That made a
       * single malformed response a hard 502 on a surface that already knew
       * how to ask again — and "ask again" is the correct answer to a model
       * that wrote prose, since the next sample usually does not.
       */
      const read = (raw: string): [WeeklyReview | null, ContractViolation[]] => {
        try {
          const parsed = parseReview(raw)
          return [parsed, checkReviewContract(parsed, block, { catalog })]
        } catch (error) {
          if (error instanceof HttpError) {
            return [
              null,
              [{ index: -1, rule: error.code ?? 'parse', detail: error.message }],
            ]
          }
          throw error
        }
      }

      for (;;) {
        result = await chat({
          freeModel: Deno.env.get('COACH_MODEL_FREE'),
          paidModel: Deno.env.get('COACH_MODEL') ?? 'moonshotai/kimi-k2.5',
          system: SYSTEM,
          user: JSON.stringify(block) + extra,
          jsonSchema: SCHEMA,
          // Five sections with chips, and on a reasoning model the ceiling is
          // shared with the thinking that precedes them. 1600 was sized against
          // the answer alone and truncated inside the reasoning block on
          // 2026-08-15 — see the note in `_shared/openrouter.ts`. The answer is
          // about 500 tokens; the rest of this is headroom to think in.
          maxTokens: 4000,
        })
        lastCall = result

        const [parsed, violations] = read(result.content)

        if (parsed && violations.length === 0) {
          review = parsed
          break
        }

        console.warn('review rejected', {
          attempt,
          violations,
          model: result.model,
          finishReason: result.finishReason,
          promptVersion: PROMPT_VERSION,
        })

        if (attempt === 0) {
          attempt = 1
          extra =
            `\n\nYour previous answer broke these rules: ` +
            `${violations.map((v) => `${v.rule} (${v.detail})`).join('; ')}. ` +
            `Write the review again. Use only numbers and exercise names from ` +
            `the block above, and write all five sections. Output only the ` +
            `JSON object.`
          continue
        }

        // Unlike the old note list, a review cannot drop its bad parts and
        // keep the rest: the contract IS the five sections, and four of five
        // is not a review. So a second failure is a failed generation, said
        // plainly, and the client keeps whatever it had.
        //
        // An answer that could not be read twice keeps its own wording. Telling
        // someone their figures do not match their log, when the truth is that
        // nothing came back to check, sends them looking at the wrong thing.
        if (violations[0].rule === 'parse' || violations[0].rule === 'empty') {
          throw new HttpError(violations[0].detail, 502, violations[0].rule)
        }
        throw new HttpError(
          'The review came back with figures that do not match your log, so it was not saved. Try again in a moment.',
          502,
          violations[0].rule,
        )
      }
    } catch (error) {
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
        model: lastCall?.model,
        usedFree: lastCall?.usedFree,
        finishReason: lastCall?.finishReason,
        tokensIn: lastCall?.tokensIn,
        tokensOut: lastCall?.tokensOut,
      })

      /*
       * A failed generation serves the LAST review, not an error.
       *
       * The comment thirty lines up already promised this: "a second failure
       * is a failed generation, said plainly, and the client keeps whatever it
       * had". It did not, because this rethrew and the client has no payload
       * to keep on a cold launch. Observed on 2026-08-22: three Regenerate
       * presses over two hours produced zero new `coach_notes` rows, and the
       * screen went from a stale-but-readable review to "The review took too
       * long."
       *
       * `stale: true` is the flag the client renders as a note rather than as
       * an error, and it is the same call the missing-schema branch above
       * already makes. The figures on that screen come from `weekly_review()`
       * and are unaffected either way; this is only about the sentences.
       *
       * Rethrow only when there is nothing to fall back TO. A first-ever
       * generation that fails is a real error and has to say so, because
       * silently answering "no review" would be indistinguishable from an
       * account with nothing to review yet.
       */
      if (cached) {
        console.warn('generation failed, serving the cached review', {
          promptVersion: PROMPT_VERSION,
          code: error instanceof HttpError ? error.code : 'unknown',
        })
        /*
         * `stale: false`, `refreshFailed: true`. The served review is OLD, but
         * it is not from an older contract, which is the only thing `stale`
         * has ever meant here.
         *
         * The quota read is wrapped: it is a network call inside a catch, and
         * letting it throw would replace a handled generation failure with an
         * unhandled 500, turning a graceful fallback into the loudest possible
         * failure at exactly the wrong moment.
         */
        let left = 0
        try {
          left = await quotaRemaining(caller, 'coach_notes')
        } catch {
          // The review matters; the number beside it does not.
        }
        return serveCached(false, left, true)
      }
      throw error
    }

    const generatedAt = new Date().toISOString()

    // Service role: `coach_notes` has no client-writable policy, so the only
    // text that can appear under the "AI-generated" label is text that came
    // through here. `insights` is jsonb and now holds an object rather than an
    // array — the column was never typed to the old shape, and the client
    // sniffs which one it got.
    const { error: cacheError } = await caller.asService.from('coach_notes').upsert({
      user_id: caller.userId,
      generated_at: generatedAt,
      basis_workout_at: basis,
      model: result.model,
      prompt_version: `${PROMPT_VERSION}:${unit}`,
      insights: review,
    })
    if (cacheError) console.error('coach_notes upsert failed', cacheError)

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
      review,
      insights: null,
      generatedAt,
      model: result.model,
      cached: false,
      regeneratesLeft: await quotaRemaining(caller, 'coach_notes'),
    })
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status)
    if (error instanceof ModelError) {
      // The diagnostic, which is no longer what the reader is shown.
      console.warn('coach-notes model error', {
        code: error.code,
        detail: error.message,
      })
      if (error.code === 'breaker_open') {
        return json({ error: error.userMessage, degraded: true }, 503)
      }
      return json({ error: error.userMessage }, error.status)
    }
    console.error('coach-notes', error)
    return json({ error: 'Could not write your review right now.' }, 500)
  }
})
