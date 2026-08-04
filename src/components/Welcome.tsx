import { useEffect, useState } from 'react'
import { takeInviteCode } from '../lib/invite'
import { follow, resolveInvite, nameOf, type Inviter } from '../lib/social'

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
}: {
  onGenerate: () => void
  onSkip: () => void
}) {
  const [inviter, setInviter] = useState<Inviter | null>(null)
  const [followed, setFollowed] = useState(false)
  const [busy, setBusy] = useState(false)

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

  async function acceptInvite() {
    if (!inviter) return
    setBusy(true)
    try {
      await follow(inviter.user_id)
      setFollowed(true)
    } catch {
      // Not worth an alarm on the first screen someone ever sees. They can
      // follow by username from the Friends tab.
      setFollowed(false)
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
            {followed ? `Following ${nameOf(inviter)}` : `Follow ${nameOf(inviter)}`}
          </button>
        </section>
      )}

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
      </section>
    </div>
  )
}
