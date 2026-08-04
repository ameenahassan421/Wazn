import { useState } from 'react'
import { formatWeight, fromDisplayWeight } from '../lib/units'
import type { Unit } from '../lib/units'
import { useBackLayer } from '../lib/use-back'

/**
 * Correct one logged set.
 *
 * Weight and reps only. Changing an exercise or a set type after the fact is
 * rewriting what happened rather than fixing a typo, and the charts are built
 * from this — so the blast radius stays small on purpose.
 *
 * This is History, not the logging flow, so a dialog is fine here: §2.1
 * protects logging, and nothing is being interrupted mid-set.
 */
export function EditSetDialog({
  exerciseName,
  weightKg,
  reps,
  unit,
  busy,
  onSave,
  onCancel,
}: {
  exerciseName: string
  weightKg: number | null
  reps: number | null
  unit: Unit
  busy: boolean
  onSave: (weightKg: number | null, reps: number | null) => void
  onCancel: () => void
}) {
  const [weight, setWeight] = useState(
    weightKg === null ? '' : formatWeight(weightKg, unit),
  )
  const [repsText, setRepsText] = useState(reps === null ? '' : String(reps))
  // The system back gesture dismisses the dialog, as it would any sheet.
  useBackLayer(true, onCancel)

  function submit() {
    const parsedWeight = weight.trim() === '' ? null : Number.parseFloat(weight)
    const parsedReps = repsText.trim() === '' ? null : Number.parseInt(repsText, 10)
    onSave(
      parsedWeight === null || !Number.isFinite(parsedWeight)
        ? null
        : Number(fromDisplayWeight(parsedWeight, unit).toFixed(2)),
      parsedReps === null || !Number.isFinite(parsedReps) ? null : parsedReps,
    )
  }

  return (
    <div
      role="dialog"
      aria-label={`Edit set — ${exerciseName}`}
      className="fixed inset-0 z-30 flex items-end justify-center bg-ink/80 px-4 pb-6"
    >
      <div className="w-full max-w-[430px] rounded-lg border border-line bg-surface p-4">
        <p className="text-sm font-semibold">{exerciseName}</p>

        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1">
            <label htmlFor="edit-weight" className="text-xs text-muted">
              Weight ({unit})
            </label>
            <input
              id="edit-weight"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="BW"
              className="tnum h-14 w-full rounded-lg border border-line bg-ink px-3 text-start text-2xl font-semibold outline-none placeholder:text-muted focus:border-accent"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="edit-reps" className="text-xs text-muted">
              Reps
            </label>
            <input
              id="edit-reps"
              type="number"
              inputMode="numeric"
              min="0"
              value={repsText}
              onChange={(e) => setRepsText(e.target.value)}
              className="tnum h-14 w-full rounded-lg border border-line bg-ink px-3 text-start text-2xl font-semibold outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-12 flex-1 rounded-lg border border-line text-base font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="h-12 flex-1 rounded-lg bg-accent text-base font-bold text-accent-ink disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
