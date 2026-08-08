/**
 * Routine generator — goal, days per week and equipment in; ordinary,
 * editable Wazn routines out.
 *
 * The constraint that shapes everything here (plan §2C): the routine is
 * "validated against the exercises table, saved as a normal editable routine,
 * never auto-activated". So:
 *
 *  - The model picks from a list of exercise names it is *given*. It is not
 *    asked to know what exercises exist.
 *  - Every name it returns is looked up in the table anyway, because a model
 *    that is told to pick from a list will still occasionally invent one.
 *  - What lands in the database is rows in `routines` / `routine_exercises` /
 *    `routine_sets` — the same rows the routine editor writes. Nothing marks
 *    them as generated, because after the first edit they would not be.
 *
 * Routines prescribe reps and not weight, matching the decision already
 * recorded in DECISIONS.md: a routine that hard-codes 60 kg lies to you the
 * week after you progress.
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
import { parseJsonObject } from '../_shared/parse-json-object.ts'
import { validatePlan } from '../_shared/validate-plan.ts'

const SYSTEM = `You design strength-training routines for an app called Wazn.

You are given a list of available exercises and the user's requirements. Build
a weekly plan.

Rules:
- Use ONLY exercise names from the provided list, copied exactly. Never invent
  an exercise, never abbreviate, never fix a spelling.
- One entry per day requested. Give each day a short name describing what it
  trains ("Upper A", "Legs", "Push").
- 4 to 7 exercises per day. Compound movements first, isolation last.
- 2 to 5 sets per exercise. Reps between 3 and 20.
- Prescribe sets and reps only. Never prescribe weight.
- Cover the whole body across the week. Do not train the same muscle group
  hard on consecutive days.
- Never give medical, injury, diet or supplement advice.

Return JSON only.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['days'],
  properties: {
    days: {
      type: 'array',
      minItems: 1,
      maxItems: 7,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'exercises'],
        properties: {
          name: { type: 'string' },
          exercises: {
            type: 'array',
            minItems: 1,
            maxItems: 10,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['exercise', 'sets', 'reps'],
              properties: {
                exercise: { type: 'string' },
                sets: { type: 'integer' },
                reps: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  },
}

/** Bump when SYSTEM or SCHEMA changes. See coach-notes for the reasoning. */
const PROMPT_VERSION = 'generate-routine@1'

const GOALS = ['strength', 'muscle', 'general fitness', 'endurance'] as const
const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other']

function parsePlan(raw: string): unknown {
  const parsed = parseJsonObject(raw)
  if (!parsed) throw new HttpError('The routine came back unreadable.', 502, 'parse')
  const days = (parsed as { days?: unknown }).days
  if (!Array.isArray(days) || days.length === 0) {
    throw new HttpError('The routine came back empty.', 502, 'empty')
  }
  return parsed
}

/**
 * Write a previewed plan into the user's routines.
 *
 * Every exercise id is re-checked against the table even though it came from
 * a preview this function produced — the round trip through a browser is a
 * place where ids can be edited, and "the client sent it back" is not a
 * provenance a database write should rely on. RLS would stop it writing to
 * someone else's routines regardless; this stops it writing a nonsense one to
 * their own.
 */
