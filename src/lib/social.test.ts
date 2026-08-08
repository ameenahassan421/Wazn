import { describe, expect, it, beforeEach, vi } from 'vitest'

/**
 * What the client actually sends.
 *
 * This is the regression guard for the defect that had the longest life in
 * this codebase: following and liking had **never once worked** from the app.
 * `follows.follower_id` and `workout_likes.user_id` are NOT NULL with no
 * default and the inserts omitted them, so PostgREST refused every write
 * before RLS had an opinion.
 *
 * `supabase/tests/rls_social.sql` passed the entire time, because it names
 * both columns the way raw SQL does and the client does not. Policies were
 * tested; the payload never was. Assertion 7b was added to that file to close
 * the same hole from the database side — this closes it from the client side,
 * where the bug actually lived, and does it with no network.
 *
 * `docs/INFRASTRUCTURE_AUDIT.md` §5-I4 names this as a class rather than an
 * incident: nothing tests what the client sends.
 */

const inserted: { table: string; payload: Record<string, unknown> }[] = []
const deleted: { table: string; filters: [string, unknown][] }[] = []
let sessionUserId: string | null = 'user-b'
let insertError: { code?: string; message?: string } | null = null

vi.mock('./supabase', () => {
  // The narrow slice of the PostgREST builder these functions touch. Chainable
  // and thenable, because the real client is both.
  function builder(table: string) {
    const filters: [string, unknown][] = []
    const chain = {
      insert(payload: Record<string, unknown>) {
        inserted.push({ table, payload })
        return Promise.resolve({ data: null, error: insertError })
      },
      delete() {
        deleted.push({ table, filters })
        return chain
      },
      eq(column: string, value: unknown) {
        filters.push([column, value])
        return chain
      },
      then(resolve: (value: { data: null; error: null }) => unknown) {
        return Promise.resolve({ data: null, error: null }).then(resolve)
      },
    }
    return chain
  }

  return {
    describeError: (context: string, error: unknown) =>
      `${context} failed: ${(error as { message?: string })?.message ?? 'unknown'}`,
    supabase: {
      from: (table: string) => builder(table),
      auth: {
        getSession: () =>
          Promise.resolve({
            data: {
              session: sessionUserId ? { user: { id: sessionUserId } } : null,
            },
          }),
      },
    },
  }
})

const { follow, setLiked } = await import('./social')

beforeEach(() => {
  inserted.length = 0
  deleted.length = 0
  sessionUserId = 'user-b'
  insertError = null
})

describe('follow', () => {
  it('sends the owner column, not just the target', async () => {
    // The exact assertion whose absence let the bug ship. `following_id`
    // alone is what the app used to send.
    await follow('user-a')
    expect(inserted).toEqual([
      { table: 'follows', payload: { follower_id: 'user-b', following_id: 'user-a' } },
    ])
  })

  it('treats "already following" as success', async () => {
    // 23505 is a unique violation — the state the caller wanted is the state
    // that exists. Tapping Follow twice is not an error.
    insertError = { code: '23505' }
    await expect(follow('user-a')).resolves.toBeUndefined()
  })

  it('explains a private profile instead of reporting a raw refusal', async () => {
    // 42501 here is `is_discoverable()` refusing: the target is still on the
    // default 'private' visibility, so nobody can follow them — including
    // someone holding their invite link. The message has to name the fix.
    insertError = { code: '42501' }
    await expect(follow('user-a')).rejects.toThrow(/Followers or Public/)
  })

  it('refuses to write at all with no session', async () => {
    // Without this the insert would go out with `follower_id: undefined` and
    // fail as a NOT NULL violation — the original bug, wearing a new hat.
    sessionUserId = null
    await expect(follow('user-a')).rejects.toThrow(/sign-in expired/i)
    expect(inserted).toHaveLength(0)
  })
})

describe('setLiked', () => {
  it('sends the owner column on a like', async () => {
    await setLiked('workout-1', true)
    expect(inserted).toEqual([
      {
        table: 'workout_likes',
        payload: { user_id: 'user-b', workout_id: 'workout-1' },
      },
    ])
  })

  it('treats a duplicate like as success', async () => {
    insertError = { code: '23505' }
    await expect(setLiked('workout-1', true)).resolves.toBeUndefined()
  })

  it('unliking filters by workout and lets RLS scope the owner', async () => {
    // The delete deliberately does not filter on user_id: the policy already
    // restricts it to your own rows, and a client-side owner filter would be
    // a second rule to keep in step with the first.
    await setLiked('workout-1', false)
    expect(inserted).toHaveLength(0)
    expect(deleted).toEqual([
      { table: 'workout_likes', filters: [['workout_id', 'workout-1']] },
    ])
  })
})
