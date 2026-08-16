import type { RoutineWithRun } from '../lib/rotation'
import { formatRelativeDay } from '../lib/format'
import { useLocale } from '../lib/locale-context'

/**
 * The Up next card — the design's flip-ground block on the home surface.
 *
 * It answers one question before the thumb reaches Start: what is this
 * session going to be. The ground flips (ink on paper, paper on ink) because
 * it is the one card on the screen that is a plan rather than a record, and
 * the design separates those by material rather than by a heading.
 *
 * The meta line carries only facts the app actually has. The design's
 * "~55 min" is not one of them — nothing in the schema estimates a routine's
 * duration, and a guessed number on the opening screen is the kind of claim
 * a lifter checks once and never trusts again.
 */
export function UpNextCard({
  routine,
  onStart,
  busy,
}: {
  routine: RoutineWithRun
  onStart: () => void
  busy: boolean
}) {
  const { t, locale } = useLocale()

  const meta = [
    routine.exercise_count == null
      ? null
      : t('upnext.exercises', { n: String(routine.exercise_count) }),
    routine.last_run_at === null
      ? t('upnext.never')
      : t('upnext.last_done', {
          day: formatRelativeDay(routine.last_run_at, locale),
        }),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <button
      type="button"
      onClick={onStart}
      disabled={busy}
      className="press w-full p-[18px] text-start disabled:opacity-45"
      style={{
        background: 'var(--flip-bg)',
        color: 'var(--flip-text)',
        borderRadius: 'var(--radius-xl)',
      }}
    >
      <span
        className="kicker block"
        style={{ color: 'var(--flip-muted)', fontFamily: 'var(--font-display)' }}
      >
        {t('upnext.kicker')}
      </span>
      <span className="font-display mt-2 block text-title font-bold tracking-[-0.02em]">
        {busy ? t('routines.starting') : routine.name}
      </span>
      <span className="mt-1 block text-meta" style={{ color: 'var(--flip-muted)' }}>
        {meta}
      </span>
    </button>
  )
}
