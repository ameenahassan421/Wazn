import { useState } from 'react'
import { platesFor, describePlates, DEFAULT_BAR, BAR_WEIGHTS } from '../lib/plates'
import { warmupRamp } from '../lib/warmup'
import type { Unit } from '../lib/units'

/**
 * Plate breakdown and warm-up ramp for the weight currently typed.
 *
 * Collapsed by default. Both are answers to questions you ask before the first
 * working set, not between sets, so putting them in the flow permanently would
 * cost every set to serve a few — and §2.1 protects that flow. Opening it is
 * one tap and it stays open for the exercise.
 *
 * Barbell-only by nature. Shown for any typed weight rather than gated on
 * `equipment`, because the catalogue's equipment field comes from a fuzzy
 * import and a wrongly-hidden calculator is worse than a harmlessly-shown one.
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
  const [open, setOpen] = useState(false)
  const [bar, setBar] = useState<number>(DEFAULT_BAR[unit])

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
    <div className="rounded-lg border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-12 w-full items-center gap-2 px-3 text-start"
      >
        <span className="text-xs text-muted">Plates &amp; warm-up</span>
        <span className="tnum ms-auto text-sm text-muted">
          {plates ? describePlates(plates) : `under the ${bar} ${unit} bar`}
        </span>
        <span aria-hidden="true" className="text-muted">
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-line px-3 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Bar</span>
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

          <div>
            <p className="text-xs text-muted">Per side</p>
            <p className="tnum text-2xl font-semibold">
              {plates ? describePlates(plates) : '—'}
            </p>
            {plates && plates.remainder !== 0 && (
              <p className="text-xs text-muted">
                Closest loadable is {plates.achievable} {unit} — off by{' '}
                {Math.abs(plates.remainder)}.
              </p>
            )}
          </div>

          <div>
            <p className="text-xs text-muted">
              Warm-up{onLogStep ? ' · tap a row to log it' : ''}
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
                      <span className="flex-1 text-start font-semibold">
                        {s.weight} {unit}
                      </span>
                      <span className="text-muted">× {s.reps}</span>
                    </>
                  )
                  return (
                    <li key={s.percent} className="tnum text-base">
                      {onLogStep ? (
                        <button
                          type="button"
                          disabled={logged || busy}
                          onClick={() => onLogStep(s.weight, s.reps)}
                          aria-label={
                            logged
                              ? `${s.weight} ${unit} for ${s.reps} already logged`
                              : `Log ${s.weight} ${unit} for ${s.reps} as a warm-up`
                          }
                          className="flex h-12 w-full items-center gap-3 disabled:opacity-45"
                        >
                          {figures}
                          <span className="w-12 shrink-0 text-end text-[11px] font-medium text-accent">
                            {logged ? 'logged' : 'Log'}
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
              <p className="text-sm text-muted">
                Nothing to ramp through at this weight.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
