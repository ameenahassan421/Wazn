import { useState } from 'react'
import { saveProfile, type Inviter } from '../lib/social'
import { InviteCard } from './InviteCard'
import { USERNAME_RE, normalizeUsername } from '../lib/auth-identity'
import { useAuth } from '../lib/use-auth'
import { useLocale } from '../lib/locale-context'

/**
 * The first screen after a brand-new account signs in.
 *
 * Plan Block 3 asks for: land -> OTP -> follow the inviter -> pick or generate a
 * routine. The OTP half is `AuthScreen`; this is everything after it.
 *
 * It only appears for someone with nothing — no workouts, no routines. A
 * returning user never sees it, and there is no way to get back to it, because
 * an onboarding screen you can revisit is a settings screen with a friendly
 * face (Scope forbids one).
 *
 * The follow happens here rather than at sign-in because it needs a session,
 * and because the person should be able to see who they are about to follow.
 * An invite that silently connected two accounts would be the app deciding
 * something on their behalf.
 */
export function Welcome({
  inviter,
  onGenerate,
  onSkip,
  onImport,
}: {
  /** Resolved by LogScreen, which owns the code — see InviteCard. */
  inviter: Inviter | null
  onGenerate: () => void
  onSkip: () => void
  /** Offered only to a switcher — see the section this renders. */
  onImport: () => void
}) {
  const { locale, setLocale, t } = useLocale()
  const { userId } = useAuth()
  const [username, setUsername] = useState('')
  const [usernameSaved, setUsernameSaved] = useState<string | null>(null)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [savingUsername, setSavingUsername] = useState(false)

  const toggleLocale = () => setLocale(locale === 'en' ? 'ar' : 'en')

  async function claimUsername() {
    if (!userId) return
    const clean = normalizeUsername(username)
    if (!USERNAME_RE.test(clean)) {
      setUsernameError(t('welcome.username.error.length'))
      return
    }
    setSavingUsername(true)
    setUsernameError(null)
    try {
      await saveProfile(userId, { username: clean })
      setUsernameSaved(clean)
    } catch (caught) {
      setUsernameError(
        caught instanceof Error ? caught.message : t('welcome.username.error.save'),
      )
    } finally {
      setSavingUsername(false)
    }
  }

  return (
    <div className="relative flex flex-col gap-6 py-6">
      {/* Placed at the top so it is reachable without scrolling but does not
          compete with the primary sign-in action. A signed-out user has no
          Header, so the only way to set language before onboarding is here. */}
      <div className="absolute top-0 end-0">
        <button
          type="button"
          onClick={toggleLocale}
          aria-label={t('toggle.locale.name')}
          className="flex h-12 items-center px-1"
        >
          <span className="btn-base btn-secondary tnum h-[34px] min-w-[52px] px-3 text-body">
            {t('toggle.locale.label')}
          </span>
        </button>
      </div>

      <div>
        <p className="kicker">{t('welcome.heading')}</p>
        <h1 className="mt-1 text-fig font-semibold leading-tight">
          {t('welcome.subhead')}
        </h1>
        <p className="mt-2 text-body text-muted">{t('welcome.body')}</p>
      </div>

      {inviter && <InviteCard inviter={inviter} />}

      {/* Part of identity since the 2026-08-07 auth decisions — a username
          signs you in anywhere an email does — so it is offered here, at the
          door, not buried in Friends > You. Still skippable: the two buttons
          below work regardless, and email sign-in never stops working. */}
      <section
        className="ring-edge bg-surface px-3 py-3"
        style={{ borderRadius: 'var(--radius-md)' }}
      >
        <label htmlFor="welcome-username" className="kicker mb-1 block">
          {t('welcome.username.label')}
        </label>
        <p className="mb-2 text-body text-muted">{t('welcome.username.body')}</p>
        {usernameSaved ? (
          <p className="row-title font-medium">
            @{usernameSaved}{' '}
            <span className="text-label text-muted">{t('welcome.username.saved')}</span>
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
              placeholder={t('welcome.username.placeholder')}
              className="h-12 min-w-0 flex-1 rounded-lg border border-line bg-ink px-3 text-start field-text outline-none placeholder:text-muted focus:border-accent"
            />
            <button
              type="button"
              onClick={() => void claimUsername()}
              disabled={savingUsername || username.trim().length === 0}
              className="btn-base btn-secondary h-12 px-4 text-body disabled:opacity-45"
            >
              {savingUsername
                ? t('welcome.username.claim.busy')
                : t('welcome.username.claim')}
            </button>
          </div>
        )}
        {usernameError && (
          <p role="alert" className="mt-2 text-body text-accent-300">
            {usernameError}
          </p>
        )}
      </section>

      <section>
        <p className="kicker mb-2">{t('welcome.start.heading')}</p>
        <p className="text-body text-muted">{t('welcome.start.body')}</p>

        {/* The one hero on this screen. Starting from nothing is the harder
            problem of the two, so it gets the thumb's destination. */}
        <button
          type="button"
          onClick={onGenerate}
          className="btn-base btn-hero mt-3 h-[60px] w-full btn-text"
        >
          {t('welcome.generate')}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="btn-base btn-secondary mt-2 h-12 w-full text-body"
        >
          {t('welcome.skip')}
        </button>

        {/* Last, and quiet, because it is true for a minority — but for that
            minority it is the most valuable button in the app: a switcher who
            imports opens their first session with their own numbers ghosted on
            every row, which is the retention engine firing on day one instead
            of week three (offense plan 9-F1).

            Below the hero rather than above it. The first render put it first
            and it read as the primary path for everybody, which inverts who
            this screen is mostly for. The label names its audience, so a
            switcher scanning the screen still finds it. */}
        <button
          type="button"
          onClick={onImport}
          className="btn-base btn-quiet mt-2 h-12 w-full text-body"
        >
          {t('welcome.import')}
        </button>
      </section>
    </div>
  )
}
