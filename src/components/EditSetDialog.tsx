import { useState } from 'react'
import { formatWeight, fromDisplayWeight } from '../lib/units'
import type { Unit } from '../lib/units'
import { useBackLayer } from '../lib/use-back'
import { SET_TYPE_CYCLE, SET_TYPE_NAME } from '../lib/types'
import type { SetType } from '../lib/types'
import { useLocale } from '../lib/locale-context'

/**
 * Correct one logged set: weight, reps, set type, RPE.
 *
 * It was weight and reps only, on the reasoning that changing a set type after
 * the fact is rewriting what happened rather than fixing a typo. U4 widens it,
 * and the earlier reasoning was half right: marking a set as the warm-up it
 * always was is a CORRECTION, and leaving it uncorrectable meant a mislabelled
 * warm-up inflated every record and chart it touched with no way to fix it. The
 * exercise still cannot be changed here, because that genuinely is rewriting
 * history rather than correcting a label.
 *
 * The consequence is real and handled: a set type change moves a set in and out
 * of the record and chart calculations, which is why the caller re-runs
 * `refreshRecords` afterwards exactly as it does for weight.
 *
 * This is History, not the logging flow, so a dialog is fine here: §2.1
 * protects logging, and nothing is being interrupted mid-set.
 */
export interface SetEdit {
  weightKg: number | null
  reps: number | null
  setType: SetType
  rpe: number | null
}

export function EditSetDialog({
  exerciseName,
  weightKg,
  reps,
  setType,
  rpe,
  unit,
  busy,
  onSave,
  onCancel,
}: {
  exerciseName: string
  weightKg: number | null
  reps: number | null
  setType: SetType
  rpe: number | null
  unit: Unit
  busy: boolean
  onSave: (edit: SetEdit) => void
  onCancel: () => void
}) {
  const { t } = useLocale()
  const [weight, setWeight] = useState(
    weightKg === null ? '' : formatWeight(weightKg, unit),
  )
  const [repsText, setRepsText] = useState(reps === null ? '' : String(reps))
  const [kind, setKind] = useState<SetType>(setType)
  const [rpeValue, setRpeValue] = useState<number | null>(rpe)
  // The system back gesture dismisses the dialog, as it would any sheet.
  useBackLayer(true, onCancel)

  function submit() {
    const parsedWeight = weight.trim() === '' ? null : Number.parseFloat(weight)
    const parsedReps = repsText.trim() === '' ? null : Number.parseInt(repsText, 10)
    onSave({
      weightKg:
        parsedWeight === null || !Number.isFinite(parsedWeight)
          ? null
          : Number(fromDisplayWeight(parsedWeight, unit).toFixed(2)),
      reps: parsedReps === null || !Number.isFinite(parsedReps) ? null : parsedReps,
      setType: kind,
      rpe: rpeValue,
    })
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
              {t('set.edit.reps')}
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

        <fieldset className="mt-3">
          <legend className="text-xs text-muted">{t('set.edit.type')}</legend>
          <div className="mt-1 flex gap-2">
            {SET_TYPE_CYCLE.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={kind === option}
                aria-label={SET_TYPE_NAME[option]}
                onClick={() => setKind(option)}
                className={`btn-base h-12 flex-1 text-sm capitalize ${
                  kind === option ? 'btn-primary' : 'btn-secondary'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          {kind === 'warmup' && (
            <p className="mt-1 text-[11px] text-muted">{t('set.edit.warmup_note')}</p>
          )}
        </fieldset>

        <fieldset className="mt-3">
          <legend className="text-xs text-muted">{t('set.edit.rpe')}</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {/* Tapping the selected value clears it, so "I should not have
                recorded an RPE here" is reachable without a separate control. */}
            <button
              type="button"
              aria-pressed={rpeValue === null}
              onClick={() => setRpeValue(null)}
              className={`btn-base h-12 px-3.5 text-sm ${
                rpeValue === null ? 'btn-primary' : 'btn-secondary'
              }`}
            >
              {t('set.edit.rpe.none')}
            </button>
            {[6, 7, 8, 9, 10].map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={rpeValue === value}
                onClick={() => setRpeValue(rpeValue === value ? null : value)}
                className={`btn-base tnum h-12 w-12 text-sm ${
                  rpeValue === value ? 'btn-primary' : 'btn-secondary'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-12 flex-1 rounded-lg border border-line text-base font-semibold"
          >
            {t('set.edit.cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="h-12 flex-1 rounded-lg bg-accent text-base font-bold text-accent-ink disabled:opacity-60"
          >
            {busy ? t('set.edit.saving') : t('set.edit.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
