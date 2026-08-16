import { useState } from 'react'
import { useLocale } from '../lib/locale-context'
import { useBackLayer } from '../lib/use-back'
import { useActiveWorkout } from '../lib/active-workout'
import { Avatar } from './Avatar'
import { Wordmark } from './Wordmark'
import { IconBack, IconMore } from './icons'

/**
 * The Log tab shows the mark; History and Progress show their name, because
 * on those screens the title is the only thing saying where you are.
 *
 * The end of the row is the avatar, and it is the door to Settings — the
 * design's own home layout, wordmark at the start and "you" at the end.
 *
 * What used to live there was the kg/lb chip and the language chip, which is
 * the audit's S3 finding: two preferences a person sets once, renting the
 * best real estate on every screen in the app. Both are on the Settings
 * screen now, along with the theme and sign out.
 *
 * The overflow menu survives with one item, Discard, and renders only while
 * a workout is open — so on every other screen it is not there at all.
 *
 * `onBack` is the other half of retiring the five-tab bar. Home has no back
 * chevron because it is where back goes; every other screen has one, and it
 * is the only way out on a platform without a system back gesture.
 */
/**
 * `titleKey` is a catalogue key, not a rendered string. App sits ABOVE
 * LocaleProvider, so a `t()` call up there resolves against the default
 * context and returns the key itself — the title read "nav.history" on
 * screen. Translating here, inside the provider, is what makes it correct.
 */
export function Header({
  titleKey,
  name,
  onBack,
  onOpenSettings,
}: {
  titleKey?: string | null
  /** The username, for the monogram. Null until it loads, or if unclaimed. */
  name?: string | null
  /** The way home from a secondary screen. This is what replaced the tab
   *  bar as the exit — without it those screens are reachable and unleavable
   *  by anything but the Android back gesture, which iOS does not have. */
  onBack?: () => void
  onOpenSettings: () => void
}) {
  const { t } = useLocale()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const active = useActiveWorkout()
  // The menu is a layer: the system back gesture closes it, not the app.
  useBackLayer(menuOpen, () => setMenuOpen(false))

  // Closing the menu disarms, so reopening it never presents a primed
  // destructive control. Adjusted during render rather than in an effect, the
  // pattern CLAUDE.md's state-handling section requires.
  if (!menuOpen && confirmDiscard) setConfirmDiscard(false)

  return (
    <header className="header-band sticky top-0 z-20">
      <div
        className="mx-auto flex w-full max-w-[430px] items-center gap-1 px-[18px] pb-3"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 10px)' }}
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t('settings.back')}
            className="btn-base btn-quiet -ms-3 h-12 w-12"
          >
            <IconBack size={20} />
          </button>
        )}
        <h1 className="flex items-center text-title font-medium tracking-tight">
          {titleKey ? t(titleKey) : <Wordmark height={15.5} className="text-text" />}
        </h1>

        <div className="ms-auto flex items-center gap-1">
          {/* Only while a workout is open — the one item left inside it is
              Discard, so on every other screen the menu has nothing to say. */}
          {active && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label={t('header.menu.open')}
                aria-expanded={menuOpen}
                className="btn-base btn-quiet h-12 w-12"
              >
                <IconMore size={20} />
              </button>

              {menuOpen && (
                <>
                  <button
                    type="button"
                    aria-label={t('header.menu.close')}
                    onClick={() => setMenuOpen(false)}
                    className="fixed inset-0 z-30 cursor-default"
                  />
                  <div
                    role="menu"
                    className="ring-edge absolute end-0 top-full z-40 min-w-[176px] overflow-hidden bg-raised py-1"
                    style={{ borderRadius: 'var(--radius-md)' }}
                  >
                    {/* Two taps, matching the armed Finish row it duplicates.
                      L8 exists because Ameen went looking for Discard and the
                      only door was inside the finish control.

                      It is the only item left here. Theme and sign out moved
                      to Settings, where the rest of the set-once controls
                      live; this one stays because it acts on the workout in
                      front of you and belongs beside it. */}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        if (!confirmDiscard) {
                          setConfirmDiscard(true)
                          return
                        }
                        setMenuOpen(false)
                        active.discard()
                      }}
                      className={`flex h-12 w-full items-center px-4 text-start text-body ${
                        confirmDiscard ? 'text-accent' : ''
                      }`}
                    >
                      {confirmDiscard
                        ? t('header.menu.discard.confirm')
                        : t('header.menu.discard')}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onOpenSettings}
            aria-label={t('settings.open')}
            className="flex h-12 w-12 items-center justify-center"
          >
            <Avatar name={name ?? null} size={34} />
          </button>
        </div>
      </div>
    </header>
  )
}
