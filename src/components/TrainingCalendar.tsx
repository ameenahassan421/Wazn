import { useMemo } from 'react'
import { heatStep, trainingCalendar } from '../lib/progress'
import type { SessionVolumeRow } from '../lib/progress'
import {
  formatCount,
  formatDayLabel,
  formatMonthLabel,
  formatVolumeWithUnit,
} from '../lib/format'
import type { Unit } from '../lib/units'

/**
 * Nine months of training as one grid: a column per week, a row per weekday,
 * a cell brightening with the load moved that day.
 *
 * Nine months because that is the length of the history this app was built
 * on, and because the thing a calendar says that a list cannot is *shape* —
 * the streak, the deload, the two weeks nobody wants to talk about. A
 * quarter-length grid would show a quarter of that.
 *
 * The cost of the span is cell size. At 39 columns across a phone a square
 * cell is about 7px, which is a texture rather than a mark, so the cells are
 * taller than they are wide: full-width columns on a fixed 12px row. Nothing
 * here scrolls sideways — a horizontal scroller nested in a vertical one is
 * a way to lose both.
 */

const WEEKS = 39

/**
 * Five steps of one hue, per `heatStep`: rest, then four by volume relative
 * to the busiest day in view. A sequential scale is one hue getting darker —
 * here lighter, because the ground is ink — and never a second colour.
 */
const HEAT = [
  'var(--color-tile-2)',
  'var(--color-accent-900)',
  'var(--color-accent-800)',
  'var(--color-accent-600)',
  'var(--color-accent-500)',
]

const GRID_COLUMNS = `repeat(${WEEKS}, minmax(0, 1fr))`

export function TrainingCalendar({
  sessions,
  unit,
}: {
  sessions: SessionVolumeRow[]
  unit: Unit
}) {
  const days = useMemo(() => trainingCalendar(sessions, WEEKS), [sessions])

  const max = days.reduce((top, d) => Math.max(top, d.volumeKg), 0)
  const trained = days.filter((d) => d.volumeKg > 0).length

  // One label per month, placed on the column its first day falls in. The
  // last two columns are skipped: a label there runs off the inline end.
  const months = days
    .filter((_, i) => i % 7 === 0)
    .map((day, column) => ({ day, column }))
    .filter(
      ({ day, column }, i, all) =>
        column < WEEKS - 2 &&
        (i === 0 || day.date.getMonth() !== all[i - 1].day.date.getMonth()),
    )

  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="kicker flex-1">Training calendar</h2>
        <span className="tnum font-mono text-[11px] text-muted">
          {formatCount(trained)} {trained === 1 ? 'day' : 'days'}
        </span>
      </div>

      <div
        aria-hidden="true"
        className="mb-1 grid font-mono text-[11px] leading-none text-muted"
        style={{ gridTemplateColumns: GRID_COLUMNS }}
      >
        {months.map(({ day, column }) => (
          <span
            key={day.date.getTime()}
            className="whitespace-nowrap"
            style={{ gridColumn: column + 1, justifySelf: 'start' }}
          >
            {formatMonthLabel(day.date)}
          </span>
        ))}
      </div>

      {/* One image, not 273 focus stops: the grid is summarised for a screen
          reader and the workout list below is the accessible detail view. */}
      <div
        role="img"
        aria-label={`Training calendar, last ${WEEKS} weeks: ${trained} days trained`}
        className="grid"
        style={{
          gridTemplateColumns: GRID_COLUMNS,
          // Seven explicit rows plus column flow: a week is a column, and the
          // final partial column fills Monday-down to today.
          gridTemplateRows: 'repeat(7, 12px)',
          gridAutoFlow: 'column',
          gap: '2px 1.5px',
        }}
      >
        {days.map((day) => (
          <span
            key={day.date.getTime()}
            title={
              day.volumeKg > 0
                ? `${formatDayLabel(day.date)} · ${formatVolumeWithUnit(day.volumeKg, unit)}`
                : `${formatDayLabel(day.date)} · rest`
            }
            style={{
              backgroundColor: HEAT[heatStep(day.volumeKg, max)],
              borderRadius: '2px',
            }}
          />
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <p className="min-w-0 flex-1 text-[11px] text-muted">
          {trained === 0
            ? 'One square a day, nine months back. It lights up with the load you move.'
            : 'Brighter is a heavier day. Unlit is rest.'}
        </p>
        <span aria-hidden="true" className="flex shrink-0 items-center gap-[3px]">
          {HEAT.map((color) => (
            <span
              key={color}
              style={{
                backgroundColor: color,
                width: 8,
                height: 8,
                borderRadius: '2px',
              }}
            />
          ))}
        </span>
      </div>
    </section>
  )
}
