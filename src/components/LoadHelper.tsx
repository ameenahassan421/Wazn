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
export function LoadHelper({ weight, unit }: { weight: number | null; unit: Unit }) {
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
            <p className="text-xs text-muted">Warm-up</p>
            {ramp ? (
              <ul className="mt-1 flex flex-col gap-1">
                {ramp.map((s) => (
                  <li
                    key={s.percent}
                    className="tnum flex items-baseline gap-3 text-base"
                  >
                    <span className="w-10 text-xs text-muted">
                      {Math.round(s.percent * 100)}%
                    </span>
                    <span className="flex-1 font-semibold">
                      {s.weight} {unit}
                    </span>
                    <span className="text-muted">× {s.reps}</span>
                  </li>
                ))}
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
