import { describeError, supabase } from './supabase'

/**
 * The client half of Stage 3.
 *
 * Every visibility decision in here is made by the database, not by this file.
 * These functions ask for rows; RLS decides which ones come back. There is no
 * `if (profile.visibility === …)` anywhere in the client, on purpose — that is
 * exactly the "never client-side" the plan asks for, and a filter written here
 * would be a second rule to keep in step with the first.
 */

/**
 * The owning column on every social write.
 *
 * `follows.follower_id` and `workout_likes.user_id` are NOT NULL with no
 * database default, and the inserts below used to omit them — so every follow
 * and every like this app has ever attempted was refused, while
 * `supabase/tests/rls_social.sql` passed because it writes both columns in
 * raw SQL. Policies were tested; the client's actual payload never was.
 *
 * `getSession()` reads the locally stored session — no network hop, so this
 * costs nothing on a screen that already has a session.
 */
async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user.id
  if (!id) throw new Error('Your sign-in expired. Sign in again to continue.')
  return id
}

export type Visibility = 'private' | 'followers' | 'public'

export interface Profile {
  id: string
  username: string | null
  display_name: string | null
  visibility: Visibility
}

export interface FeedRow {
  workout_id: string
  user_id: string
  username: string | null
  display_name: string | null
  name: string | null
  started_at: string
  ended_at: string
  volume_kg: number
  set_count: number
  record_count: number
  like_count: number
  liked_by_me: boolean
  /** The session's best record, for the feed card's fact line. */
  best_record_name: string | null
  best_record_e1rm_kg: number | null
}

export interface LeaderRow {
  user_id: string
  username: string | null
  display_name: string | null
  volume_kg: number
  session_count: number
  is_me: boolean
}

function n(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : (value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function fetchMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, visibility')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error(describeError('Loading your profile', error))
  return (data as Profile) ?? null
}

/**
 * Usernames are stored lowercase and the database enforces it with a check
 * constraint, so the client lowercases before writing rather than discovering
 * the constraint at the end of a form.
 */
export async function saveProfile(
  userId: string,
  patch: {
    username?: string | null
    display_name?: string | null
    visibility?: Visibility
  },
): Promise<void> {
  const body: Record<string, unknown> = { ...patch }
  if (typeof patch.username === 'string') {
    body.username = patch.username.trim().toLowerCase() || null
  }
  const { error } = await supabase.from('profiles').update(body).eq('id', userId)
  if (error) {
    // 23505 is the unique index on username. "already taken" is the only
    // useful thing to say about it, and PostgREST's own message is not that.
    if ((error as { code?: string }).code === '23505') {
      throw new Error('That username is taken. Try another.')
    }
    throw new Error(describeError('Saving your profile', error))
  }
}

export async function fetchFeed(before?: string): Promise<FeedRow[]> {
  const { data, error } = await supabase.rpc('social_feed', {
    p_limit: 30,
    p_before: before ?? null,
  })
  if (error) throw new Error(describeError('Loading the feed', error))
  return ((data ?? []) as FeedRow[]).map((row) => ({
    ...row,
    volume_kg: n(row.volume_kg),
    set_count: n(row.set_count),
    record_count: n(row.record_count),
    like_count: n(row.like_count),
    best_record_e1rm_kg:
      row.best_record_e1rm_kg === null ? null : n(row.best_record_e1rm_kg),
  }))
}

export async function fetchLeaderboard(): Promise<LeaderRow[]> {
  const { data, error } = await supabase.rpc('weekly_leaderboard')
  if (error) throw new Error(describeError('Loading the leaderboard', error))
  return ((data ?? []) as LeaderRow[]).map((row) => ({
    ...row,
    volume_kg: n(row.volume_kg),
    session_count: n(row.session_count),
  }))
}

/**
 * Two queries rather than one embedded select.
 *
 * PostgREST can join these in a single request, but naming the join means
 * naming the foreign-key constraint (`follows_following_id_fkey`) in client
 * code — a string that lives in a migration, is not checked by anything here,
 * and breaks the follow list silently if a future migration recreates the
 * table. Two round trips on a screen nobody opens mid-set is the cheaper side
 * of that trade.
 */
export async function fetchFollowing(userId: string): Promise<Profile[]> {
  const { data: edges, error } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId)
  if (error) throw new Error(describeError('Loading who you follow', error))

  const ids = ((edges ?? []) as { following_id: string }[]).map((e) => e.following_id)
  if (ids.length === 0) return []

  const { data, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, display_name, visibility')
    .in('id', ids)
  if (profileError) {
    throw new Error(describeError('Loading who you follow', profileError))
  }
  return (data ?? []) as Profile[]
}

/**
 * Follow by username.
 *
 * The lookup can come back empty for two different reasons — no such user, or
 * a private profile that RLS will not show you — and they are deliberately
 * reported the same way. Distinguishing them would turn this box into a
 * "does this person use Wazn" oracle for private accounts.
 */
export async function followByUsername(username: string): Promise<Profile> {
  const clean = username.trim().toLowerCase().replace(/^@/, '')
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, visibility')
    .eq('username', clean)
    .maybeSingle()
  if (error) throw new Error(describeError('Looking up that username', error))
  if (!data) throw new Error(`No one found at @${clean}.`)

  const profile = data as Profile
  const { error: followError } = await supabase
    .from('follows')
    .insert({ follower_id: await currentUserId(), following_id: profile.id })
  if (followError) {
    if ((followError as { code?: string }).code === '23505') {
      throw new Error(`You already follow @${clean}.`)
    }
    throw new Error(describeError('Following that person', followError))
  }
  return profile
}

export async function follow(userId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: await currentUserId(), following_id: userId })
  // 23505 is "already following", which is the state the caller wanted.
  if (!error || (error as { code?: string }).code === '23505') return

  // 42501 here means `is_discoverable(following_id)` refused: the person is
  // still on the default 'private' visibility, so nobody can follow them —
  // including someone holding their own invite link. Saying so is the
  // difference between a dead end and a fixable one, and the follower already
  // knows who they are.
  if ((error as { code?: string }).code === '42501') {
    throw new Error(
      'They are not accepting followers yet. Ask them to set their profile to ' +
        'Followers or Public on their Friends tab, then tap this again.',
    )
  }
  throw new Error(describeError('Following that person', error))
}

