import { useState } from 'react'
import { BottomSheet } from './BottomSheet'
import { useLocale } from '../lib/locale-context'
import { useUnit } from '../lib/unit-context'
import { formatWeight } from '../lib/units'
import {
  TELL_COACH_CHIPS,
  proposeEdit,
  type ProposedEdit,
  type TellCoachChip,
  type TellCoachContext,
} from '../lib/tell-coach'

/**
 * "Tell the coach" — design v3.0 §07, the app's one conversational surface.
 *
 * Chips first, free text allowed, and what comes back is **only ever a
 * proposed edit rendered as the app's own objects**, with Accept / Keep as
 * planned. No thread, no history, no follow-up question — the sheet closes on
 * either button and keeps nothing.
 *
 * ── WHERE THE CONTRACT IS ENFORCED ──────────────────────────────────────────
 * Not here. `lib/tell-coach.ts` returns a closed union with no field a
 * sentence could arrive in, and no model is called at any point. This
 * component's job is to render four shapes and two buttons, which is why it
 * cannot be talked into anything: there is no branch that prints arbitrary
 * text except the one that echoes the lifter's own note back to them.
 *
 * ── AND IT DOES NOT EXIST OUTSIDE A WORKOUT ─────────────────────────────────
 * Enforced by where it is mounted — the workout branch of LogScreen, which
 * does not render when no workout is open. Asking Wazn about creatine remains
 * impossible, by design.
 */

const CHIP_KEY: Record<TellCoachChip, string> = {
  'too-heavy': 'tell.chip.heavy',
  'shoulder-off': 'tell.chip.shoulder',
  'no-bench-free': 'tell.chip.equipment',
  'short-on-time': 'tell.chip.time',
}

export function TellCoachSheet({
  exerciseName,
  context,
  onAccept,
  onClose,
}: {
  exerciseName: string
  context: TellCoachContext
  onAccept: (edit: ProposedEdit) => void
  onClose: () => void
}) {
  const { t } = useLocale()
  const { unit } = useUnit()
  const [text, setText] = useState('')
  const [edit, setEdit] = useState<ProposedEdit | null>(null)
  const titleId = 'tell-coach-title'

  if (edit) {
    return (
      <BottomSheet labelledBy={titleId} onClose={onClose}>
        <p id={titleId} className="kicker" style={{ color: 'var(--color-accent-300)' }}>
          {t('tell.proposed')}
        </p>

        <Proposal edit={edit} exerciseName={exerciseName} unit={unit} />

        {/* The non-medical line, and only when pain words were used. It is an
            existing string rather than anything composed here — the coach
            never diagnoses, so it never phrases. */}
        {edit.kind === 'ease-load' && edit.nonMedical && (
          <p className="mt-3 text-[12px] text-muted">{t('tell.non_medical')}</p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              onAccept(edit)
              onClose()
            }}
            className="btn-base btn-hero press h-12 flex-1 text-[15px]"
            style={{ borderRadius: 10 }}
          >
            {t('tell.accept')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn-base btn-secondary press h-12 flex-1 text-[15px]"
            style={{ borderRadius: 10 }}
          >
            {t('tell.keep')}
          </button>
        </div>
      </BottomSheet>
    )
  }

  return (
    <BottomSheet labelledBy={titleId} onClose={onClose}>
      <p id={titleId} className="kicker" style={{ color: 'var(--color-accent-300)' }}>
        {t('tell.kicker')}
      </p>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {TELL_COACH_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => setEdit(proposeEdit({ chip }, context))}
            // 32px pill, 48px target — the same reconciliation the check-in
            // row makes between the design's drawing and §2.4's floor.
            className="press flex h-12 items-center"
          >
            <span
              className="grid h-8 place-items-center px-3 text-[13px]"
              style={{ borderRadius: 16, border: '1px solid var(--color-line)' }}
            >
              {t(CHIP_KEY[chip])}
            </span>
          </button>
        ))}
      </div>

      <form
        className="mt-1 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          setEdit(proposeEdit({ text }, context))
        }}
      >
        <label htmlFor="tell-coach-text" className="sr-only">
          {t('tell.placeholder')}
        </label>
        <input
          id="tell-coach-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('tell.placeholder')}
          className="h-12 min-w-0 flex-1 border border-line bg-ink px-3 text-[13px] outline-none placeholder:text-muted focus:border-accent"
          style={{ borderRadius: 'var(--radius-md)' }}
        />
        <button
          type="submit"
          className="btn-base btn-secondary h-12 shrink-0 px-4 text-[13px]"
        >
          {t('tell.send')}
        </button>
      </form>

      <p className="meta-mono mt-2.5 text-nano text-muted">{t('tell.contract')}</p>
    </BottomSheet>
  )
}

/** The four shapes an edit can take, and nothing else. */
function Proposal({
  edit,
  exerciseName,
  unit,
}: {
  edit: ProposedEdit
  exerciseName: string
  unit: 'kg' | 'lbs'
}) {
  const { t } = useLocale()

  switch (edit.kind) {
    case 'ease-load':
      return (
        <>
          <p dir="auto" className="mt-2 text-[15px] font-semibold">
            {exerciseName}
          </p>
          <p className="mt-1 text-[14px] leading-[1.5] text-muted">
            {t('tell.ease.body')}
          </p>
          <span dir="ltr" className="chip-data tnum mt-2.5 inline-flex">
            {formatWeight(edit.fromKg, unit)} → {formatWeight(edit.toKg, unit)} {unit}
          </span>
        </>
      )
    case 'trim':
      return (
        <>
          <p dir="auto" className="mt-2 text-[15px] font-semibold">
            {exerciseName}
          </p>
          <p className="mt-1 text-[14px] leading-[1.5] text-muted">
            {t('tell.trim.body')}
          </p>
          <span dir="ltr" className="chip-data tnum mt-2.5 inline-flex">
            {t('tell.trim.chip', {
              from: String(edit.fromSets),
              to: String(edit.toSets),
            })}
          </span>
        </>
      )
    case 'swap':
      return (
        <>
          <p dir="auto" className="mt-2 text-[15px] font-semibold">
            {exerciseName}
          </p>
          <p className="mt-1 text-[14px] leading-[1.5] text-muted">
            {t('tell.swap.body')}
          </p>
        </>
      )
    case 'note':
      return (
        <>
          <p dir="auto" className="mt-2 text-[15px] font-semibold">
            {exerciseName}
          </p>
          <p className="mt-1 text-[14px] leading-[1.5] text-muted">
            {t('tell.note.body')}
          </p>
          {/* The lifter's own words, echoed. The one string on this surface
              that is not from the catalogue — and it is theirs, not ours. */}
          {edit.text && (
            <p dir="auto" className="mt-2 text-[14px] italic">
              “{edit.text}”
            </p>
          )}
        </>
      )
  }
}
