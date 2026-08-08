import { useEffect, useState } from 'react'
import { takeInviteCode } from '../lib/invite'
import { follow, resolveInvite, nameOf, saveProfile, type Inviter } from '../lib/social'
import { USERNAME_RE, normalizeUsername } from '../lib/auth-identity'
import { useAuth } from '../lib/use-auth'

/**
 * The first screen after a brand-new account signs in.
 *
 * Plan Block 3 asks for: land → OTP → follow the inviter → pick or generate a
 * routine. The OTP half is `AuthScreen`; this is everything after it.
 *
 * It only appears for someone with nothing — no workouts, no routines. A
 * returning user never sees it, and there is no way to get back to it, because
 * an onboarding screen you can revisit is a settings screen with a friendly
 * face (§Scope forbids one).
 *
 * The follow happens here rather than at sign-in because it needs a session,
 * and because the person should be able to see who they are about to follow.
 * An invite that silently connected two accounts would be the app deciding
 * something on their behalf.
 */
export function Welcome({
  onGenerate,
  onSkip,
  onImport,
}: {
  onGenerate: () => void
  onSkip: () => void
  /** Offered only to a switcher — see the section this renders. */
  onImport: () => void
}) {
  const [inviter, setInviter] = useState<Inviter | null>(null)
  const [followed, setFollowed] = useState(false)
  const [followError, setFollowError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { userId } = useAuth()
  const [username, setUsername] = useState('')
  const [usernameSaved, setUsernameSaved] = useState<string | null>(null)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [savingUsername, setSavingUsername] = useState(false)

  useEffect(() => {
    let active = true
    void (async () => {
      const code = takeInviteCode()
      if (!code) return
      const found = await resolveInvite(code)
      if (active) setInviter(found)
    })()
    return () => {
      active = false
    }
  }, [])

  async function claimUsername() {
    if (!userId) return
    const clean = normalizeUsername(username)
    if (!USERNAME_RE.test(clean)) {
      setUsernameError('3–20 characters: letters, numbers, underscores.')
      return
    }
    setSavingUsername(true)
    setUsernameError(null)
    try {
      await saveProfile(userId, { username: clean })
      setUsernameSaved(clean)
    } catch (caught) {
      setUsernameError(
        caught instanceof Error ? caught.message : 'Could not save that username.',
      )
    } finally {
      setSavingUsername(false)
    }
  }

  async function acceptInvite() {
    if (!inviter) return
    setBusy(true)
    setFollowError(null)
    try {
      await follow(inviter.user_id)
      setFollowed(true)
    } catch (caught) {
      // This used to swallow the failure to keep the first screen calm, and
      // that decision hid a real defect for as long as the feature has
      // existed: every follow was being refused, and the button simply did
      // nothing. A button that does nothing is worse than an error — the user
      // taps it again, then decides the app is broken. Say what happened.
      setFollowed(false)
      setFollowError(
        caught instanceof Error
          ? caught.message
          : 'That did not go through. You can follow them from the Friends tab.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 py-6">
      <div>
        <p className="kicker">Welcome</p>
        <h1 className="mt-1 text-[26px] font-semibold leading-tight">
          Log a set in under thirty seconds.
        </h1>
        <p className="mt-2 text-sm text-muted">
          That is the whole idea. Everything else in here exists to stay out of the way
          while you do it.
        </p>
      </div>

      {inviter && (
        <section
          className="ring-edge bg-surface px-3 py-3"
          style={{ borderRadius: 'var(--radius-md)' }}
        >
          <p className="kicker mb-1">You were invited</p>
          <p className="text-[15px] font-medium">{nameOf(inviter)}</p>
          <p className="mt-0.5 text-sm text-muted">
            Follow them to see their finished workouts and share a weekly leaderboard.
            Your own training stays private until you change that on the Friends tab.
          </p>
          <button
            type="button"
            onClick={() => void acceptInvite()}
            disabled={busy || followed}
            className={`btn-base mt-2.5 h-12 w-full px-4 text-sm disabled:opacity-45 ${
              followed ? 'btn-secondary' : 'btn-primary'
            }`}
          >
            {followed
              ? `Following ${nameOf(inviter)}`
              : busy
                ? 'Following…'
                : `Follow ${nameOf(inviter)}`}
          </button>
          {followError && (
            <p role="alert" className="mt-2 text-sm text-accent">
              {followError}
            </p>
          )}
        </section>
      )}

      {/* Part of identity since the 2026-08-07 auth decisions — a username
          signs you in anywhere an email does — so it is offered here, at the
          door, not buried in Friends → You. Still skippable: the two buttons
          below work regardless, and email sign-in never stops working. */}
      <section
        className="ring-edge bg-surface px-3 py-3"
        style={{ borderRadius: 'var(--radius-md)' }}
      >
        <label htmlFor="welcome-username" className="kicker mb-1 block">
          Pick a username — optional
        </label>
        <p className="mb-2 text-sm text-muted">
          Sign in with it instead of your email, and let friends find you.
        </p>
        {usernameSaved ? (
          <p className="text-[15px] font-medium">
            @{usernameSaved} <span className="text-sm text-muted">is yours.</span>
          </p>
        ) : (
          <div className="flex gap-2">
            <input
              id="welcome-username"
              type="text"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              maxLength={21}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your_name"
              className="h-12 min-w-0 flex-1 rounded-lg border border-line bg-ink px-3 text-start text-[15px] outline-none placeholder:text-muted focus:border-accent"
            />
            <button
              type="button"
              onClick={() => void claimUsername()}
              disabled={savingUsername || username.trim().length === 0}
              className="btn-base btn-secondary h-12 px-4 text-sm disabled:opacity-45"
            >
              {savingUsername ? 'Saving…' : 'Claim'}
            </button>
          </div>
        )}
        {usernameError && (
          <p role="alert" className="mt-2 text-sm text-accent">
            {usernameError}
          </p>
        )}
      </section>

      <section>
        <p className="kicker mb-2">Where to start</p>
        <p className="text-sm text-muted">
          You can start logging right now — pick an exercise and go, no setup. Or have a
          week of routines drafted for you and edit whatever you disagree with.
        </p>

        {/* The one hero on this screen. Starting from nothing is the harder
            problem of the two, so it gets the thumb's destination. */}
        <button
          type="button"
          onClick={onGenerate}
          className="btn-base btn-hero mt-3 h-[60px] w-full text-[17px]"
        >
          Draft me a routine
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="btn-base btn-secondary mt-2 h-12 w-full text-sm"
        >
          I will just start logging
        </button>

        {/* Last, and quiet, because it is true for a minority — but for that
            minority it is the most valuable button in the app: a switcher who
            imports opens their first session with their own numbers ghosted on
            every row, which is the retention engine firing on day one instead
            of week three (offense plan §9-F1).

            Below the hero rather than above it. The first render put it first
            and it read as the primary path for everybody, which inverts who
            this screen is mostly for. The label names its audience, so a
            switcher scanning the screen still finds it. */}
        <button
          type="button"
          onClick={onImport}
          className="btn-base btn-quiet mt-2 h-12 w-full text-sm"
        >
          Coming from Hevy? Bring your history
        </button>
      </section>
    </div>
  )
}
