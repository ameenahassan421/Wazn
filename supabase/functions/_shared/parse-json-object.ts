/**
 * Recover a JSON object from whatever a model actually sent back.
 *
 * Both AI features ask for JSON and both are told "output ONLY the JSON
 * object". Models ignore that instruction in at least three ways, and every
 * one of them has been seen live on this project:
 *
 *  1. clean JSON — the happy path;
 *  2. a fenced ```json block, sometimes with prose around it;
 *  3. a reasoning preamble followed by a bare object, no fence at all.
 *
 * This module exists because `coach-notes` learned to handle all three during
 * the 2C self-test and `generate-routine` never did — it handled the fence and
 * threw "The routine came back unreadable" on the preamble, which is the
 * failure Ameen hit in production on 2026-08-05. One parser, both callers, so
 * a lesson learned on one surface cannot go missing on the other.
 *
 * It is plain TypeScript with no Deno APIs and no imports, for the same reason
 * `validate-plan.ts` is: the test suite can then import the shipped code
 * directly rather than a copy of it.
 *
 * Returns `null` rather than throwing, so each caller keeps its own wording —
 * the Coach's Notes card and the routine builder say different things, and
 * neither should say "JSON".
 */
export function parseJsonObject(raw: string): unknown | null {
  for (const candidate of candidates(raw)) {
    if (!candidate.trim()) continue
    try {
      const parsed: unknown = JSON.parse(candidate)
      // A bare string, number or array is not the object shape either caller
      // is asking for, and letting one through only moves the failure to a
      // less obvious place downstream.
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed
      }
    } catch {
      // Try the next strategy. A fenced block containing broken JSON should
      // fall through to the brace scan rather than take the whole response
      // down with it.
    }
  }
  return null
}

function* candidates(raw: string): Generator<string> {
  yield raw

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) yield fenced[1]

  // First brace to last. Not a parser, and deliberately not one: the response
  // is a single object with prose around it, so the outermost pair is exactly
  // the right span.
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start !== -1 && end > start) yield raw.slice(start, end + 1)
}
