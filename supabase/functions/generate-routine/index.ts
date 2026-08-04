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
  CORS_HEADERS,
  HttpError,
  json,
  recordGeneration,
} from '../_shared/context.ts'
import { chat, ModelError } from '../_shared/openrouter.ts'
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

const GOALS = ['strength', 'muscle', 'general fitness', 'endurance'] as const
const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other']

function parsePlan(raw: string): unknown {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (!fenced) throw new HttpError('The routine came back unreadable.', 502)
    parsed = JSON.parse(fenced[1])
  }
  const days = (parsed as { days?: unknown }).days
  if (!Array.isArray(days) || days.length === 0) {
    throw new HttpError('The routine came back empty.', 502)
  }
  return parsed
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

    const result = await chat({
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
    })

    // Validated against the real table by the one module in this codebase the
    // test suite can reach directly — see src/lib/validate-plan.test.ts. A
    // model told to copy from a list will still occasionally invent an
    // exercise, and the failure mode of trusting it is a routine containing a
    // lift that does not exist.
    const { days: validated, dropped } = validatePlan(
      parsePlan(result.content),
      available,
      days,
    )

    if (validated.length === 0) {
      throw new HttpError(
        'The generated routine did not match any real exercises. Try again.',
        502,
      )
    }

    // ── Save as ordinary routines ───────────────────────────────────────────
    // Written as the user, through RLS, into the same tables the routine
    // editor uses. Never activated: a routine is something you choose to
    // start, and starting one for someone is the app deciding what their
    // session is.
    const { data: existing } = await caller.asUser
      .from('routines')
      .select('position')
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()
    let position = ((existing?.position as number | undefined) ?? -1) + 1

    const created: { id: string; name: string }[] = []
    for (const day of validated) {
      const { data: routine, error: routineError } = await caller.asUser
        .from('routines')
        .insert({ user_id: caller.userId, name: day.name, position: position++ })
        .select('id, name')
        .single()
      if (routineError || !routine) {
        throw new HttpError('Could not save the routine.', 500)
      }

      const { data: routineExercises, error: reError } = await caller.asUser
        .from('routine_exercises')
        .insert(
          day.exercises.map((e, index) => ({
            routine_id: routine.id,
            exercise_id: e.id,
            position: index,
          })),
        )
        .select('id, position')
      if (reError || !routineExercises) {
        throw new HttpError('Could not save the routine.', 500)
      }

      const setRows = routineExercises.flatMap((re) => {
        const planned = day.exercises[re.position as number]
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

    await recordGeneration(caller, 'routine', result.model, result.usedFree)

    return json({
      routines: created,
      model: result.model,
      // Surfaced rather than swallowed: if a model keeps inventing exercises,
      // that is worth being able to see without reading logs.
      droppedExercises: dropped.slice(0, 10),
    })
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status)
    if (error instanceof ModelError) return json({ error: error.message }, error.status)
    console.error('generate-routine', error)
    return json({ error: 'Could not generate a routine right now.' }, 500)
  }
})
