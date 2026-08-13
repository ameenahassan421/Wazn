import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useLocale } from '../lib/locale-context'
import { useTheme } from '../lib/theme-context'
import { useUnit } from '../lib/unit-context'
import { fetchMyProfile } from '../lib/social'
import type { Profile } from '../lib/social'
import { Avatar } from '../components/Avatar'
import { IconBack } from '../components/icons'

/**
 * "You" — the design's screen 14, and the fix for the audit's S3: the header
 * was renting prime space on every screen to kg/lb and the language toggle,
 * two preferences a person sets once and then never touches.
 *
 * What is here is what the app can actually stand behind. The design also
 * draws a default-rest row, a body-weight sparkline, a coach-nudges toggle
 * and a CSV export; none of the four exists in the codebase — there is no
 * app-level rest default (only the per-exercise override), no measurement
 * table, no nudge to switch off, and `lib/csv.ts` is a reader with no writer.
 * Drawing controls that do nothing would be worse than the header was.
 *
 * The theme control is the reverse case: it is not on the design's screen,
 * but it exists and the header is losing its home for it. The audit's own
 * "one conscious break" note keeps a dark mode on the roadmap, so it lands
 * here beside the other two set-once preferences rather than being dropped.
 */

/** A grouped card of rows, hairline-separated, as the design draws them. */
function Group({ children }: { children: ReactNode }) {
  // `surface-panel` already paints the card. Adding `bg-raised` on top of it
  // — which the first draft did — replaces the design's white with the beige
  // used for menus and quiet chips, and the group stops reading as a card.
  return <div className="surface-panel px-[18px] py-1.5">{children}</div>
}

function Row({
  label,
  children,
  last = false,
}: {
  label: string
  children: ReactNode
  last?: boolean
}) {
  return (
    <div
      className="flex min-h-12 items-center justify-between gap-3 py-3"
      style={last ? undefined : { borderBottom: '1px solid var(--divider-solid)' }}
    >
      <p className="text-sm font-semibold">{label}</p>
      {children}
    </div>
  )
}

/**
 * The design's segmented control: a bone track with the live option filled
 * ink. Each option is a real button, so the whole row is not one 48px target
 * that flips — pressing "kg" when kg is already live has to be a no-op.
 */
