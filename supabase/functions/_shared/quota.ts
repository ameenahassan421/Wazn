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
/**
 * B1's two surfaces are metered differently, and deliberately so.
 *
 * The weekly review is a thing the user *asks* for and can regenerate, so its
 * limit is the product decision: once a week. The briefing and the debrief are
 * things the app *offers*, lazily, at most once per logged session — a lifter
 * who trains six times a week and opens the app before each one costs six
 * briefings and six debriefs, and there is no way for them to spend more by
 * pressing anything, because neither surface has a regenerate control.
 *
 * So their limits are not a product rule but a **backstop on cost**: 20 a week
 * is roughly three sessions a day, which nobody does, and it is the number
 * that turns a client bug that calls in a loop from a bill into a 429. Free
 * models carry these first, so the expected marginal cost is zero and §12's
 * $0.01/user/week ceiling has a wide margin.
 */
export const QUOTAS = {
  coach_notes: { limit: 1, days: 7 },
  // Raised from 3 on Ameen's order (2026-08-12): the cap was throttling his
  // own testing. Cost stays bounded by the free-model-first route and the
  // OpenRouter monthly ceiling, not by this number.
  routine: { limit: 30, days: 30 },
  briefing: { limit: 20, days: 7 },
  debrief: { limit: 20, days: 7 },
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
  if (feature === 'routine') {
    return `That is ${QUOTAS.routine.limit} generated routines this month. You can still build one by hand — it takes about a minute.`
  }
  // The briefing and the debrief have no regenerate control, so a user can
  // only reach this through a bug. It reads as the surface being quiet rather
  // than as a refusal, because from where they are sitting that is what it is
  // — and both surfaces still render every figure from SQL underneath.
  if (feature === 'briefing' || feature === 'debrief') {
    return 'The coach is taking a break. Your numbers are all still here.'
  }
  return 'Your notes were written recently. They refresh once a week, or whenever you log something new.'
}
