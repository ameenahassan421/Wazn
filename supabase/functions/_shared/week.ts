/**
 * The Monday that starts the week containing `value`, as `YYYY-MM-DD`, in UTC.
 *
 * Extracted from `coach-notes/index.ts` so something can TEST it. It is four
 * lines of date arithmetic, which is exactly the shape that had CI red for a
 * day on 2026-08-24: a SQL suite asserted a week count that its own fixture
 * could not reach on a Monday, because `date_trunc('week', now())` moves the
 * window forward every seven days and nobody had run the suite on that weekday.
 *
 * Monday-start and UTC on purpose: Postgres `date_trunc('week', …)` is
 * Monday-start, and `weekly_review()` computes every figure in the review with
 * it. If this disagreed about where a week begins, the sentence and the numbers
 * beside it would disagree too, which is a subtler version of the bug the
 * caller exists to fix.
 */
export function weekStartUtc(value: string | number | Date): string {
  const d = new Date(value)
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7))
  return x.toISOString().slice(0, 10)
}
