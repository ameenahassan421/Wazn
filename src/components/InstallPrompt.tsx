import { useEffect, useState } from 'react'
import { useLocale } from '../lib/locale-context'

/**
 * "Add Wazn to your home screen", offered once, at a moment when it makes
 * sense.
 *
 * Installing genuinely matters here — the installed PWA is what gets the
 * standalone display, the icon, and (Stage 4) offline logging. But an install
 * banner on first open is the single most ignorable thing on the mobile web,
 * and §2.1 forbids anything that interrupts logging.
 *
 * So the rules are:
 *
 *  - Never during a workout. The caller decides when to mount this, and it is
 *    mounted on the idle Log screen only.
 *  - Not on the first visit. `beforeinstallprompt` fires whenever Chrome feels
 *    like it; this waits until the person has actually logged something, so
 *    the offer follows evidence that the app is useful to them.
 *  - Dismissable, and dismissal is permanent. `localStorage`, not session —
 *    "no" means no, not "no for the next ten minutes".
 *
 * iOS has no `beforeinstallprompt` at all, and Safari requires Share → Add to
 * Home Screen by hand. Rather than pretend, that platform gets one line of
 * instructions instead of a button that cannot work.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED = 'wazn.install.dismissed'

function alreadyDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED) === '1'
  } catch {
    return false
  }
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // Safari's own flag; it predates the media query and is still the only
    // signal on older iOS.
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function InstallPrompt({ earned }: { earned: boolean }) {
  const { t } = useLocale()
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [hidden, setHidden] = useState(() => alreadyDismissed() || isStandalone())

  useEffect(() => {
    function onPrompt(event: Event) {
      // Chrome shows its own mini-infobar unless the event is prevented. We
      // want to choose the moment, so it is.
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    // Installing from anywhere — our button, Chrome's menu — retires the offer.
    const onInstalled = () => setHidden(true)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  function dismiss() {
    setHidden(true)
    try {
      localStorage.setItem(DISMISSED, '1')
    } catch {
      /* storage disabled; the offer simply reappears next launch */
    }
  }

  if (hidden || !earned) return null
  // Nothing to offer: not iOS, and the browser has not said an install is
  // possible. Showing a button that does nothing is worse than showing none.
  if (!deferred && !isIos()) return null

  return (
    <section
      className="ring-edge bg-surface px-3 py-3"
      style={{ borderRadius: 'var(--radius-md)' }}
    >
      <p className="kicker mb-1">{t('install.title')}</p>
      <p className="text-body text-muted">
        {isIos() && !deferred ? t('install.ios') : t('install.generic')}
      </p>
      <div className="mt-2.5 flex gap-2">
        {deferred && (
          <button
            type="button"
            onClick={() => {
              void deferred.prompt()
              void deferred.userChoice.finally(() => {
                setDeferred(null)
                dismiss()
              })
            }}
            className="btn-base btn-primary h-12 flex-1 px-4 text-body"
          >
            {t('install.action')}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          className="btn-base btn-quiet h-12 px-4 text-body"
        >
          {t('install.dismiss')}
        </button>
      </div>
    </section>
  )
}
