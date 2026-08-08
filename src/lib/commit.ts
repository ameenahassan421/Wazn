import type { SetType, WorkoutSet } from './types'
import { groupsFromSets, nextInGroup, roundComplete } from './supersets'

/**
 * What happens after a set lands — the two protect-list behaviours that used to
 * live inline in `LogScreen.addSet`.
 *
 * They were correct there and they were also unreachable by a test: proving
 * that a superset still rests once per round meant rendering a screen and
 * mocking Supabase. Design v2.2 adds a second caller — the overview's check,
 * which commits a row without the focused view ever being open — and a rule
 * with two callers and no test is a rule that regresses in the second one.
 *
 * So the decision is a pure function and the callers just obey it.
 *
 * The rules, unchanged from Stage 1 (`supersets.ts:52-86`):
 *
 *  - **A superset rests once per round, not between its exercises.** That is
 *    the entire point of one. Mid-round the answer is "move to whoever is
 *    behind"; only a completed round starts the clock.
 *  - **A warm-up starts nothing.** Nobody rests two minutes after an empty bar.
 *  - **Zero is a real setting.** "No timer on this lift" starts nothing, and is
 *    not the same as "no preference".
 *
 * ── One of those rules had never once fired ────────────────────────────────
 * Writing this file down found it. The shipped code asked `nextInGroup` first
 * and only reached the rest check if the answer was null — but after the set
 * that COMPLETES a round, `nextInGroup` returns the first member (it is the
 * one furthest behind for the next round), so the rest branch was unreachable
 * from the second set of a superset onward. Replayed against the real helpers,
 * an A/B superset rested exactly once, after A's very first set and before B
 * had even been picked, and then never again for the rest of the session.
 *
 * The parity plan lists superset round-rest on the protect list as a shipped
 * differentiator. It was the muscle-balance chart all over again: correct in
 * intent, wired wrong, and invisible because nothing rendered the round.
 *
 * The order is inverted here. Ask whether the round is complete FIRST; if it
 * is, rest and hand the next round to the member who starts it. See
 * DECISIONS.md.
 */
export interface CommitOutcome {
  /** The superset partner to move to, or null to stay where you are. */
  advanceTo: string | null
  /** Seconds of rest to start, or null for none. */
  restSeconds: number | null
}

export function commitOutcome({
  sets,
  exerciseId,
  setType,
  supersetGroup,
  restSeconds,
}: {
  /** Every set in the workout INCLUDING the one just committed. */
  sets: WorkoutSet[]
  exerciseId: string
  setType: SetType
  supersetGroup: number | null
  /** This lift's resolved rest length. */
  restSeconds: number
}): CommitOutcome {
  const rests = restSeconds > 0 && setType !== 'warmup'

  if (supersetGroup === null) {
    return { advanceTo: null, restSeconds: rests ? restSeconds : null }
  }

  const members = groupsFromSets(sets).get(supersetGroup) ?? []

  if (!roundComplete(sets, members)) {
    // Mid-round: move to whoever is behind and do NOT rest. Null means the
    // person who just lifted is still the one furthest behind — stay put.
    return { advanceTo: nextInGroup(sets, members, exerciseId), restSeconds: null }
  }

  // The round closed. Rest once, here, and open the next round on the member
  // it starts with — which is the group's first, not whoever happens to be
  // level. A group of one has no next member and no round to alternate.
  const first = members[0] ?? null
  return {
    advanceTo: first !== null && first !== exerciseId ? first : null,
    restSeconds: rests ? restSeconds : null,
  }
}
