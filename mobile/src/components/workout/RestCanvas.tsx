import { Pressable, View } from 'react-native'

import { palette, space } from '@wazn/domain'

import { Txt, Kick } from '@/design/Txt'
import { Ring } from '@/components/ui/Ring'
import { formatRest, type RestTimer } from '@/hooks/use-rest-timer'

/**
 * Screen 08 — the rest canvas.
 *
 * ── A LAYER, NEVER A ROUTE ──────────────────────────────────────────────────
 * It covers the board; it does not replace it. The board stays mounted, so
 * dismissing costs nothing and no state is rebuilt. Making this a route would
 * unmount the stepper and reset the values a lifter is about to repeat.
 *
 * ── THE RING FILLS ──────────────────────────────────────────────────────────
 * Empty at the start of the rest, whole at the end. Argued the other way twice
 * and wrong both times: a bar draining away is a deadline, a plate filling up
 * is recovery, and this app is about the second thing.
 *
 * ── IT IS PASSIVE ───────────────────────────────────────────────────────────
 * No inputs beyond ±30s and leaving. It never asks anything, never blocks, and
 * a tap anywhere dismisses it. The timer is silent — a single haptic marks the
 * end and nothing else.
 */
export function RestCanvas({
  timer,
  onDismiss,
  nextLabel,
}: {
  timer: RestTimer
  onDismiss: () => void
  /** "Bench Press — set 4", already composed by the caller. */
  nextLabel: string | null
}) {
  if (timer.remaining === null || timer.total === null) return null

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Rest — tap to go early"
      onPress={onDismiss}
      style={{
        position: 'absolute',
        top: 0,
        start: 0,
        end: 0,
        bottom: 0,
        backgroundColor: palette.ink,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        paddingHorizontal: space.gutter,
      }}
    >
      <Kick ink="accentSoft">REST — THE COACH IS THINKING</Kick>

      <Ring progress={timer.progress} size={250} stroke={9}>
        <Txt step="mega" ltr accessibilityRole="timer">
          {formatRest(timer.remaining)}
        </Txt>
        <Kick style={{ marginTop: 2 }}>OF {formatRest(timer.total)}</Kick>
      </Ring>

      {/* The layer dismisses on any tap, so these have to stop the event or
          "+30s" would add thirty seconds and then close the surface showing
          them. */}
      <View
        style={{ flexDirection: 'row', gap: 10 }}
        onStartShouldSetResponder={() => true}
      >
        <Adjust label="− 30s" onPress={() => timer.adjust(-30)} />
        <Adjust label="+ 30s" onPress={() => timer.adjust(30)} />
      </View>

      {nextLabel !== null && (
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Kick>NEXT</Kick>
          <Txt step="fig" ltr>
            {nextLabel}
          </Txt>
        </View>
      )}

      <Txt step="kick" ink="faint">
        TAP TO GO EARLY
      </Txt>
    </Pressable>
  )
}

function Adjust({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: space.touch,
        paddingHorizontal: 24,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.raised,
        opacity: pressed ? 0.82 : 1,
      })}
    >
      <Txt step="body" ltr>
        {label}
      </Txt>
    </Pressable>
  )
}
