import { useId, useState } from 'react'
import { platesFor, DEFAULT_BAR, BAR_WEIGHTS } from '../lib/plates'
import { warmupRamp } from '../lib/warmup'
import type { Unit } from '../lib/units'
import { useLocale } from '../lib/locale-context'
import { PlateCard } from './PlateCard'

/**
 * Plate breakdown and warm-up ramp for the weight currently typed.
 *
 * R5 split this in two. What is on the bar is now always on screen, as the
 * design's plate card: it is the question standing between the number and
 * the set, and the design answers it in the commit cluster. The bar picker,
 * the closest-loadable note and the ramp stay one tap deeper, because those
 * ARE questions you ask before the first working set rather than between
 * sets — the argument this component was built on, kept for the half it
 * still applies to. The deviation is logged in DECISIONS.md.
 *
 * Barbell-only by nature. Shown for any typed weight rather than gated on
 * `equipment`, because the catalogue's equipment field comes from a fuzzy
 * import and a wrongly-hidden calculator is worse than a harmlessly-shown
 * one. The design gates on its own `bar` field; the app has no trustworthy
 * equivalent, so this stays.
 */
export function LoadHelper({
  weight,
  unit,
  onLogStep,
  loggedWeights,
  busy,
}: {
  weight: number | null
  unit: Unit
  /**
   * Logs one ramp row as a warm-up set, in display units. Omit and the ramp
   * stays a table of numbers to copy by hand.
   */
  onLogStep?: (weight: number, reps: number) => void
  /** Warm-up weights already logged for this exercise, in display units. */
  loggedWeights?: number[]
  busy?: boolean
}) {
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  const [bar, setBar] = useState<number>(DEFAULT_BAR[unit])
  const detailsId = useId()

  // The bar is stamped in one unit; switching the display switches the bar.
  const [barUnit, setBarUnit] = useState<Unit>(unit)
  if (barUnit !== unit) {
    setBarUnit(unit)
    setBar(DEFAULT_BAR[unit])
  }

  if (weight === null || weight <= 0) return null

  const plates = platesFor(weight, unit, bar)
  const ramp = warmupRamp(weight, unit, bar)

  return (
    <div className="flex flex-col gap-2">
      <PlateCard
        weight={weight}
        unit={unit}
        bar={bar}
        expanded={open}
        detailsId={detailsId}
        onToggle={() => setOpen((o) => !o)}
      />

      {open && (
        <div
          id={detailsId}
          className="ring-edge flex flex-col gap-3 bg-surface px-3 py-3"
          style={{ borderRadius: 'var(--radius-panel)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">{t('load.bar')}</span>
            {BAR_WEIGHTS[unit].map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBar(b)}
                aria-pressed={bar === b}
                className={`tnum h-12 min-w-14 rounded-md border px-3 text-sm font-semibold ${
                  bar === b ? 'border-accent text-accent' : 'border-line text-muted'
                }`}
              >
                {b}
              </button>
            ))}
          </div>

          {/* No per-side figure here any more: the card above it now states
              exactly that, in a form that cannot be misread. The grouped
              "45 × 2, 5" this used to print reads as 45 × 2.5 at a glance,
              which is the wrong number and the wrong bar. What is left is
              the part the card cannot say — that the plates do not reach
              what was typed. */}
          {plates && plates.remainder !== 0 && (
            <p className="text-xs text-muted">
              {t('load.closest', {
                weight: String(plates.achievable),
                unit,
                off: String(Math.abs(plates.remainder)),
              })}
            </p>
          )}

          <div>
            <p className="text-xs text-muted">
              {onLogStep ? t('load.warmup_hint') : t('load.warmup')}
            </p>
            {ramp ? (
              <ul className="mt-1 flex flex-col">
                {ramp.map((s) => {
                  // Matching on the weight rather than on an id: the ramp is
                  // recomputed from whatever is typed, so a row has no
                  // identity beyond the load it names.
                  const logged = (loggedWeights ?? []).some(
                    (w) => Math.abs(w - s.weight) < 0.01,
                  )
                  const figures = (
                    <>
                      <span className="w-10 shrink-0 text-xs text-muted">
                        {Math.round(s.percent * 100)}%
                      </span>
                      <span className="flex-1 text-start font-semibold" dir="ltr">
                        {s.weight} {unit}
                      </span>
                      <span className="text-muted" dir="ltr">
                        × {s.reps}
                      </span>
                    </>
                  )
                  return (
                    <li key={s.percent} className="tnum text-base">
                      {onLogStep ? (
                        <button
                          type="button"
                          disabled={logged || busy}
                          onClick={() => onLogStep(s.weight, s.reps)}
                          aria-label={t(logged ? 'load.logged_aria' : 'load.log_aria', {
                            weight: String(s.weight),
                            unit,
                            reps: String(s.reps),
                          })}
                          className="flex h-12 w-full items-center gap-3 disabled:opacity-45"
                        >
                          {figures}
                          <span className="w-12 shrink-0 text-end text-[11px] font-medium text-accent-300">
                            {logged ? t('load.logged') : t('load.log')}
                          </span>
                        </button>
                      ) : (
                        <div className="flex h-9 items-center gap-3">{figures}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted">{t('load.no_ramp')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
