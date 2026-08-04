import { useCallback, useEffect, useState } from 'react'
import { useUnit } from '../lib/unit-context'
import { formatWeight } from '../lib/units'
import { formatDuration, formatRelativeDay } from '../lib/format'
import {
  fetchFeed,
  fetchFollowing,
  fetchLeaderboard,
  fetchMyProfile,
  followByUsername,
  getOrCreateInvite,
  inviteUrl,
  nameOf,
  saveProfile,
  setLiked,
  unfollow,
  type FeedRow,
  type LeaderRow,
  type Profile,
  type Visibility,
} from '../lib/social'
import { supabase } from '../lib/supabase'
import { IconPlate } from '../components/icons'

/**
 * Stage 3, on one screen.
 *
 * A fourth tab is a deviation from "three screens, no router" and it is
 * recorded in DECISIONS.md. The short version: a feed is a place you go, which
 * is precisely what routines were not, and hanging it off Log would put other
 * people's training on the screen you open mid-set.
 *
 * Profile setup lives here too rather than in a settings screen — §Scope
 * forbids one, and the only settings Stage 3 introduces are the ones this
 * screen exists to use.
 */

type Panel = 'feed' | 'board' | 'you'

const PANELS: { id: Panel; label: string }[] = [
  { id: 'feed', label: 'Feed' },
  { id: 'board', label: 'This week' },
  { id: 'you', label: 'You' },
]

