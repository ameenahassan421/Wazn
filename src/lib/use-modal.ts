import { useEffect } from 'react'
import type { RefObject } from 'react'

/**
 * The three things a `role="dialog"` has to do that this app's overlays did not.
 *
 * `useBackLayer` already gave them the Android back gesture, and that was the
 * whole escape route: iOS has no system back, the rest layer's only visible
 * exit is a chevron a screen reader never reached, and the set-correction
 * dialog's scrim was an inert `<div>`. A layer you can open and not close is
 * the worst kind of dead end, because the thing underneath is still there.
 *
 *  1. **Focus goes in.** Otherwise focus stays on the button that opened the
 *     layer — behind an overlay — and the first Tab walks the page underneath
 *     while the reader is told nothing changed.
 *  2. **Escape closes.** The keyboard equivalent of the back gesture.
 *  3. **Focus comes back.** To whatever opened it, so closing returns you to
 *     where you were rather than to the top of the document.
 *
 * `aria-modal` is the caller's job — it belongs on the same element as the
 * role, and putting it here would mean this hook owning the markup.
 */
export function useModalLayer(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    const opener = document.activeElement
    const node = ref.current

    // Prefer something the reader can act on; fall back to the container,
    // which needs `tabIndex={-1}` to be focusable at all.
    const target =
      node?.querySelector<HTMLElement>(
        'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
      ) ?? node
    target?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', onKey)

    /*
     * And keep Tab inside. `aria-modal="true"` is a promise to assistive
     * technology that the rest of the page is unavailable; it does not make
     * that true for the keyboard, so without this Tab walked straight out of
     * the dialog and into the workout board behind it — announced as hidden,
     * still focusable, which is the worst of both.
     *
     * `inert` rather than a focus-trap loop: it takes the background out of
     * the tab order AND the accessibility tree in one property, which is the
     * thing aria-modal was only claiming.
     */
    const siblings = Array.from(node?.parentElement?.children ?? []).filter(
      (child): child is HTMLElement => child !== node && child instanceof HTMLElement,
    )
    // The attribute rather than the property: assigning `child.inert` trips
    // the compiler's immutability rule, and `setAttribute` is the same thing
    // to the browser.
    for (const child of siblings) child.setAttribute('inert', '')

    return () => {
      for (const child of siblings) child.removeAttribute('inert')
      document.removeEventListener('keydown', onKey)
      if (opener instanceof HTMLElement && document.contains(opener)) {
        opener.focus()
      }
    }
    // Mount and unmount only. Re-running on a new `onClose` identity would
    // steal focus back to the top of the layer mid-edit, which is exactly the
    // behaviour this exists to prevent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
