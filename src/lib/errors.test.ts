import { describe, expect, it } from 'vitest'

import { describeError } from './errors'

/**
 * The messages a lifter actually reads when something fails.
 *
 * This function lived in `supabase.ts` with no test and no branch for the one
 * error every signed-out request produces. On 2026-08-21 the native History tab
 * rendered `permission denied for function session_volume_history` to a user.
 */
describe('describeError', () => {
  it('names the action and keeps the reassurance for a dropped connection', () => {
    const message = describeError('Loading your history', new Error('Failed to fetch'))
    expect(message).toContain('Loading your history failed')
    expect(message).toContain('No connection to the server')
    // The promise that matters mid-workout: nothing already banked is lost.
    expect(message).toContain('last saved set is safe')
  })

  it('reads a Postgres permission denial as an expired sign-in, not as SQL', () => {
    const message = describeError(
      'Loading your history',
      new Error('permission denied for function session_volume_history'),
    )
    expect(message).toBe(
      'Loading your history failed. Your sign-in has expired. Sign in again to continue.',
    )
    // The thing that must never reach a lifter.
    expect(message).not.toContain('session_volume_history')
    expect(message).not.toContain('permission denied')
  })

  it('treats every shape of an auth failure the same way', () => {
    for (const raw of ['JWT expired', 'invalid token', 'not authenticated', 'RLS']) {
      expect(describeError('Saving', new Error(raw))).toContain('sign-in has expired')
    }
  })

  it('falls back to the raw message, which is for a developer', () => {
    // Deliberate: an error nobody anticipated is worth showing verbatim. It is
    // why the branches above it have to cover what a user can actually reach.
    expect(describeError('Saving', new Error('column x does not exist'))).toBe(
      'Saving failed. column x does not exist',
    )
  })

  it('survives something that is not an Error at all', () => {
    expect(describeError('Saving', 'plain string')).toBe('Saving failed. plain string')
    expect(describeError('Saving', null)).toBe('Saving failed. null')
  })

  it('never uses an em-dash', () => {
    // A standing rule for every string a person reads (CLAUDE.md). These
    // messages carried one on both branches until this file existed.
    for (const raw of ['Failed to fetch', 'JWT expired', 'boom']) {
      expect(describeError('Saving', new Error(raw))).not.toContain('—')
    }
  })
})