export function FriendsScreen({ userId }: { userId: string }) {
  const { unit } = useUnit()
  const [panel, setPanel] = useState<Panel>('feed')

  const [profile, setProfile] = useState<Profile | null>(null)
  const [feed, setFeed] = useState<FeedRow[]>([])
  const [board, setBoard] = useState<LeaderRow[]>([])
  const [following, setFollowing] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Refreshing is a token bump rather than a callback the effect depends on.
  // `eslint-plugin-react-hooks` v7 forbids synchronous setState inside an
  // effect (see CLAUDE.md), and an async loader called from the effect body
  // reads as exactly that to the rule — correctly, since the loader's whole
  // job is setState. The IIFE with an `active` guard is the shape the other
  // screens already use.
  const [reloadToken, setReloadToken] = useState(0)
  const reload = useCallback(() => setReloadToken((n) => n + 1), [])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const [me, rows, leaders, follows] = await Promise.all([
          fetchMyProfile(userId),
          fetchFeed(),
          fetchLeaderboard(),
          fetchFollowing(userId),
        ])
        if (!active) return
        setProfile(me)
        setFeed(rows)
        setBoard(leaders)
        setFollowing(follows)
      } catch (e) {
        if (!active) return
        setError(e instanceof Error ? e.message : 'Could not load this.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [userId, reloadToken])

  if (loading) return <p className="py-10 text-sm text-muted">Loading…</p>

  return (
    <div className="flex flex-col gap-4 py-3">
      {error && (
        <p
          role="alert"
          className="ring-edge border border-accent px-3 py-2 text-sm text-accent"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          {error}
        </p>
      )}

      <div
        className="flex w-full overflow-hidden"
        style={{ border: '1px solid var(--divider)', borderRadius: 'var(--radius-md)' }}
        role="tablist"
      >
        {PANELS.map((p, i) => {
          const on = p.id === panel
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setPanel(p.id)}
              className={`h-12 flex-1 text-sm ${on ? 'font-medium text-accent' : 'text-muted'}`}
              style={{
                boxShadow: on ? 'inset 0 0 0 1px var(--color-accent)' : undefined,
                borderInlineStart: i > 0 ? '1px solid var(--divider)' : undefined,
              }}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      {panel === 'feed' && (
        <Feed rows={feed} unit={unit} following={following.length} onError={setError} />
      )}
      {panel === 'board' && <Leaderboard rows={board} unit={unit} />}
      {panel === 'you' && (
        <You
          userId={userId}
          profile={profile}
          following={following}
          onChanged={reload}
          onError={setError}
        />
      )}
    </div>
  )
}

/* ── Feed ─────────────────────────────────────────────────────────────── */

function Feed({
  rows,
  unit,
  following,
  onError,
}: {
  rows: FeedRow[]
  unit: 'lbs' | 'kg'
  following: number
  onError: (message: string | null) => void
}) {
  // Likes are optimistic. The write is small, the failure is recoverable, and
  // a heart that waits for a round trip feels broken on gym wifi.
  const [likes, setLikes] = useState<Record<string, { liked: boolean; count: number }>>(
    {},
  )

  async function toggle(row: FeedRow) {
    const current = likes[row.workout_id] ?? {
      liked: row.liked_by_me,
      count: row.like_count,
    }
    const next = {
      liked: !current.liked,
      count: current.count + (current.liked ? -1 : 1),
    }
    setLikes((prev) => ({ ...prev, [row.workout_id]: next }))
    try {
      await setLiked(row.workout_id, next.liked)
    } catch (e) {
      setLikes((prev) => ({ ...prev, [row.workout_id]: current }))
      onError(e instanceof Error ? e.message : 'Could not save that.')
    }
  }

  if (rows.length === 0) {
    return (
      <p className="py-6 text-sm text-muted">
        {following === 0
          ? 'Nothing here yet. Follow someone on the You tab — by username, or send them your invite link.'
          : 'Nobody you follow has finished a workout yet. It shows up here when they do.'}
      </p>
    )
  }

  return (
    <ul>
      {rows.map((row, i) => {
        const like = likes[row.workout_id] ?? {
          liked: row.liked_by_me,
          count: row.like_count,
        }
        return (
          <li key={row.workout_id}>
            {i > 0 && <div className="rule-fade" />}
            <div className="py-3">
              <p className="kicker">
                {nameOf(row)} · {formatRelativeDay(row.started_at)}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-base font-medium">
                  {row.name?.trim() || 'Workout'}
                </p>
                {row.record_count > 0 && (
                  <span className="tag-pr h-[22px] shrink-0">
                    {row.record_count === 1 ? 'PR' : `${row.record_count} PR`}
                  </span>
                )}
              </div>
              <p className="tnum mt-0.5 text-[13px] text-muted">
                {formatDuration(row.started_at, row.ended_at)} ·{' '}
                {formatWeight(row.volume_kg, unit)} · {row.set_count}{' '}
                {row.set_count === 1 ? 'set' : 'sets'}
              </p>

              <button
                type="button"
                onClick={() => void toggle(row)}
                aria-pressed={like.liked}
                aria-label={like.liked ? 'Remove your like' : 'Like this workout'}
                className={`mt-1.5 flex h-12 items-center gap-2 ${
                  like.liked ? 'text-accent' : 'text-muted'
                }`}
              >
                <IconPlate size={20} filled={like.liked} />
                {like.count > 0 && <span className="tnum text-sm">{like.count}</span>}
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/* ── Leaderboard ──────────────────────────────────────────────────────── */

function Leaderboard({ rows, unit }: { rows: LeaderRow[]; unit: 'lbs' | 'kg' }) {
  if (rows.length <= 1) {
    return (
      <p className="py-6 text-sm text-muted">
        A leaderboard needs someone to stand next to. Follow a friend and this fills in.
      </p>
    )
  }

  return (
    <section>
      <h2 className="kicker mb-2">Volume this week</h2>
      <ol>
        {rows.map((row, i) => (
          <li key={row.user_id}>
            {i > 0 && <div className="rule-fade" />}
            <div
              className={`flex items-center gap-3 py-2.5 ${
                // Your own row is tinted, not moved. A leaderboard that pins
                // you to the top is not a leaderboard.
                row.is_me ? 'record-row -mx-1.5 rounded-[6px] px-1.5' : ''
              }`}
            >
              <span className="tnum w-5 shrink-0 font-mono text-[13px] text-muted">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {row.is_me ? 'You' : nameOf(row)}
              </span>
              <span className="tnum shrink-0 text-figure">
                {formatWeight(row.volume_kg, unit)}
              </span>
              <span className="tnum w-14 shrink-0 text-end text-[13px] text-muted">
                {row.session_count} {row.session_count === 1 ? 'session' : 'sessions'}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/* ── You ──────────────────────────────────────────────────────────────── */

const VISIBILITY: { id: Visibility; label: string; blurb: string }[] = [
  {
    id: 'private',
    label: 'Private',
    blurb: 'Nobody can find you or see your training.',
  },
  {
    id: 'followers',
    label: 'Followers',
    blurb: 'People can find you and ask to follow. Followers see finished workouts.',
  },
  {
    id: 'public',
    label: 'Public',
    blurb: 'Any signed-in Wazn user can see finished workouts.',
  },
]

function You({
  userId,
  profile,
  following,
  onChanged,
  onError,
}: {
  userId: string
  profile: Profile | null
  following: Profile[]
  onChanged: () => void
  onError: (message: string | null) => void
}) {
  const [username, setUsername] = useState(profile?.username ?? '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [followName, setFollowName] = useState('')
  const [invite, setInvite] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const visibility = profile?.visibility ?? 'private'
  const shareable = visibility !== 'private'

  async function saveUsername() {
    setBusy(true)
    onError(null)
    try {
      await saveProfile(userId, { username })
      setSaved(true)
      onChanged()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  async function setVisibility(next: Visibility) {
    setBusy(true)
    onError(null)
    try {
      await saveProfile(userId, { visibility: next })
      onChanged()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  async function doFollow() {
    setBusy(true)
    onError(null)
    try {
      await followByUsername(followName)
      setFollowName('')
      onChanged()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not follow that person.')
    } finally {
      setBusy(false)
    }
  }

  async function makeInvite() {
    setBusy(true)
    onError(null)
    try {
      setInvite(inviteUrl(await getOrCreateInvite(userId)))
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not create a link.')
    } finally {
      setBusy(false)
    }
  }

  async function copyInvite() {
    if (!invite) return
    try {
      if (navigator.share) await navigator.share({ url: invite, title: 'Wazn' })
      else await navigator.clipboard.writeText(invite)
      setCopied(true)
    } catch {
      /* the user dismissed the share sheet; not a failure */
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h2 className="kicker mb-2">Who can see your training</h2>
        <div className="flex flex-col gap-2">
          {VISIBILITY.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={visibility === v.id}
              disabled={busy}
              onClick={() => void setVisibility(v.id)}
              className={`ring-edge flex min-h-[60px] flex-col justify-center px-3 py-2 text-start ${
                visibility === v.id ? 'bg-surface text-accent' : 'text-text'
              }`}
              style={{
                borderRadius: 'var(--radius-md)',
                boxShadow:
                  visibility === v.id
                    ? 'inset 0 0 0 1px var(--color-accent)'
                    : undefined,
              }}
            >
              <span className="text-sm font-medium">{v.label}</span>
              <span className="mt-0.5 text-[13px] text-muted">{v.blurb}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Private is the default and stays that way until you change it. An in-progress
          workout is never shown to anyone, at any setting.
        </p>
      </section>

      <section>
        <h2 className="kicker mb-2">Your username</h2>
        <div className="flex items-center gap-2">
          <input
            id="username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value)
              setSaved(false)
            }}
            placeholder="ameen"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="ring-edge h-12 min-w-0 flex-1 bg-surface px-3 text-base"
            style={{ borderRadius: 'var(--radius-md)' }}
          />
          <button
            type="button"
            onClick={() => void saveUsername()}
            disabled={busy || !username.trim()}
            className="btn-base btn-secondary h-12 px-4 text-sm disabled:opacity-45"
          >
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-muted">
          Lowercase letters, numbers and underscores. 3–20 characters. This is how
          friends find you.
        </p>
      </section>

      <section>
        <h2 className="kicker mb-2">Follow someone</h2>
        <div className="flex items-center gap-2">
          <input
            id="follow"
            value={followName}
            onChange={(e) => setFollowName(e.target.value)}
            placeholder="@username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="ring-edge h-12 min-w-0 flex-1 bg-surface px-3 text-base"
            style={{ borderRadius: 'var(--radius-md)' }}
          />
          <button
            type="button"
            onClick={() => void doFollow()}
            disabled={busy || !followName.trim()}
            className="btn-base btn-secondary h-12 px-4 text-sm disabled:opacity-45"
          >
            Follow
          </button>
        </div>
      </section>

      <section>
        <h2 className="kicker mb-2">Invite link</h2>
        {!shareable ? (
          <p className="text-sm text-muted">
            Turn on Followers or Public above to get a link. A private profile has
            nothing to invite anyone to.
          </p>
        ) : !invite ? (
          <button
            type="button"
            onClick={() => void makeInvite()}
            disabled={busy}
            className="btn-base btn-secondary h-12 px-4 text-sm disabled:opacity-45"
          >
            Get my link
          </button>
        ) : (
          <>
            <p
              className="ring-edge break-all bg-surface px-3 py-2 font-mono text-[13px]"
              style={{ borderRadius: 'var(--radius-md)' }}
            >
              {invite}
            </p>
            <button
              type="button"
              onClick={() => void copyInvite()}
              className="btn-base btn-secondary mt-2 h-12 px-4 text-sm"
            >
              {copied ? 'Copied' : 'Share'}
            </button>
          </>
        )}
      </section>

      {following.length > 0 && (
        <section>
          <h2 className="kicker mb-2">Following · {following.length}</h2>

          <ul>
            {following.map((p, i) => (
              <li key={p.id}>
                {i > 0 && <div className="rule-fade" />}
                <div className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{nameOf(p)}</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void unfollow(p.id)
                        .then(onChanged)
                        .catch((e: unknown) =>
                          onError(
                            e instanceof Error ? e.message : 'Could not unfollow.',
                          ),
                        )
                    }
                    className="btn-base btn-quiet h-12 px-3 text-[13px]"
                  >
                    Unfollow
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SignOut />
    </div>
  )
}

/**
 * Sign out, at the bottom of the You panel.
 *
 * It already existed behind the header's ⋯ menu, and it stays there — but
 * Ameen went looking for it and could not find it, which is the only evidence
 * that matters about whether an affordance is discoverable. "Account settings
 * are at the bottom of the account screen" is where a phone user's hand goes
 * without being told.
 *
 * Two taps, disarming after four seconds, matching Finish and routine Delete.
 * Signing out mid-workout would not lose a set — every set is already in
 * Postgres — but it would put a code entry between someone and their next one.
 */
function SignOut() {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const id = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(id)
  }, [armed])

  return (
    <section className="pt-2">
      <div className="rule-fade mb-4" />
      <button
        type="button"
        onClick={() => {
          if (armed) void supabase.auth.signOut()
          else setArmed(true)
        }}
        className={`btn-base h-12 w-full px-4 text-sm ${
          armed ? 'btn-primary' : 'btn-secondary'
        }`}
      >
        {armed ? 'Sign out?' : 'Sign out'}
      </button>
    </section>
  )
}
