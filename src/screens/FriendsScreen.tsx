import { useCallback, useEffect, useState, useRef } from 'react'
import { useLocale } from '../lib/locale-context'
import { useUnit } from '../lib/unit-context'
import { formatWeight } from '../lib/units'
import {
  formatCount,
  formatDuration,
  formatRelativeDay,
  formatVolume,
} from '../lib/format'
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
import { IconBack, IconHeart } from '../components/icons'

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

/**
 * Design v2.1 screen 03 puts the leaderboard and the feed on ONE surface, with
 * Invite in the header — the week's standing, then what everyone did. The tab
 * strip that was here split a single answer across two taps.
 *
 * `You` (visibility, username, follow, invite link, sign out) becomes a
 * sub-view rather than a peer panel: it is where you go to change something,
 * not something you read.
 */
type Panel = 'main' | 'you'

export function FriendsScreen({ userId }: { userId: string }) {
  const { t } = useLocale()
  /**
   * `t` changes identity with the locale, and the effect below fetches.
   * Adding it to the deps would re-run that load on every language toggle.
   * Assigned in an effect, not during render: `react-hooks/refs` rejects a
   * render-time ref write.
   */
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])
  const { unit } = useUnit()
  const [panel, setPanel] = useState<Panel>('main')

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
        setError(e instanceof Error ? e.message : tRef.current('friends.load_error'))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [userId, reloadToken])

  if (loading) return <p className="py-10 text-sm text-muted">{t('friends.loading')}</p>

  return (
    <div className="flex flex-col gap-4 py-3">
      {error && (
        <p
          role="alert"
          className="ring-edge border border-accent px-3 py-2 text-sm text-soft"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          {error}
        </p>
      )}

      {panel === 'you' ? (
        <>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPanel('main')}
              aria-label={t('friends.you.back')}
              className="btn-base btn-quiet h-12 w-12"
            >
              <IconBack size={20} />
            </button>
            <h2 className="flex-1 text-base font-medium">{t('friends.you')}</h2>
          </div>
          <You
            userId={userId}
            profile={profile}
            following={following}
            onChanged={reload}
            onError={setError}
          />
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <h2 className="kicker flex-1">{t('friends.main_title')}</h2>
            <button
              type="button"
              onClick={() => setPanel('you')}
              className="btn-base btn-quiet h-10 px-3 text-[13px]"
            >
              You
            </button>
          </div>

          <Leaderboard rows={board} unit={unit} />

          <Feed
            rows={feed}
            unit={unit}
            following={following.length}
            onError={setError}
            onInvite={() => setPanel('you')}
          />
        </>
      )}
    </div>
  )
}

/* ── Feed ─────────────────────────────────────────────────────────────── */

/** Initial tile — the same fallback the exercise picker uses, for a person. */
function InitialTile({ name, size = 40 }: { name: string; size?: number }) {
  const letter = name.replace(/^@/, '').charAt(0).toUpperCase() || '?'
  // A stable step per name, so the same person is always the same tone. Five
  // neutral steps, never a hue — §2.4 allows exactly one accent.
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const step = (hash % 4) + 1
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-[6px] font-medium text-text/80"
      style={{
        width: size,
        height: size,
        backgroundColor: `var(--color-tile-${step})`,
        fontSize: size * 0.4,
      }}
    >
      {letter}
    </span>
  )
}

