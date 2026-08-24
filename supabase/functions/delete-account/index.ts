/**
 * Delete the calling user's account, and everything attached to it.
 *
 * Both stores require this. Apple rejects a submission without an in-app
 * deletion path (Guideline 5.1.1(v)), and Google Play requires the in-app path
 * PLUS a web-accessible URL that reaches the same outcome. It was filed as a
 * requirement in `docs/archive/IMPLEMENTATION_PROMPTS.md:891` and never built,
 * so it stood in front of BOTH store submissions rather than just iOS.
 *
 * WHY THIS IS SMALL, AND WHY THAT IS THE SCHEMA'S DOING
 *
 * Every table that holds user data references `auth.users(id)` with
 * `on delete cascade` — verified against `pg_constraint` on 2026-08-23, all
 * nineteen of them: workouts, routines, exercises (owner_id), body_weights,
 * body_measurements, daily_checkins, protein_days, coach_briefs, coach_notes,
 * coach_views, ai_generations, exercise_notes, exercise_rest,
 * user_preferences, invites, follows (BOTH sides), workout_likes,
 * client_errors and profiles. `workout_sets` cascades in turn from `workouts`.
 *
 * So one `deleteUser` is the whole operation. There is no delete list here to
 * drift out of step with the schema, and a table added tomorrow with the usual
 * `references auth.users(id) on delete cascade` is covered the day it ships.
 * A hand-written list of tables would have been the bug: it is correct only
 * until the next migration, and nothing would fail when it stopped being.
 *
 * WHY HARD DELETE RATHER THAN A GRACE PERIOD
 *
 * A soft delete means a `deleted_at` predicate in every RLS policy, every RPC
 * and every query, plus a scheduled purge. That is a new failure mode on every
 * read path in the app, to protect against a mis-tap that the typed
 * confirmation on the client already prevents. Decided 2026-08-23; Ameen
 * delegated the call. The user is told plainly that it cannot be undone.
 *
 * WHY THE BODY MUST SAY `DELETE`
 *
 * A verified JWT is enough to authorise this, so the confirm string is not a
 * security control and is not treated as one. It is there so that no other
 * code path in the app can delete an account by accidentally POSTing to this
 * URL with a session attached. The client's typed confirmation is the real
 * ceremony; this is the guard rail behind it.
 */

import { CORS_HEADERS, HttpError, authenticate, json } from '../_shared/context.ts'

interface Body {
  confirm?: string
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (request.method !== 'POST') {
    return json({ error: 'Use POST.' }, 405)
  }

  try {
    const { userId, asService } = await authenticate(request)

    let body: Body = {}
    try {
      body = (await request.json()) as Body
    } catch {
      // An empty or unparseable body fails the confirm check below, which is
      // the same refusal. There is nothing to distinguish for the caller.
    }
    if (body.confirm !== 'DELETE') {
      return json({ error: 'Deletion was not confirmed.' }, 400)
    }

    // `shouldSoftDelete` is passed explicitly. It defaults to false, but the
    // default is the entire decision this file documents, and a default is a
    // poor place to keep a decision someone might reasonably want to change.
    const { error } = await asService.auth.admin.deleteUser(userId, false)
    if (error) {
      throw new HttpError('Could not delete the account. Try again.', 500, 'delete')
    }

    /*
     * Read it back rather than trusting the success flag.
     *
     * This repo has been bitten by exactly this twice: 0027's
     * `revoke all ... from public` executed, answered success, and left the
     * function callable; `apply_migration` answers `{"success": true}` for DDL
     * that did nothing. CLAUDE.md's rule is to read `information_schema`
     * afterwards rather than believe the flag, and the same rule applies to an
     * admin API. If the row survived, the caller is told the truth instead of
     * being shown a farewell screen over an account that still exists.
     */
    const { data: still } = await asService.auth.admin.getUserById(userId)
    if (still?.user) {
      throw new HttpError(
        'Could not delete the account. Try again.',
        500,
        'delete-unverified',
      )
    }

    return json({ ok: true })
  } catch (error) {
    if (error instanceof HttpError) {
      return json({ error: error.message }, error.status)
    }
    return json({ error: 'Could not delete the account. Try again.' }, 500)
  }
})
