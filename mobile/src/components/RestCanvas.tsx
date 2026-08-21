import { useEffect, useState } from 'react'
import { View } from 'react-native'

import { palette, space } from '@wazn/domain'

import { Ring } from '@/components/ui/Ring'
import { Txt, Kick } from '@/design/Txt'
import { restEnded } from '@/services/haptics'

/**
 * Screen 08, the rest canvas.
 *
 * ── THE RING FILLS, IT DOES NOT DRAIN ───────────────────────────────────────
 * `progress` runs 0 to 1 as the rest elapses, so the ring closes as the lifter
 * gets closer to lifting again. A draining ring says "time is running out",
 * which is the opposite of what rest is: the bar is not going anywhere and the
 * clock is on their side.
 *
 * ── IT IS SILENT ────────────────────────────────────────────────────────────
 * Do-not-regress #5. No sound, ever, from a timer in a room where somebody is
 * under a bar. The end announces itself through the hand, once, via
 * `restEnded()`. That is the whole notification.
 *
 * ── IT NEVER BLOCKS AND NEVER ASKS ──────────────────────────────────────────
 * A tap anywhere dismisses it, and it is a plain overlay rather than a modal:
 * no focus trap, no dialog role, nothing that has to be answered.
 *
 * ── IT APPEARS ON ITS OWN, SINCE 2026-08-17 ─────────────────────────────────
 * Ameen turned the takeover on. Warm-ups are excluded for free, because the
 * commit rule already starts no rest for them.
 *
 * It takes no props for dismissing or adjusting, and that is deliberate: this
 * surface has no inputs and no touches. The session screen dismisses it on the
 * first touch anywhere, and the rest bar on the board owns the timer.
 */
export function RestCanvas({
  endsAt,
  total,
  nextLabel,
}: {
  endsAt: number
  total: number
  /** The set waiting on the other side, already formatted and unit-aware. */
  nextLabel: string | null
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now())
    }, 250)
    return () => {
      clearInterval(id)
    }
  }, [])

  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000))

  /**
   * Fires once, on the transition to zero, rather than on every render where
   * remaining happens to be 0. The canvas stays up afterwards: rest ending is
   * information, not an instruction to go.
   */
  useEffect(() => {
    if (remaining === 0) restEnded()
  }, [remaining === 0])

  const progress = total <= 0 ? 1 : Math.min(1, (total - remaining) / total)
  const minutes = Math.floor(remaining / 60)
  const seconds = String(remaining % 60).padStart(2, '0')

  return (
    /*
     * `pointerEvents="none"`, and it is the whole design rather than a detail.
     *
     * v5 screen 08 is "passive, silent, no inputs; vanishes on interaction".
     * Built as a full-screen Pressable, this swallowed every touch on the
     * board, so the next set cost dismiss-then-commit and GATE U2's one tap
     * became two. A zIndex cannot fix that: whatever is on top of a Pressable
     * still has a Pressable under it eating the rest of the screen.
     *
     * Taking no touches at all means the first tap lands wherever the lifter
     * aimed it, and the screen's own `onTouchStart` clears the canvas on the
     * way past. One tap, everywhere. The web half is `RestExpanded`'s
     * `takeover` prop, where the same defect wore `inert` instead.
     *
     * `progressbar` rather than `button`: it announces the rest, and there is
     * nothing here to press.
     */
    <View
      pointerEvents="none"
      accessibilityRole="progressbar"
      accessibilityLabel="Rest. Tap anywhere to go early."
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        start: 0,
        end: 0,
        // Paint order only, now that nothing here takes a touch: 29 keeps the
        // BANK IT bar at 31 reading as ON the canvas rather than behind it.
        zIndex: 29,
        backgroundColor: palette.paper,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        paddingHorizontal: space.gutter,
      }}
    >
      {/* The coach's voice, not a section label, so it takes the accent tier
          rather than muted. A middot replaces the reference's dash: no
          em-dashes in copy a user reads. */}
      <Kick ink="accentSoft">REST · THE COACH IS THINKING</Kick>

      <Ring progress={progress} size={250}>
        <Txt step="mega" ltr style={{ fontSize: 64 }}>
          {`${minutes}:${seconds}`}
        </Txt>
      </Ring>

      {nextLabel !== null && (
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Kick>NEXT</Kick>
          <Txt step="fig" ltr style={{ fontSize: 38 }}>
            {nextLabel}
          </Txt>
        </View>
      )}

      {/* The ±30s pair is GONE, and that is the spec rather than a casualty.
          Screen 08 says this surface has no inputs; a layer taking no touches
          could not have driven them anyway. Changing the timer is the rest
          bar's job on the board underneath, which is one tap away because
          this canvas no longer stands between the finger and the screen. */}

      <Kick ink="muted">TAP TO GO EARLY</Kick>
    </View>
  )
}
