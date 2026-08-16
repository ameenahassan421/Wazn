import { useState } from 'react'
import { COACH_MODES, MODE_BEHAVIOUR, isModeReady, weeksOut } from '../lib/coach-mode'
import type { CoachMode } from '../lib/coach-mode'
import { useLocale } from '../lib/locale-context'

/**
 * The mode selector — design v3.0 §03, at the top of the Coach tab.
 *
 * Three cards, one line each on what changes. The active one carries a 2px
 * accent ring; meet prep is dashed until it has a date.
 *
 * ── SWITCHING CHANGES ZERO ROWS ─────────────────────────────────────────────
 * This component calls `setMode` and nothing else. It does not touch routines,
 * it does not touch history, and it does not migrate anything — a mode is a
 * lens over one dataset, and the acceptance item "switching modes changes zero
 * rows of history and zero routine content" is true because there is no code
 * here that could make it false. What a mode re-lenses is decided at the point
 * of use: `ghost-reason.ts` for seeding, `rest.ts` for duration, and the
 * Progress tab's lead section.
 *
 * ── THE MEET DATE ───────────────────────────────────────────────────────────
 * Meet prep is the one mode that asks a question, and it asks it once. Until
 * it is answered the card is dashed and the mode cannot be selected — not as a
 * punishment, but because a block counted back from a platform needs a
 * platform, and seeding percentages from a date the app invented would be the
 * coach making something up.
 */
export function ModeSelector({
  mode,
  meetDate,
  onSelectMode,
  onSetMeetDate,
}: {
  mode: CoachMode
  meetDate: string | null
  onSelectMode: (mode: CoachMode) => void
  onSetMeetDate: (date: string | null) => void
}) {
  const { t } = useLocale()
  const [editingDate, setEditingDate] = useState(false)
  const [draft, setDraft] = useState(meetDate ?? '')

  return (
    <section aria-labelledby="mode-kicker" className="flex flex-col gap-3">
      <h2 id="mode-kicker" className="kicker">
        {t('mode.kicker')}
      </h2>

      {COACH_MODES.map((id) => {
        const behaviour = MODE_BEHAVIOUR[id]
        const active = id === mode
        const ready = isModeReady(id, meetDate)
        const out = id === 'meetprep' ? weeksOut(meetDate) : null

        return (
          <div key={id} className="flex flex-col">
            <button
              type="button"
              onClick={() => {
                if (!ready) {
                  setEditingDate(true)
                  return
                }
                onSelectMode(id)
              }}
              aria-pressed={active}
              className="press flex min-h-[64px] w-full items-center justify-between gap-3 px-4 py-3.5 text-start"
              style={{
                background: ready ? 'var(--color-surface)' : 'transparent',
                borderRadius: 'var(--radius-panel)',
                // Three states, one hue: a 2px accent ring for the live mode,
                // the ordinary hairline card for the others, and a dashed
                // outline for the one that is not set up yet. Dashed already
                // means "not yet real" in this system (the chart's projection
                // segment), so it needs no explanation.
                boxShadow: active
                  ? '0 0 0 2px var(--color-accent)'
                  : ready
                    ? 'var(--shadow-card)'
                    : undefined,
                border: ready ? undefined : '1.5px dashed var(--color-accent-400)',
              }}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-display text-title font-semibold">
                  {t(behaviour.titleKey)}
                </span>
                <span className="text-label leading-[1.4] text-muted">
                  {t(behaviour.bodyKey)}
                </span>
              </span>
              <span
                dir="ltr"
                className="meta-mono shrink-0 text-meta tracking-[0.1em] text-accent-300"
              >
                {active
                  ? t('mode.active')
                  : !ready
                    ? t('mode.set_date')
                    : out !== null
                      ? t('mode.weeks_out', { n: String(out) })
                      : ''}
              </span>
            </button>

            {/* The one question meet prep asks, opened by pressing the card
                rather than by a settings screen nobody would find. */}
            {id === 'meetprep' && editingDate && (
              <form
                className="mt-2 flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  const value = draft.trim()
                  onSetMeetDate(value === '' ? null : value)
                  setEditingDate(false)
                  if (value !== '') onSelectMode('meetprep')
                }}
              >
                <label htmlFor="meet-date" className="sr-only">
                  {t('mode.meet_date')}
                </label>
                <input
                  id="meet-date"
                  type="date"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="h-12 min-w-0 flex-1 border border-line bg-surface px-3 field-text outline-none focus:border-accent"
                  style={{ borderRadius: 'var(--radius-md)' }}
                />
                <button
                  type="submit"
                  className="btn-base btn-secondary h-12 shrink-0 px-4 text-label"
                >
                  {t('mode.meet_date.save')}
                </button>
              </form>
            )}

            {id === 'meetprep' && ready && !editingDate && (
              <button
                type="button"
                onClick={() => {
                  setDraft(meetDate ?? '')
                  setEditingDate(true)
                }}
                className="btn-base btn-quiet mt-1 h-12 self-start px-1 text-label"
              >
                {t('mode.meet_date.change', { date: meetDate ?? '' })}
              </button>
            )}
          </div>
        )
      })}
    </section>
  )
}