function Feed({
  rows,
  unit,
  following,
  onError,
  onInvite,
}: {
  rows: FeedRow[]
  unit: 'lbs' | 'kg'
  following: number
  onError: (message: string | null) => void
  onInvite: () => void
}) {
  const { t } = useLocale()
  // Likes are optimistic. The write is small, the failure is recoverable, and
  // a like that waits for a round trip feels broken on gym wifi.
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
      onError(e instanceof Error ? e.message : t('friends.feed.error.save'))
    }
  }

  if (rows.length === 0) {
    return (
      <section>
        <h2 className="kicker mb-2">{t('friends.feed')}</h2>
        <p className="text-sm text-muted">
          {following === 0
            ? t('friends.feed.empty.nobody')
            : t('friends.feed.empty.pending')}
        </p>
        {following === 0 && (
          <button
            type="button"
            onClick={onInvite}
            className="btn-base btn-hero mt-3 h-[60px] w-full text-[17px]"
          >
            {t('friends.feed.invite')}
          </button>
        )}
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="kicker">{t('friends.feed')}</h2>
      {rows.map((row) => {
        const like = likes[row.workout_id] ?? {
          liked: row.liked_by_me,
          count: row.like_count,
        }
        return (
          <article
            key={row.workout_id}
            className="ring-edge bg-surface px-3 py-3"
            style={{ borderRadius: 'var(--radius-md)' }}
          >
            <div className="flex items-center gap-2.5">
              <InitialTile name={nameOf(row)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {nameOf(row)}
                  {row.name?.trim() ? ` · ${row.name.trim()}` : ''}
                </p>
                <p className="text-[11px] text-muted">
                  {formatRelativeDay(row.started_at)}
                </p>
              </div>
              {/* Only when a record actually fell. A badge that is always
                  there stops meaning anything. */}
              {row.record_count > 0 && (
                <span className="tag-pr h-[22px] shrink-0">
                  {row.record_count === 1
                    ? t('friends.feed.pr_single')
                    : t('friends.feed.pr_many', {
                        count: String(row.record_count),
                      })}
                </span>
              )}
            </div>

            <div className="mt-2.5 flex items-stretch">
              <FeedStat
                label={t('friends.feed.duration')}
                value={formatDuration(row.started_at, row.ended_at)}
              />
              <span aria-hidden="true" className="w-px shrink-0 bg-[var(--divider)]" />
              <FeedStat
                label={t('friends.feed.volume')}
                value={formatVolume(row.volume_kg, unit)}
              />
              <span aria-hidden="true" className="w-px shrink-0 bg-[var(--divider)]" />
              <FeedStat
                label={t('friends.feed.sets')}
                value={formatCount(row.set_count)}
              />
            </div>

            {/* The fact line quotes the session's best moment — computed in
                SQL, never phrased by a model, and never per-set data. */}
            {row.best_record_name && row.best_record_e1rm_kg !== null && (
              <p className="mt-2.5 text-[13px] text-accent-300">
                {t('friends.feed.new_e1rm', {
                  name: row.best_record_name,
                  weight: formatWeight(row.best_record_e1rm_kg, unit),
                })}
              </p>
            )}

            <button
              type="button"
              onClick={() => void toggle(row)}
              aria-pressed={like.liked}
              aria-label={
                like.liked ? t('friends.feed.unlike') : t('friends.feed.like')
              }
              className={`mt-1 flex h-12 items-center gap-2 ${
                // `text-accent`, not `text-soft`, and it is the exception to the
                // sweep: this colours a 20px FILLED icon, not text. Ember is
                // the fill tier; soft is the small-text tier.
                like.liked ? 'text-accent' : 'text-muted'
              }`}
            >
              <IconHeart size={20} filled={like.liked} />
              {like.count > 0 && (
                <span className="tnum font-mono text-[13px]">{like.count}</span>
              )}
            </button>
          </article>
        )
      })}
    </section>
  )
}

function FeedStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1">
      <span className="tnum truncate text-[17px] font-medium leading-none">
        {value}
      </span>
      <span className="text-[11px] text-muted">{label}</span>
    </div>
  )
}

/* ── Leaderboard ──────────────────────────────────────────────────────── */

