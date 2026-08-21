/**
 * Turning a server error into a sentence a lifter can act on.
 *
 * ── WHY IT LIVES HERE AND NOT IN `supabase.ts` ──────────────────────────────
 * It was in `supabase.ts`, which builds the browser client and can never be
 * portable — so the native app had no humaniser at all and rendered whatever
 * Postgres said. On 2026-08-21 the History tab showed a lifter
 * `permission denied for function session_volume_history`. This is a pure
 * function over a string; it belongs in the half both apps can read.
 *
 * ── THE FALLBACK USED TO LEAK, AND STILL CAN ────────────────────────────────
 * The last branch appends the raw message. That is deliberate for a defect a
 * developer has to diagnose, and it is exactly why the specific branches above
 * it matter: every shape a USER can reach in normal use should be caught
 * before it. `permission denied` is one of those — it is what every RLS-scoped
 * table and `security invoker` function says to a signed-out request, so it is
 * reachable by simply having a session expire.
 */

/**
 * @param action What was being attempted, in the user's language, e.g.
 *   "Loading your history". It is the subject of the sentence.
 */
export function describeError(action: string, error: unknown): string {
  const raw =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)

  if (/failed to fetch|network|load failed/i.test(raw)) {
    return `${action} failed. No connection to the server. Your last saved set is safe; try again once you have signal.`
  }
  /**
   * A signed-out or expired request. Postgres phrases this three ways
   * depending on whether it hit a table policy, a function grant or the JWT
   * itself, and a lifter should see one sentence for all three.
   */
  if (/permission denied|jwt|token|not authenticated|session|rls/i.test(raw)) {
    return `${action} failed. Your sign-in has expired. Sign in again to continue.`
  }
  return `${action} failed. ${raw}`
}
