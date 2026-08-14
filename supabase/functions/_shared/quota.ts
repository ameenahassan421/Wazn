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
 * Usage limits, derived by counting a ledger rather than by keeping a counter,
 * because a counter needs something to reset it and a ledger just ages out.
 *
 * **These are no longer product rules. Every one of them is now a loop
 * backstop** — Ameen's order, 2026-08-14: lift the limits, keep something that
 * still stops a runaway client. That is a change of *kind*, not just of
 * number, and it is why the reasoning below reads differently from the history
 * in git.
 *
 * The old design metered the two surfaces differently on purpose. The weekly
 * review was a thing the user *asks* for, so its limit was the product
 * decision: once a week. The briefing and the debrief are things the app
 * *offers*, lazily, at most once per logged session, and neither has a
 * regenerate control — so their limits were already only a cost backstop.
 *
 * Now they all are. 500 is far outside any human pattern: a lifter cannot
 * press a button 500 times a week, so a number this size is never reached by
 * use, only by a bug. What it still buys is the thing worth keeping — a client
 * that calls in a loop gets a 429 instead of an open-ended bill.
 *
 * Cost stays bounded by the free-model-first route (`openrouter.ts` tries
 * `:free` and only falls back on 429/402) and by OpenRouter's own monthly
 * ceiling. It was never really bounded by these numbers.
 */
export const QUOTAS = {
  coach_notes: { limit: 500, days: 7 },
  routine: { limit: 500, days: 30 },
  briefing: { limit: 500, days: 7 },
  debrief: { limit: 500, days: 7 },
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
    return `That is ${QUOTAS.routine.limit} generated routines this month, which is past any normal use — something is likely retrying. You can still build one by hand; it takes about a minute.`
  }
  // No surface can reach these by pressing anything, so arriving here means a
  // bug. It reads as the surface being quiet rather than as a refusal, because
  // from where the user is sitting that is what it is — and both surfaces
  // still render every figure from SQL underneath.
  if (feature === 'briefing' || feature === 'debrief') {
    return 'The coach is taking a break. Your numbers are all still here.'
  }
  // This used to read "they refresh once a week", which was the product rule
  // when the limit was 1. It is not any more, and a message naming a rule the
  // table no longer holds is exactly how a refusal starts reading as a fault.
  return `That is ${QUOTAS.coach_notes.limit} regenerations in a week. Your notes are still here, and the count clears as the week rolls on.`
}