function Leaderboard({ rows, unit }: { rows: LeaderRow[]; unit: 'lbs' | 'kg' }) {
  const { t } = useLocale()
  return (
    <section
      className="ring-edge overflow-hidden bg-surface"
      style={{ borderRadius: 'var(--radius-md)' }}
    >
      {/* The screen's one knurl: a 6px crown on the leaderboard card. */}
      <span aria-hidden="true" className="knurl block h-[6px] w-full" />
      <div className="px-3 py-2.5">
        {rows.length <= 1 ? (
          <p className="text-sm text-muted">{t('friends.leaderboard.empty')}</p>
        ) : (
          <ol>
            {rows.map((row, i) => (
              <li key={row.user_id}>
                {i > 0 && <div className="rule-solid" />}
                <div
                  className={`flex items-center gap-3 py-2 ${
                    // Your row is tinted, not moved. A leaderboard that pins
                    // you to the top is not a leaderboard.
                    row.is_me ? 'record-row -mx-1.5 rounded-[6px] px-1.5' : ''
                  }`}
                >
                  <span
                    className={`tnum w-4 shrink-0 font-mono text-xs ${
                      row.is_me ? 'text-soft' : 'text-muted'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {row.is_me ? t('friends.leaderboard.you') : nameOf(row)}
                  </span>
                  <span className="tnum shrink-0 text-[15px] font-medium">
                    {formatVolume(row.volume_kg, unit)}
                  </span>
                  <span className="tnum w-16 shrink-0 text-end text-[11px] text-muted">
                    {t(
                      row.session_count === 1
                        ? 'friends.leaderboard.sessions.one'
                        : 'friends.leaderboard.sessions.other',
                      { count: formatCount(row.session_count) },
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

/* ── You ──────────────────────────────────────────────────────────────── */

// Keys, not strings: module scope cannot call a hook, so the catalogue lookup
// happens at the render site. Same shape as the label maps in ProgressScreen.
const VISIBILITY: { id: Visibility; labelKey: string; blurbKey: string }[] = [
  {
    id: 'private',
    labelKey: 'friends.visibility.private',
    blurbKey: 'friends.visibility.private.blurb',
  },
  {
    id: 'followers',
    labelKey: 'friends.visibility.followers',
    blurbKey: 'friends.visibility.followers.blurb',
  },
  {
    id: 'public',
    labelKey: 'friends.visibility.public',
    blurbKey: 'friends.visibility.public.blurb',
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
  const { t } = useLocale()
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
      onError(e instanceof Error ? e.message : t('friends.username.error'))
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
      onError(e instanceof Error ? e.message : t('friends.username.error'))
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
      onError(e instanceof Error ? e.message : t('friends.follow.error'))
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
      onError(e instanceof Error ? e.message : t('friends.invite.error'))
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
        <h2 className="kicker mb-2">{t('friends.visibility.title')}</h2>
        <div className="flex flex-col gap-2">
          {VISIBILITY.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={visibility === v.id}
              disabled={busy}
              onClick={() => void setVisibility(v.id)}
              className={`ring-edge flex min-h-[60px] flex-col justify-center px-3 py-2 text-start ${
                visibility === v.id ? 'bg-surface text-soft' : 'text-text'
              }`}
              style={{
                borderRadius: 'var(--radius-md)',
                boxShadow:
                  visibility === v.id
                    ? 'inset 0 0 0 1px var(--color-accent)'
                    : undefined,
              }}
            >
              <span className="text-sm font-medium">{t(v.labelKey)}</span>
              <span className="mt-0.5 text-[13px] text-muted">{t(v.blurbKey)}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">{t('friends.visibility.note')}</p>
      </section>

      <section>
        <h2 className="kicker mb-2">{t('friends.username.title')}</h2>
        <div className="flex items-center gap-2">
          <input
            id="username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value)
              setSaved(false)
            }}
            placeholder={t('friends.username.placeholder')}
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
            {saved ? t('friends.username.saved') : t('friends.username.save')}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-muted">{t('friends.username.hint')}</p>
      </section>

      <section>
        <h2 className="kicker mb-2">{t('friends.follow.title')}</h2>
        <div className="flex items-center gap-2">
          <input
            id="follow"
            value={followName}
            onChange={(e) => setFollowName(e.target.value)}
            placeholder={t('friends.follow.placeholder')}
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
            {t('friends.follow.button')}
          </button>
        </div>
      </section>

      <section>
        <h2 className="kicker mb-2">{t('friends.invite.title')}</h2>
        {!shareable ? (
          <p className="text-sm text-muted">{t('friends.invite.not_shareable')}</p>
        ) : !invite ? (
          <button
            type="button"
            onClick={() => void makeInvite()}
            disabled={busy}
            className="btn-base btn-secondary h-12 px-4 text-sm disabled:opacity-45"
          >
            {t('friends.invite.get_link')}
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
              {copied ? t('friends.invite.copied') : t('friends.invite.share')}
            </button>
          </>
        )}
      </section>

      {following.length > 0 && (
        <section>
          <h2 className="kicker mb-2">
            {t('friends.following.title', { count: String(following.length) })}
          </h2>

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
                            e instanceof Error
                              ? e.message
                              : t('friends.unfollow.error'),
                          ),
                        )
                    }
                    className="btn-base btn-quiet h-12 px-3 text-[13px]"
                  >
                    {t('friends.unfollow')}
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
  const { t } = useLocale()
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
        {armed ? t('friends.signout.confirm') : t('friends.signout')}
      </button>
    </section>
  )
}
