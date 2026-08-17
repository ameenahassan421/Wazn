import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'

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
 * no focus trap, no dialog role, nothing that has to be answered. That
 * distinction is what kept the web version off the do-not-regress list, and
 * it is the reason the takeover-on-commit question is still open rather than
 * quietly implemented here.
 *
 * The ±30s controls stop the tap from propagating, or "+30s" would add thirty
 * seconds and then close the surface showing them.
 */
export function RestCanvas({
  endsAt,
  total,
  nextLabel,
  onDismiss,
  onAdjust,
}: {
  endsAt: number
  total: number
  /** The set waiting on the other side, already formatted and unit-aware. */
  nextLabel: string | null
  onDismiss: () => void
  onAdjust: (deltaSeconds: number) => void
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
    <Pressable
      onPress={onDismiss}
      accessibilityRole="button"
      accessibilityLabel="Rest. Tap to go early."
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        start: 0,
        end: 0,
        zIndex: 50,
        backgroundColor: palette.ink,
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

      <View
        style={{ flexDirection: 'row', gap: 10 }}
        onStartShouldSetResponder={() => true}
      >
        <Adjust label="−30s" onPress={() => onAdjust(-30)} />
        <Adjust label="+30s" onPress={() => onAdjust(30)} />
      </View>

      <Kick ink="faint">TAP TO GO EARLY</Kick>
    </Pressable>
  )
}

function Adjust({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={{
        height: 48,
        paddingHorizontal: 20,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: palette.line,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Txt step="label" ink="muted" ltr>
        {label}
      </Txt>
    </Pressable>
  )
}
