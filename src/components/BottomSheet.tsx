import { useRef } from 'react'
import type { ReactNode } from 'react'
import { useModalLayer } from '../lib/use-modal'
import { useBackLayer } from '../lib/use-back'
import { useLocale } from '../lib/locale-context'

/**
 * The one-card bottom sheet — v3's explainer and Tell-the-coach surface.
 *
 * It exists as a shared shell because the two v3 layers that use it would
 * otherwise each hand-roll a scrim, a dialog role, an escape route and a
 * focus trap, and the app already has a documented answer to all four:
 * `useModalLayer` (focus in, Escape closes, focus back, background inert) and
 * `useBackLayer` (the Android gesture). A layer you can open and not close is
 * the worst kind of dead end, because the thing underneath is still there —
 * and mid-workout the thing underneath is a set somebody is about to log.
 *
 * It sits above the rest bar and the tab bar, which is the whole reason it is
 * a sheet rather than a card in the flow: the board scrolls, and an explainer
 * that scrolled away from the chip it explains would be pointless.
 */
export function BottomSheet({
  labelledBy,
  onClose,
  children,
}: {
  /** Id of the sheet's own kicker. The sheet is named by what it is about. */
  labelledBy: string
  onClose: () => void
  children: ReactNode
}) {
  const { t } = useLocale()
  const ref = useRef<HTMLDivElement>(null)
  useModalLayer(ref, onClose)
  useBackLayer(true, onClose)

  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-end">
      {/* A real button, not an inert div. The set-correction dialog shipped
          with an inert scrim once and it was the only visible way out. */}
      <button
        type="button"
        aria-label={t('sheet.close')}
        onClick={onClose}
        className="absolute inset-0 h-full w-full"
        style={{ background: 'color-mix(in srgb, var(--color-text) 38%, transparent)' }}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="surface-card layer-in relative mx-auto w-full max-w-[430px] p-4"
        style={{
          borderRadius: 'var(--radius-panel) var(--radius-panel) 0 0',
          // Clear the home indicator; the sheet is flush to the bottom edge.
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
