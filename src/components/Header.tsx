import { useState } from 'react'
import { useUnit } from '../lib/unit-context'
import { useLocale } from '../lib/locale-context'
import { supabase } from '../lib/supabase'
import { useBackLayer } from '../lib/use-back'
import { useActiveWorkout } from '../lib/active-workout'
import { Wordmark } from './Wordmark'
import { IconMore } from './icons'

/**
 * The Log tab shows the mark; History and Progress show their name, because
 * on those screens the title is the only thing saying where you are.
 *
 * Sign out lives behind the overflow menu, not in the header. It was a
 * permanent text button beside the unit toggle — a destructive action parked
 * where a thumb rests, tappable mid-workout, and paying rent on every screen
 * for something used a few times a year.
 */
/**
 * `titleKey` is a catalogue key, not a rendered string. App sits ABOVE
 * LocaleProvider, so a `t()` call up there resolves against the default
 * context and returns the key itself — the title read "nav.history" on
 * screen. Translating here, inside the provider, is what makes it correct.
 */
export function Header({ titleKey }: { titleKey?: string | null }) {
  const { unit, toggleUnit } = useUnit()
  const { locale, setLocale, t } = useLocale()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const active = useActiveWorkout()
  // The menu is a layer: the system back gesture closes it, not the app.
  useBackLayer(menuOpen, () => setMenuOpen(false))

  // Closing the menu disarms, so reopening it never presents a primed
  // destructive control. Adjusted during render rather than in an effect, the
  // pattern CLAUDE.md's state-handling section requires.
  if (!menuOpen && confirmDiscard) setConfirmDiscard(false)

  const toggleLocale = () => setLocale(locale === 'en' ? 'ar' : 'en')

  return (
    <header className="header-band sticky top-0 z-20">
      <div
        className="mx-auto flex w-full max-w-[430px] items-center gap-1 px-[18px] pb-3"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 10px)' }}
      >
        <h1 className="flex items-center text-[17px] font-medium tracking-tight">
          {titleKey ? t(titleKey) : <Wordmark height={34} className="text-text" />}
        </h1>

        <div className="ms-auto flex items-center">
          <button
            type="button"
            onClick={toggleLocale}
            aria-label={t('toggle.locale.name')}
            className="flex h-12 items-center px-1"
          >
            <span className="btn-base btn-secondary tnum h-[34px] min-w-[52px] px-3 text-sm">
              {t('toggle.locale.label')}
            </span>
          </button>

          <button
            type="button"
            onClick={toggleUnit}
            aria-label={t('toggle.unit.name', { unit })}
            className="flex h-12 items-center px-1"
          >
            <span className="btn-base btn-secondary tnum h-[34px] min-w-[52px] px-3 text-sm">
              {unit}
            </span>
          </button>

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
                  {/* Only while a workout is open, and two taps, matching the
                      armed Finish row it duplicates. L8 exists because Ameen
                      went looking for Discard and the only door was inside
                      the finish control. */}
                  {active && (
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
                      className={`flex h-12 w-full items-center px-4 text-start text-sm ${
                        confirmDiscard ? 'text-soft' : ''
                      }`}
                    >
                      {confirmDiscard
                        ? t('header.menu.discard.confirm')
                        : t('header.menu.discard')}
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      void supabase.auth.signOut()
                    }}
                    className="flex h-12 w-full items-center px-4 text-start text-sm"
                  >
                    {t('header.menu.signout')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
