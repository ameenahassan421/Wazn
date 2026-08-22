import { QUOTA_VISIBLE_AT } from '@wazn/domain'

/**
 * The weekly review's request state, as a reducer with no React and no React
 * Native in it.
 *
 * ── WHY THIS IS NOT FOUR `useState`s IN THE COMPONENT ───────────────────────
 * It was, and a code review on 2026-08-22 named the cost: `WeekReview` is a
 * 274-line component with two independent async reads, a sticky `force` flag, a
 * quota gate and four render states, and nothing exercised any of it.
 *
 * The reason nothing did is mechanical rather than lazy. `WeekReview.tsx`
 * imports `Pressable` and `View`, so importing it drags `react-native/index.js`
 * and its Flow syntax into a node test run, which vitest refuses. Asserting
 * anything about it would have meant adding `@testing-library/react-native` and
 * a native preset to test one flag.
 *
 * So the flag moved instead. Everything below is arithmetic over a plain
 * object, the component holds it with `useReducer`, and the rules that actually
 * have teeth are checkable in a file that imports nothing.
 *
 * ── THE RULE WITH TEETH ─────────────────────────────────────────────────────
 * `force` is STICKY. Regenerate sets it, and it stays set for every subsequent
 * request unless something clears it. `fetchWeeklyReview(unit, { force })`
 * bypasses the cache and spends a model call when it is true.
 *
 * So `retry` MUST clear it. Without that, a lifter who pressed Regenerate once
 * and then hit "Try again" three times against a flaky network spends four
 * model calls recovering from one failure. The symptom is a quota that drains
 * faster than anyone expects, with nothing on screen to explain it, which is
 * why it is worth a test rather than a comment: deleting the reset changes no
 * types, breaks no render, and fails no build.
 */

export type Phase = 'loading' | 'ready' | 'failed'

export interface ReviewRequest {
  phase: Phase
  /** Bypass the cache on the next request. Sticky until `retry` clears it. */
  force: boolean
  /** Bumped to re-key the effect. A retry is a NEW request, not a re-render. */
  attempt: number
  /** Only meaningful while `phase` is `failed`. */
  message: string | null
}

export const IDLE: ReviewRequest = {
  phase: 'loading',
  force: false,
  attempt: 0,
  message: null,
}

export type ReviewEvent =
  /** The Edge Function answered. */
  | { type: 'resolved' }
  /** It did not. */
  | { type: 'rejected'; message: string }
  /** "Try again" after a failure. Entitled to the cache. */
  | { type: 'retry' }
  /** "Regenerate". The ONLY control allowed to spend a model call. */
  | { type: 'regenerate' }

export function reduce(state: ReviewRequest, event: ReviewEvent): ReviewRequest {
  switch (event.type) {
    case 'resolved':
      return { ...state, phase: 'ready', message: null }
    case 'rejected':
      return { ...state, phase: 'failed', message: event.message }
    case 'retry':
      /*
       * `force: false` is the whole reason this file exists. Retry means "load
       * it again" and may serve from cache; only Regenerate spends.
       */
      return {
        phase: 'loading',
        force: false,
        attempt: state.attempt + 1,
        message: null,
      }
    case 'regenerate':
      return {
        phase: 'loading',
        force: true,
        attempt: state.attempt + 1,
        message: null,
      }
  }
}

/**
 * Whether Regenerate is still available.
 *
 * `null` means the payload carried no quota, which is not the same as zero and
 * must not disable the control: an older Edge Function response, or a shape
 * change, would otherwise silently take the button away.
 */
export function regenerateSpent(regeneratesLeft: number | null): boolean {
  return regeneratesLeft !== null && regeneratesLeft <= 0
}

/**
 * Whether the remaining quota is worth putting on screen.
 *
 * The limits are runaway-loop backstops in the high hundreds, so "500
 * regenerates left" is furniture that invites a reader to manage a budget
 * nobody has. It appears only once it is low enough to be information.
 */
export function showQuota(regeneratesLeft: number | null): boolean {
  return regeneratesLeft !== null && regeneratesLeft <= QUOTA_VISIBLE_AT
}
