import { useState } from 'react'
import { follow, nameOf } from '../lib/social'
import type { Inviter } from '../lib/social'
import { useLocale } from '../lib/locale-context'

/**
 * "You were invited — Follow X."
 *
 * Lived inside `Welcome` until now, which meant it only ever appeared to
 * accounts with no workouts, no routines and no history: `takeInviteCode()`
 * was called from Welcome's own effect, and Welcome mounts for brand-new
 * accounts only. Anyone who had trained before clicking a friend's link had
 * the code captured into sessionStorage and then never read — the invite was
 * accepted by nobody and reported to no one.
 *
 * It is a component rather than a copy of the markup in two screens because
 * the follow itself carries state — busy, followed, and an error that took a
 * long time to start being shown at all.
 */
export function InviteCard({ inviter }: { inviter: Inviter }) {
  const { t } = useLocale()
  const [busy, setBusy] = useState(false)
  const [followed, setFollowed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      await follow(inviter.user_id)
      setFollowed(true)
    } catch (caught) {
      // This used to swallow the failure to keep the first screen calm, and
      // that decision hid a real defect for as long as the feature existed:
      // every follow was being refused and the button simply did nothing. A
      // button that does nothing is worse than an error — the user taps it
      // again, then decides the app is broken.
      setFollowed(false)
      setError(caught instanceof Error ? caught.message : t('welcome.follow.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="ring-edge bg-surface px-3 py-3"
      style={{ borderRadius: 'var(--radius-md)' }}
    >
      <p className="kicker mb-1">{t('welcome.invited.heading')}</p>
      <p className="text-[15px] font-medium">{nameOf(inviter)}</p>
      <p className="mt-0.5 text-sm text-muted">{t('welcome.invited.body')}</p>
      <button
        type="button"
        onClick={() => void accept()}
        disabled={busy || followed}
        className={`btn-base mt-2.5 h-12 w-full px-4 text-sm disabled:opacity-45 ${
          followed ? 'btn-secondary' : 'btn-primary'
        }`}
      >
        {followed
          ? t('welcome.following', { name: nameOf(inviter) })
          : busy
            ? t('welcome.follow.busy')
            : t('welcome.follow', { name: nameOf(inviter) })}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-accent-300">
          {error}
        </p>
      )}
    </section>
  )
}
