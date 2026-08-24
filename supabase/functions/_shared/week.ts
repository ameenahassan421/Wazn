/**
 * The Monday that starts the week containing `value`, as `YYYY-MM-DD`, in UTC.
 * `null` when the value is not a readable instant.
 *
 * NEW here, not extracted: an earlier version of this comment said "extracted
 * from `coach-notes/index.ts`", which was false and would have sent a later
 * session hunting for an original to diff against. There is none.
 *
 * ── WHY IT IS A MODULE AND NOT FOUR LINES AT THE CALL SITE ──────────────────
 * So vitest can reach it. This repo has no Deno test harness, and the function
 * is date arithmetic added hours after a week-boundary bug held CI red for a
 * day. The constraint that lets a `_shared` module into a node test run is the
 * one `has-training-data.ts` states correctly, "plain TypeScript with no Deno
 * APIs" — NOT the absence of imports, which a previous version of this comment
 * claimed. Eleven `_shared` modules with imports are already read by vitest.
 *
 * ── IT MUST AGREE WITH THREE OTHER WEEK STARTS, AND NOTHING ENFORCES THAT ───
 * `src/lib/progress.ts:weekStart` is the local-time twin, `forecast.ts` has an
 * ISO variant, and `streak.test.ts` open-codes a third. The Deno boundary is
 * why this one cannot import `progress.ts`. If you change where a week begins,
 * change all four.
 *
 * Monday-start and UTC because Postgres `date_trunc('week', …)` is, and
 * `weekly_review()` computes every figure in the review with it. A disagreement
 * here would put the sentence and the numbers beside it in different weeks,
 * which is the bug the caller exists to fix.
 *
 * `null` rather than a throw: the caller reads a stored timestamp on the path
 * that SERVES a cached review, and `new Date('nonsense').toISOString()` raises
 * `RangeError`, which would turn a recoverable state into a 500 on the one
 * branch whose whole job is degrading gracefully. CLAUDE.md's rule about a
 * failure branch saying "could not determine" rather than an answer.
 */
export function weekStartUtc(value: string | number | Date): string | null {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  // No midnight-normalising step: `.slice(0, 10)` discards the time, and
  // subtracting whole days never changes the UTC time of day.
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}