export async function unfollow(userId: string): Promise<void> {
  const { error } = await supabase.from('follows').delete().eq('following_id', userId)
  if (error) throw new Error(describeError('Unfollowing', error))
}

export async function setLiked(workoutId: string, liked: boolean): Promise<void> {
  if (liked) {
    const { error } = await supabase
      .from('workout_likes')
      .insert({ user_id: await currentUserId(), workout_id: workoutId })
    if (error && (error as { code?: string }).code !== '23505') {
      throw new Error(describeError('Liking that workout', error))
    }
  } else {
    const { error } = await supabase
      .from('workout_likes')
      .delete()
      .eq('workout_id', workoutId)
    if (error) throw new Error(describeError('Removing your like', error))
  }
}

/** Lowercase alphanumeric, matching the `invites_code_check` constraint. */
function newCode(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

/**
 * One invite code per person, reused. A new code per share would leave a trail
 * of live links nobody can account for; one code means "revoke my invite link"
 * is a single delete.
 */
export async function getOrCreateInvite(userId: string): Promise<string> {
  const { data } = await supabase
    .from('invites')
    .select('code')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (data?.code) return data.code as string

  const code = newCode()
  const { error } = await supabase.from('invites').insert({ user_id: userId, code })
  if (error) throw new Error(describeError('Creating your invite link', error))
  return code
}

export function inviteUrl(code: string): string {
  return `${window.location.origin}/join/${code}`
}

export interface Inviter {
  user_id: string
  username: string | null
  display_name: string | null
}

export async function resolveInvite(code: string): Promise<Inviter | null> {
  const { data, error } = await supabase.rpc('resolve_invite', { p_code: code })
  if (error) return null
  const rows = (data ?? []) as Inviter[]
  return rows[0] ?? null
}

/** What to call someone, in the order the data is likely to be there. */
export function nameOf(p: {
  username?: string | null
  display_name?: string | null
}): string {
  if (p.display_name?.trim()) return p.display_name.trim()
  if (p.username) return `@${p.username}`
  return 'Someone'
}
