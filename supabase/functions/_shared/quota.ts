/**
 * Quota arithmetic, with no database and no Deno in it.
 *
 * This was inline in `context.ts`, which meant it had no tests — not because
 * anyone chose that, but because `context.ts` imports `Deno.env` and a remote
 * Supabase client, so nothing in the vitest suite could reach it. Quota is UX
 * and money at the same time (`docs/INFRASTRUCTURE_AUDIT.md` §5-I1), and the
 * one bug it has already produced was arithmetic: two users opened Coach
 * before logging anything, spent their single weekly regenerate on a
 * model-written "you have no data", and were locked out for seven days —
 * including after they started training, which is exactly when the feature
 * becomes worth using.
 *
 * So the arithmetic lives here, importing nothing, and `src/lib/quota.test.ts`
 * reaches it across the workspace boundary the same way `validate-plan` is
 * reached. `context.ts` keeps only the part that genuinely needs a database:
 * running the count.
 */

/**
 * Free-tier limits, per plan §2C: Coach's Notes regenerate at most weekly, and
 * routines are capped at three a month.
 *
 * Derived by counting a ledger rather than by keeping a counter, because a
 * counter needs something to reset it and a ledger just ages out.
 */
export const QUOTAS = {
  coach_notes: { limit: 1, days: 7 },
  routine: { limit: 3, days: 30 },
} as const

export type Feature = keyof typeof QUOTAS

/**
 * The start of the rolling window, as an ISO string for PostgREST's `gte`.
 *
 * `now` is a parameter rather than a call to `Date.now()` so this is testable
 * at a fixed instant. A function that reads the clock cannot be asserted
 * against; one that is handed the clock can.
 */
export function quotaWindowStart(feature: Feature, now: number): string {
  return new Date(now - QUOTAS[feature].days * 86_400_000).toISOString()
}

/**
 * How many generations are left.
 *
 * Clamped at zero on both ends: a negative count is impossible from a real
 * query but would render as "-1 left this week" if one ever arrived, and a
 * count above the limit (a limit lowered after the fact) should read as none
 * left rather than a negative.
 */
export function remaining(feature: Feature, used: number): number {
  return Math.max(0, QUOTAS[feature].limit - Math.max(0, used))
}

/**
 * What the user is told when there is nothing left.
 *
 * Copy lives beside the arithmetic because the two have to agree: a message
 * naming a limit that the table does not hold is how a refusal starts reading
 * as a fault. Both lines point at something the user can still do — under the
 * one law, a dead end mid-session is worse than a limit.
 */
export function quotaMessage(feature: Feature): string {
  return feature === 'routine'
    ? `That is ${QUOTAS.routine.limit} generated routines this month. You can still build one by hand — it takes about a minute.`
    : 'Your notes were written recently. They refresh once a week, or whenever you log something new.'
}
