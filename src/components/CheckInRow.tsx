import { useState } from 'react'
import { CHECK_INS, type CheckIn } from '../lib/readiness'
import { useLocale } from '../lib/locale-context'

/**
 * "HOW LOADED?" — design v3.0 §New inputs 1, the one row on the idle Log
 * screen that asks the lifter anything.
 *
 * One tap, never a modal, never required. A skipped check-in is Normal,
 * silently — which is why there is no "skip" control and no empty state: the
 * row simply stops mattering if nobody touches it, and `readiness.ts` already
 * treats `null` and `'normal'` the same way.
 *
 * ── THE 30px CHIP AND THE 48px FLOOR ────────────────────────────────────────
 * The design draws these at 30px tall. WAZN_PLAN §2.4's touch floor is 48px
 * and it is a non-negotiable, so the two are reconciled rather than one of
 * them being chosen: the BUTTON is 48px and the PILL drawn inside it is 30px.
 * The row reads exactly as drawn and the target is the size a thumb needs.
 * Doing it the other way — shrinking the target to match the drawing — is the
 * kind of silent reversal DECISIONS.md exists to catch.
 */

const LABEL_KEY: Record<CheckIn, string> = {
  fresh: 'checkin.fresh',
  normal: 'checkin.normal',
  drained: 'checkin.drained',
}

export function CheckInRow({
  value,
  onChange,
}: {
  value: CheckIn | null
  onChange: (state: CheckIn) => void
}) {
  const { t } = useLocale()
  /**
   * "One tap, then the row collapses to a 20px mono line" (spec §New inputs 1).
   *
   * The collapse is state rather than a function of `value`, and the
   * difference matters: somebody who tapped yesterday and comes back today
   * should see the row OPEN, because the question is about today. Only a tap
   * in this session collapses it, and the collapsed line is a button, so a
   * mis-tap is one press from being corrected rather than stuck until
   * tomorrow.
   */
  const [collapsed, setCollapsed] = useState(false)

  if (collapsed && value) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="press flex h-12 items-center gap-2 self-start text-start"
      >
        <span className="kicker">{t('checkin.kicker')}</span>
        <span className="meta-mono text-meta text-accent-300 uppercase">
          {t(LABEL_KEY[value])}
        </span>
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className="kicker">{t('checkin.kicker')}</span>
      {/* `radiogroup` rather than three toggles: exactly one of these is true
          at a time, and a screen reader should hear "1 of 3" rather than
          three unrelated pressed states. */}
      <div role="radiogroup" aria-label={t('checkin.kicker')} className="flex gap-1.5">
        {CHECK_INS.map((state) => {
          const on = state === value
          return (
            <button
              key={state}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                onChange(state)
                setCollapsed(true)
              }}
              className="press flex h-12 items-center"
            >
              <span
                className="grid h-[30px] place-items-center px-3 text-label"
                style={{
                  borderRadius: 15,
                  background: on ? 'var(--flip-bg)' : 'transparent',
                  color: on ? 'var(--flip-text)' : 'var(--color-muted)',
                  border: on ? '1px solid transparent' : '1px solid var(--color-line)',
                }}
              >
                {t(LABEL_KEY[state])}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
