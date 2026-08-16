import { BottomSheet } from './BottomSheet'
import { useLocale } from '../lib/locale-context'
import { useUnit } from '../lib/unit-context'
import { formatWeight } from '../lib/units'
import type { GhostVerdict } from '../lib/ghost-reason'

/**
 * "Trust is built by showing the work" — design v3.0 §02.
 *
 * Tapping a reasoning chip opens this: two or three lines and the numbers,
 * with **exactly two actions**, `Keep coach's plan` and `Use last session`.
 * Not three, and not a "don't show this again": the whole point of the sheet
 * is that the lifter can audit a proposal and take it or leave it, and a third
 * option is a third thing to read while somebody is between sets.
 *
 * Every line is built from the verdict's own `facts`, so the explanation
 * cannot drift from the row it explains. There is no free text anywhere in
 * this component — a sentence written here rather than derived would be the
 * one place the app could say something the numbers do not support.
 */
export function ReasonSheet({
  verdict,
  exerciseName,
  onKeep,
  onUseLast,
  onClose,
}: {
  verdict: GhostVerdict
  exerciseName: string
  onKeep: () => void
  onUseLast: () => void
  onClose: () => void
}) {
  const { t } = useLocale()
  const { unit } = useUnit()
  const titleId = 'reason-sheet-title'
  const w = (kg: number | null | undefined) =>
    kg === null || kg === undefined ? '—' : formatWeight(kg, unit)

  const lines: string[] = []
  switch (verdict.cause) {
    case 'under-plan':
      lines.push(
        t('reason.under_plan.what', {
          label: verdict.facts.causeSetLabel ?? '',
          planned: String(verdict.facts.plannedReps ?? ''),
          actual: String(verdict.facts.actualReps ?? ''),
        }),
        t('reason.under_plan.why', { weight: w(verdict.weightKg), unit }),
      )
      break
    case 'progression':
      lines.push(
        t('reason.progression.what', {
          run: (verdict.facts.previousRepsRun ?? []).join('/'),
          weight: w(verdict.facts.previousKg),
          unit,
        }),
        t('reason.progression.why', { weight: w(verdict.weightKg), unit }),
      )
      break
    case 'readiness':
      lines.push(t('reason.readiness.what'), t('reason.readiness.why'))
      break
    case 'rep-band':
      lines.push(
        t('reason.rep_band.what', {
          from: String(verdict.facts.previousReps ?? ''),
          to: String(verdict.reps ?? ''),
        }),
        t('reason.rep_band.why'),
      )
      break
    case 'none':
      lines.push(t('reason.none'))
      break
  }

  return (
    <BottomSheet labelledBy={titleId} onClose={onClose}>
      <p id={titleId} className="kicker" style={{ color: 'var(--color-accent-300)' }}>
        {t('reason.kicker')}
      </p>
      <p dir="auto" className="mt-2 text-title font-semibold">
        {exerciseName}
      </p>
      <div className="mt-2 flex flex-col gap-1.5">
        {lines.map((line) => (
          <p key={line} className="text-body leading-[1.5] text-muted">
            {line}
          </p>
        ))}
      </div>

      {/* The numbers, in the app's own chip. The sheet is an audit trail, so
          the figures it argues from are shown rather than described. */}
      <span dir="ltr" className="chip-data tnum mt-3">
        {t('reason.chip', {
          from: w(verdict.facts.previousKg),
          to: w(verdict.weightKg),
          unit,
          reps: String(verdict.reps ?? '—'),
        })}
      </span>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onKeep}
          className="btn-base btn-hero press h-12 flex-1 btn-text"
          style={{ borderRadius: 10 }}
        >
          {t('reason.keep')}
        </button>
        <button
          type="button"
          onClick={onUseLast}
          className="btn-base btn-secondary press h-12 flex-1 btn-text"
          style={{ borderRadius: 10 }}
        >
          {t('reason.use_last')}
        </button>
      </div>
    </BottomSheet>
  )
}
