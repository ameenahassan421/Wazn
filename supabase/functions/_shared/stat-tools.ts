/**
 * The tools the coach is allowed to call, and the only way to call them.
 *
 * The whitelist is this file. `converseWithTools` will not run a name that is
 * not in it, so the blast radius of a model choosing badly is "it asked for
 * numbers the caller already owns" — which is not a blast radius at all.
 *
 * Each entry is one `security invoker` SQL function from migration 0019. None
 * of them accepts a user id; RLS scopes every row to the caller. That is the
 * enforcement for §2C's identity rule, and it is a property of the schema
 * rather than a promise made in a prompt.
 *
 * **Arguments are validated here, not trusted.** They arrive as JSON a model
 * wrote, which makes them the least trustworthy input in the system — less so
 * than a request body, because at least a request body has a human behind it.
 * Every value is coerced and clamped before it reaches an RPC.
 *
 * The surface that uses this — B3's Ask screen — is a gated phase and is not
 * built. This is the mechanism, built once and generically, per the audit's
 * §3-A1: built per feature it would be three half-versions.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import type { ToolCall, ToolSpec } from './openrouter.ts'

/** Matches the `muscle_group` check constraint in 0001. */
export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'cardio',
] as const

export const STAT_TOOLS: ToolSpec[] = [
  {
    name: 'e1rm_trend',
    description:
      'Weekly best estimated 1RM for one exercise, in kg. Use this to answer whether a specific lift is moving, stalled, or falling.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['exercise'],
      properties: {
        exercise: {
          type: 'string',
          description: 'Exact exercise name, e.g. "Bench Press (Barbell)".',
        },
        weeks: { type: 'integer', description: 'How far back to look, 1 to 104.' },
      },
    },
  },
  {
    name: 'weekly_band',
    description:
      'Working sets per week for one muscle group, with the 10-20 productive range. Use this for volume questions.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['muscle'],
      properties: {
        muscle: { type: 'string', enum: [...MUSCLE_GROUPS] },
        weeks: { type: 'integer', description: 'How far back to look, 1 to 52.' },
      },
    },
  },
  {
    name: 'rep_distribution',
    description:
      'How working sets fall across rep ranges (1-5, 6-8, 9-12, 13+). Omit the exercise for all training.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        exercise: { type: 'string' },
        weeks: { type: 'integer' },
      },
    },
  },
  {
    name: 'adherence',
    description:
      'Sessions per week, weeks trained, and the longest gap in days. Check this before concluding anything about progress.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { weeks: { type: 'integer' } },
    },
  },
  {
    name: 'records_ladder',
    description: 'Recent personal records with dates, weights and reps, in kg.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { weeks: { type: 'integer' } },
    },
  },
]

function clampWeeks(value: unknown, fallback: number, max: number): number {
  const parsed = Math.round(Number(value))
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, 1), max)
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required`)
  }
  // Long enough for any real exercise name and short enough that a model
  // cannot use an argument as a channel for prose.
  return value.trim().slice(0, 80)
}

/** How many rows a result carries, for the trace. */
function countRows(result: unknown): number {
  const series = (result as { series?: unknown[]; records?: unknown[] })?.series
  const records = (result as { records?: unknown[] })?.records
  if (Array.isArray(series)) return series.length
  if (Array.isArray(records)) return records.length
  return result ? 1 : 0
}

/**
 * Run one call as the caller.
 *
 * `asUser` and not `asService`, always. A service-role client here would turn
 * every tool into a way to read the whole database with arguments a model
 * chose, which is the single worst thing this file could do.
 */
export function makeStatToolRunner(asUser: SupabaseClient) {
  return async (call: ToolCall): Promise<{ rows: number; result: unknown }> => {
    const args = call.args ?? {}
    let rpc: string
    let params: Record<string, unknown>

    switch (call.name) {
      case 'e1rm_trend':
        rpc = 'e1rm_trend'
        params = {
          exercise_name: requireString(args.exercise, 'exercise'),
          weeks: clampWeeks(args.weeks, 26, 104),
        }
        break
      case 'weekly_band': {
        const muscle = requireString(args.muscle, 'muscle').toLowerCase()
        if (!(MUSCLE_GROUPS as readonly string[]).includes(muscle)) {
          // Named rather than swallowed: the model gets a usable correction
          // back and can retry within its budget.
          throw new Error(`unknown muscle group ${muscle}`)
        }
        rpc = 'weekly_band'
        params = { muscle, weeks: clampWeeks(args.weeks, 12, 52) }
        break
      }
      case 'rep_distribution':
        rpc = 'rep_distribution'
        params = {
          exercise_name:
            typeof args.exercise === 'string' && args.exercise.trim()
              ? args.exercise.trim().slice(0, 80)
              : null,
          weeks: clampWeeks(args.weeks, 12, 52),
        }
        break
      case 'adherence':
        rpc = 'adherence'
        params = { weeks: clampWeeks(args.weeks, 12, 52) }
        break
      case 'records_ladder':
        rpc = 'records_ladder'
        params = { weeks: clampWeeks(args.weeks, 26, 104) }
        break
      default:
        // Unreachable: the loop checks the whitelist first. Kept because
        // "unreachable" is a claim about today's callers.
        throw new Error(`unknown tool ${call.name}`)
    }

    const { data, error } = await asUser.rpc(rpc, params)
    if (error) throw new Error(`${rpc} failed: ${error.message}`)
    return { rows: countRows(data), result: data }
  }
}