async function saveRoutines(
  caller: Awaited<ReturnType<typeof authenticate>>,
  plan: { name: string; exercises: { id: string; sets: number; reps: number }[] }[],
): Promise<{ id: string; name: string }[]> {
  const ids = [...new Set(plan.flatMap((d) => d.exercises.map((e) => e.id)))]
  const { data: known } = await caller.asUser
    .from('exercises')
    .select('id')
    .in('id', ids)
  const valid = new Set(((known ?? []) as { id: string }[]).map((e) => e.id))

  const { data: existing } = await caller.asUser
    .from('routines')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  let position = ((existing?.position as number | undefined) ?? -1) + 1

  const created: { id: string; name: string }[] = []
  for (const day of plan.slice(0, 7)) {
    const exercises = (day.exercises ?? [])
      .filter((e) => valid.has(e.id))
      .slice(0, 12)
      .map((e) => ({
        id: e.id,
        sets: Math.min(Math.max(Math.round(Number(e.sets) || 3), 1), 6),
        reps: Math.min(Math.max(Math.round(Number(e.reps) || 8), 1), 30),
      }))
    if (exercises.length === 0) continue

    const { data: routine, error: routineError } = await caller.asUser
      .from('routines')
      .insert({
        user_id: caller.userId,
        name:
          String(day.name ?? 'Day')
            .trim()
            .slice(0, 60) || 'Day',
        position: position++,
      })
      .select('id, name')
      .single()
    if (routineError || !routine)
      throw new HttpError('Could not save the routine.', 500)

    const { data: routineExercises, error: reError } = await caller.asUser
      .from('routine_exercises')
      .insert(
        exercises.map((e, index) => ({
          routine_id: routine.id,
          exercise_id: e.id,
          position: index,
        })),
      )
      .select('id, position')
    if (reError || !routineExercises)
      throw new HttpError('Could not save the routine.', 500)

    const setRows = routineExercises.flatMap((re) => {
      const planned = exercises[re.position as number]
      return Array.from({ length: planned.sets }, (_, i) => ({
        routine_exercise_id: re.id,
        set_number: i + 1,
        reps: planned.reps,
        set_type: 'normal',
      }))
    })
    const { error: setsError } = await caller.asUser
      .from('routine_sets')
      .insert(setRows)
    if (setsError) throw new HttpError('Could not save the routine.', 500)

    created.push({ id: routine.id as string, name: routine.name as string })
  }

  if (created.length === 0)
    throw new HttpError('That routine had nothing to save.', 400)
  return created
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const caller = await authenticate(request)
    const body = (await request.json().catch(() => ({}))) as {
      goal?: string
      days?: number
      equipment?: string[]
      save?: { name: string; exercises: { id: string; sets: number; reps: number }[] }[]
    }

    // ── Save path ──────────────────────────────────────────────────────────
    // Design v2.1 makes generation a *preview*: the result opens full-screen
    // and the user presses Save or Adjust. So the two halves are separate
    // requests. This one costs no model call and no quota — the generation
    // that produced the plan already paid for both, and charging again for
    // pressing Save would make Adjust the expensive choice.
    if (Array.isArray(body.save)) {
      const created = await saveRoutines(caller, body.save)
      return json({ routines: created, saved: true })
    }

    // Requirements are validated here rather than trusted into a prompt. The
    // request body is the one thing on this path a user controls, and it is
    // about to be concatenated into text a model reads.
    const goal = GOALS.includes(body.goal as (typeof GOALS)[number])
      ? (body.goal as string)
      : 'general fitness'
    const days = Math.min(Math.max(Math.round(Number(body.days) || 3), 1), 7)
    const equipment = Array.isArray(body.equipment)
      ? body.equipment.filter((e) => EQUIPMENT.includes(e))
      : []

    await assertWithinQuota(caller, 'routine')

    // The candidate list, under RLS: seeded exercises plus this user's own.
    let query = caller.asUser
      .from('exercises')
      .select('id, name, muscle_group, equipment')
    if (equipment.length > 0) query = query.in('equipment', equipment)
    const { data: exerciseRows, error: exerciseError } = await query
    if (exerciseError) throw new HttpError('Could not read the exercise list.', 500)

    const available = (exerciseRows ?? []) as {
      id: string
      name: string
      muscle_group: string
      equipment: string
    }[]
    if (available.length < 4) {
      throw new HttpError(
        'There are not enough exercises for that equipment. Try adding another kind.',
        400,
      )
    }

    const startedAt = Date.now()
    let result: Awaited<ReturnType<typeof chat>>
    let validated: ReturnType<typeof validatePlan>['days']
    let dropped: string[]

    try {
      result = await chat({
        freeModel: Deno.env.get('ROUTINE_MODEL_FREE'),
        paidModel: Deno.env.get('ROUTINE_MODEL') ?? 'moonshotai/kimi-k2.5',
        system: SYSTEM,
        user: JSON.stringify({
          goal,
          days_per_week: days,
          available_exercises: available.map((e) => ({
            name: e.name,
            muscle_group: e.muscle_group,
            equipment: e.equipment,
          })),
        }),
        jsonSchema: SCHEMA,
        // A routine is days of exercises of sets — a nested structure, and far
        // larger than the five short strings Coach's Notes returns. Sharing
        // one ceiling with notes is what made a 4-day routine fail with "came
        // back unreadable" on 2026-08-05 while a 3-day one had just succeeded.
        // Output tokens are free on the free model and a fraction of a cent on
        // the paid fallback; a truncated answer costs the whole feature.
        maxTokens: 6000,
      })

      // Validated against the real table by the one module in this codebase the
      // test suite can reach directly — see src/lib/validate-plan.test.ts. A
      // model told to copy from a list will still occasionally invent an
      // exercise, and the failure mode of trusting it is a routine containing a
      // lift that does not exist.
      // A truncated response and a malformed one look identical to a parser and
      // need opposite fixes, so the provider's own reason is checked first rather
      // than guessed at later.
      if (result.finishReason === 'length') {
        throw new HttpError(
          'That routine was too long to finish. Try fewer days, or fewer kinds of equipment.',
          502,
          'truncated',
        )
      }

      const plan = validatePlan(parsePlan(result.content), available, days)
      validated = plan.days
      dropped = plan.dropped

      if (validated.length === 0) {
        throw new HttpError(
          'The generated routine did not match any real exercises. Try again.',
          502,
          'no_valid_exercises',
        )
      }
    } catch (error) {
      // Failed attempts are ledger rows too, with `ok = false`. Quota counts
      // only successes, so a truncated routine or a provider outage does not
      // spend one of the caller's three for the month.
      await recordGeneration(caller, 'routine', {
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

    await recordGeneration(caller, 'routine', {
      ok: true,
      model: result.model,
      usedFree: result.usedFree,
      latencyMs: Date.now() - startedAt,
      finishReason: result.finishReason,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      promptVersion: PROMPT_VERSION,
    })

    // Nothing is written yet. The client renders this as a preview and calls
    // back with `save` if the user keeps it — see the save path above.
    const nameById = new Map(available.map((e) => [e.id, e.name]))
    return json({
      preview: validated.map((day) => ({
        name: day.name,
        exercises: day.exercises.map((e) => ({
          id: e.id,
          name: nameById.get(e.id) ?? 'Exercise',
          sets: e.sets,
          reps: e.reps,
        })),
      })),
      model: result.model,
      droppedExercises: dropped.slice(0, 10),
      generationsLeft: await quotaRemaining(caller, 'routine'),
    })
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status)
    if (error instanceof ModelError) {
      // An open breaker is a degraded surface, not a fault the user caused.
      if (error.code === 'breaker_open') {
        return json({ error: error.message, degraded: true }, 503)
      }
      return json({ error: error.message }, error.status)
    }
    console.error('generate-routine', error)
    return json({ error: 'Could not generate a routine right now.' }, 500)
  }
})