function Segmented<T extends string>({
  value,
  options,
  onChange,
  name,
}: {
  value: T
  options: { id: T; label: string; className?: string }[]
  onChange: (id: T) => void
  name: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className="flex items-center gap-0.5 p-[3px]"
      style={{ background: 'var(--color-ink)', borderRadius: 'var(--radius-pill)' }}
    >
      {options.map(({ id, label, className }) => {
        const live = id === value
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={live}
            onClick={() => onChange(id)}
            className={`font-display px-3.5 py-2 text-xs font-bold ${
              live ? '' : 'text-muted'
            } ${className ?? ''}`}
            style={{
              borderRadius: 'var(--radius-pill)',
              background: live ? 'var(--color-text)' : 'transparent',
              color: live ? 'var(--color-ink)' : undefined,
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

/** A row that opens something else. The chevron points the way out. */
function LinkRow({
  label,
  onClick,
  last = false,
}: {
  label: string
  onClick: () => void
  last?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 w-full items-center justify-between gap-3 py-3 text-start"
      style={last ? undefined : { borderBottom: '1px solid var(--divider-solid)' }}
    >
      <span className="text-sm font-semibold">{label}</span>
      <IconBack size={16} className="text-muted rotate-180" />
    </button>
  )
}

export function SettingsScreen({
  email,
  joinedAt,
  userId,
  onFriends,
  onClose,
}: {
  email: string | null
  joinedAt: string | null
  userId: string
  onFriends: () => void
  onClose: () => void
}) {
  const { t, locale, setLocale } = useLocale()
  const { unit, setUnit } = useUnit()
  const { theme, setTheme } = useTheme()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  useEffect(() => {
    let active = true
    void fetchMyProfile(userId)
      .then((p) => {
        if (active) setProfile(p)
      })
      // A missing profile is not an error worth a message here: the screen's
      // job is the preferences below, and the name is the decoration on top.
      .catch(() => {})
    return () => {
      active = false
    }
  }, [userId])

  const name = profile?.username ?? null
  // Month and year only. The exact day somebody signed up is nobody's
  // business and reads as surveillance on a settings screen.
  const joined = joinedAt ? monthYear(joinedAt, locale) : null

  return (
    <div className="flex flex-col gap-3 pt-3 pb-6">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('settings.back')}
          className="btn-base btn-quiet -ms-3 h-12 w-12"
        >
          <IconBack size={20} />
        </button>
        <h1 className="font-display text-[19px] font-extrabold tracking-[-0.02em]">
          {t('settings.title')}
        </h1>
      </div>

      <div className="flex items-center gap-3.5 pb-1">
        <Avatar name={name} size={56} />
        <div className="min-w-0">
          {name && (
            <p
              dir="auto"
              className="font-display truncate text-[19px] font-extrabold tracking-[-0.02em]"
            >
              {name}
            </p>
          )}
          <p className="meta-mono truncate text-xs text-muted">
            {/* One line, both facts, and each of them may be missing. */}
            {[email, joined && t('settings.since', { when: joined })]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>

      <Group>
        <Row label={t('settings.units')}>
          <Segmented
            name={t('settings.units')}
            value={unit}
            onChange={setUnit}
            options={[
              { id: 'kg', label: 'kg' },
              { id: 'lbs', label: 'lb' },
            ]}
          />
        </Row>
        <Row label={t('settings.language')}>
          <Segmented
            name={t('settings.language')}
            value={locale}
            onChange={setLocale}
            options={[
              { id: 'en', label: t('settings.language.en') },
              // The Arabic option is set in the Arabic UI face, not the
              // display font: it is a word in that script wherever it renders.
              { id: 'ar', label: t('settings.language.ar'), className: 'font-sans' },
            ]}
          />
        </Row>
        <Row label={t('settings.theme')} last>
          <Segmented
            name={t('settings.theme')}
            value={theme}
            onChange={setTheme}
            options={[
              { id: 'paper', label: t('settings.theme.paper') },
              { id: 'dark', label: t('settings.theme.dark') },
            ]}
          />
        </Row>
      </Group>

      {/* The design also puts "Import from Hevy" in this group. It stays on
          the Log screen for now: the import view is state inside LogScreen,
          and it is gated on an empty account because running the same export
          twice would duplicate every workout in it. Lifting it out belongs
          with P2's first-run import flow, not with a link that would have to
          re-derive that gate from here. */}
      <Group>
        <LinkRow label={t('settings.friends')} onClick={onFriends} last />
      </Group>

      {/* Two taps, the same arm the discard controls use. Signing out of a
          PWA on a phone is not catastrophic, but it is not undoable in one
          press either — the queue survives, the session does not. */}
      <button
        type="button"
        onClick={() => {
          if (!confirmSignOut) {
            setConfirmSignOut(true)
            return
          }
          void supabase.auth.signOut()
        }}
        className={`flex min-h-12 items-center px-[18px] text-start text-sm font-semibold ${
          confirmSignOut ? 'text-accent' : 'text-muted'
        }`}
      >
        {confirmSignOut ? t('settings.signout.confirm') : t('settings.signout')}
      </button>

      <p className="meta-mono mt-2 text-center text-[11px] text-muted">
        <span dir="ltr">wazn {__APP_VERSION__}</span> · وزن
      </p>
    </div>
  )
}

/**
 * "Aug 2026", in the app's locale rather than the device's.
 *
 * Every other date formatter in lib/format.ts is built with `undefined` and
 * therefore follows the device — which is right for a timestamp beside a set,
 * and wrong for the one line on this screen that is prose. Falls back to
 * English when a runtime ships without Arabic locale data, the same guard
 * `formatWeekday` uses.
 */
function monthYear(iso: string, locale: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    year: 'numeric',
    numberingSystem: 'latn',
  }
  try {
    return new Intl.DateTimeFormat(locale, opts).format(d)
  } catch {
    return new Intl.DateTimeFormat('en', opts).format(d)
  }
}
