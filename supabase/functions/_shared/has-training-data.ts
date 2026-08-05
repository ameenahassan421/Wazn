/**
 * Is there anything in this stat block worth asking a model about?
 *
 * `coach_stats()` is entirely 90-day scoped, so `total_sets_90d` of zero means
 * the block contains nothing but zeroes and nulls no matter which key you
 * read. Asking a model to narrate that costs a call, a wait, and the caller's
 * one regenerate for the week — and the client already has a better sentence
 * for it.
 *
 * **It fails open on purpose.** If the key is missing or unreadable, this
 * returns true and the model is called exactly as before. The alternative —
 * treating "I could not find the count" as "there is no data" — would silently
 * switch Coach's Notes off for every user the day the stat block's shape
 * changed, and nothing would report it, because an empty answer looks the same
 * as an empty account. A wasted call is a cent; a feature that quietly stops
 * working is the bug you find in a retention chart six weeks later.
 *
 * Plain TypeScript with no Deno APIs, so the test suite imports the shipped
 * module rather than a copy — same shape as `validate-plan.ts`.
 */
export function hasTrainingData(stats: unknown): boolean {
  if (!stats || typeof stats !== 'object') return true

  const total = (stats as { total_sets_90d?: unknown }).total_sets_90d
  // Postgres `count(*)` is bigint, and a driver is entitled to hand that back
  // as a string rather than a number. Both spellings of zero mean zero.
  const parsed =
    typeof total === 'number' ? total : typeof total === 'string' ? Number(total) : NaN

  if (!Number.isFinite(parsed)) return true
  return parsed > 0
}
