import { HEAT_RAMP } from '@wazn/core/progress'
import type { RecordEntry, WeekDay } from '@wazn/core/progress'
import { useLocale } from '../lib/locale-context'
import { useUnit } from '../lib/unit-context'
import {
  formatDuration,
  formatRelativeDay,
  formatVolumeWithUnit,
} from '@wazn/core/format'
import { formatWeekdayNarrow } from '@wazn/core/format'
import { formatWeightWithUnit } from '@wazn/core/units'

/**
 * The row of cards under the Up next block on the home screen — the design's
 * "This week", "Last PR" and the recent-session line.
 *
 * They are also the navigation. With the five-tab bar gone, these are how
 * Progress and History are reached: the design's home has one Start action
 * and doors that are the content itself rather than a row of equal tabs.
 */

/** Seven bars, Monday to Sunday. See `thisWeek` for why not Sunday-first. */
export function WeekCard({ days, onOpen }: { days: WeekDay[]; onOpen: () => void }) {
  const { t, locale } = useLocale()

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('home.week.aria')}
      className="surface-card flex-[1.4] px-4 py-3.5 text-start"
    >
      <p className="kicker mb-2.5">{t('home.week')}</p>
      <div className="flex gap-[5px]">
        {days.map((day) => (
          <div key={day.date.toISOString()} className="flex-1 text-center">
            <div
              className="h-[30px]"
              style={{
                borderRadius: '7px',
                ...barStyle(day),
              }}
            />
            <p
              className="meta-mono mt-[5px] text-nano"
              style={{ color: day.today ? 'var(--color-accent)' : undefined }}
            >
              {formatWeekdayNarrow(day.date, locale)}
            </p>
          </div>
        ))}
      </div>
    </button>
  )
}

/**
 * Today is a ring rather than a fill even when it has volume in it, because
 * the question the column answers is "where am I in the week", and a filled
 * Thursday among filled Mondays cannot answer it. Days later in the week are
 * drawn like rest days: they are not rest days yet, but nothing else on this
 * card distinguishes "did not train" from "has not happened", and inventing
 * a third tint for it would say more than the app knows.
 */
function barStyle(day: WeekDay): { background: string; boxShadow?: string } {
  if (day.today) {
    return {
      background: 'var(--color-surface)',
      boxShadow: 'inset 0 0 0 2px var(--color-accent)',
    }
  }
  // The same ramp the History heatmap uses. The design writes its four busy
  // steps as one vermilion at .45/.7/1 opacity; this app already had a five
  // step scale of solid tokens for exactly that job, and two scales for one
  // idea would drift the first time either was touched.
  return { background: HEAT_RAMP[day.level] }
}

export function LastPrCard({
  record,
  onOpen,
}: {
  record: RecordEntry | null
  onOpen: () => void
}) {
  const { t, locale } = useLocale()
  const { unit } = useUnit()

  return (
    <button
      type="button"
      onClick={onOpen}
      className="surface-card min-w-0 flex-1 px-4 py-3.5 text-start"
    >
      {/* No `aria-label` here. An aria-label REPLACES a button's content as
          its accessible name, so labelling this one "Last PR" to stop it
          reciting its contents also stopped it reading out the record — the
          only thing on the card worth hearing. The destination is added
          instead, so the name is the record AND where pressing goes. */}
      <p className="kicker mb-2">{t('home.last_pr')}</p>
      <span className="sr-only">{t('home.last_pr.aria')}</span>
      {record ? (
        <>
          <p
            dir="ltr"
            className="font-display tnum text-num font-extrabold tracking-[-0.02em] text-accent"
          >
            {formatWeightWithUnit(record.weight_kg, unit)}
          </p>
          <p dir="auto" className="mt-[3px] truncate text-label text-muted">
            {record.name} · {formatRelativeDay(record.at, locale)}
          </p>
        </>
      ) : (
        <p className="text-label text-muted">{t('home.no_pr')}</p>
      )}
    </button>
  )
}

/** The last finished session, as one line rather than the old recap list. */
export function RecentSessionCard({
  name,
  startedAt,
  endedAt,
  volumeKg,
  hasPr,
  onOpen,
}: {
  name: string | null
  startedAt: string
  endedAt: string | null
  volumeKg: number
  hasPr: boolean
  onOpen: () => void
}) {
  const { t, locale } = useLocale()
  const { unit } = useUnit()

  // Duration is dropped rather than guessed when a workout has no end — a
  // snapshot written by an older build carries no `ended_at` at all.
  const meta = [
    formatRelativeDay(startedAt, locale),
    endedAt ? formatDuration(startedAt, endedAt) : null,
    volumeKg > 0 ? t('home.lifted', { v: formatVolumeWithUnit(volumeKg, unit) }) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <button
      type="button"
      onClick={onOpen}
      className="surface-card flex w-full items-center justify-between gap-3 px-[18px] py-3.5 text-start"
    >
      {/* The destination, appended rather than substituted — see LastPrCard. */}
      <span className="sr-only">{t('home.last_session.aria')}</span>
      <span className="min-w-0">
        <span dir="auto" className="block truncate row-title font-bold">
          {name?.trim() || t('log.workout_fallback')}
        </span>
        <span dir="auto" className="mt-[3px] block truncate text-meta text-muted">
          {meta}
        </span>
      </span>
      {hasPr && (
        <span
          className="font-display text-accent-300 shrink-0 px-2.5 py-1.5 text-meta font-bold"
          style={{
            background: 'color-mix(in srgb, var(--color-accent) 9%, transparent)',
            borderRadius: 'var(--radius-pill)',
          }}
        >
          {t('home.pr')}
        </span>
      )}
    </button>
  )
}
