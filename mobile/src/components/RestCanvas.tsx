import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { radius, space } from '@wazn/domain'

import { Ring } from '@/components/ui/Ring'
import { Plate } from '@/components/ui/Plate'
import { Txt } from '@/design/Txt'
import { restEnded, tick } from '@/services/haptics'
import { usePalette, useTheme } from '@/hooks/use-theme'

/**
 * Rest, against `docs/design/prototype/source.html` — the screen labelled
 * "Rest". The one dark surface in the whole app.
 *
 * ── IT TAKES TOUCHES NOW, AND THAT REVERSES A DELIBERATE DECISION ───────────
 * The previous version was `pointerEvents="none"` with no controls at all, and
 * its reasoning was sound: built as a full-screen Pressable it swallowed every
 * touch on the board, so the next set cost dismiss-then-commit and GATE U2's
 * one tap became two. Its comment concluded "a zIndex cannot fix that".
 *
 * That conclusion was wrong, and the WEB APP has been proving it since v5:
 * `src/components/RestExpanded.tsx:126` renders the takeover at `z-[29]` and
 * `src/components/SetEntry.tsx:640` renders the commit bar at `z-[31]`. The
 * bar sits ABOVE the takeover, so a repeat set is one tap there while the
 * takeover still owns its own controls. Native now does the same: this canvas
 * is `zIndex: 29` and the session screen's CTA is `zIndex: 31`.
 *
 * So the ±30s pair and "skip rest" come back — the prototype draws all three —
 * without costing the tap. A tap on the BACKGROUND still goes early, which is
 * the behaviour a lifter already has in their thumb.
 *
 * ── AND FOR ONE DAY NONE OF THEM COULD FIRE ─────────────────────────────────
 * The paragraph above was true of this file and false of the app. The session
 * screen's root `View` carried
 * `onTouchStart={live.restEndsAt === null ? undefined : endRest}`, and this
 * canvas renders INSIDE it. `onTouchStart` fires on touch-DOWN; `onPress`
 * needs touch-up. So every press here ended the rest and unmounted the canvas
 * before its own handler could resolve: ±30s, "skip rest" and even the
 * background Pressable were all dead.
 *
 * It was invisible because the OUTCOME of a background tap was correct — the
 * rest ended, which is what a background tap is for — so the one control
 * anybody tested looked like it worked. The comment three lines below this one
 * described the exact bug ("which is what happens when the handler lives on an
 * ancestor") and was written about a wrapper one level closer than the one
 * that had it. Found by the audit workflow, 2026-08-21.
 *
 * ── THE RING FILLS, IT DOES NOT DRAIN ───────────────────────────────────────
 * `progress` runs 0 to 1 as the rest elapses, so the ring closes as the lifter
 * gets closer to lifting again. A draining ring says "time is running out",
 * which is the opposite of what rest is: the bar is not going anywhere.
 *
 * ── IT IS SILENT ────────────────────────────────────────────────────────────
 * Do-not-regress #5. No sound, ever, from a timer in a room where somebody is
 * under a bar. The end announces itself through the hand, once, via
 * `restEnded()`. That is the whole notification.
 */

/** The ±30s pair and "skip rest": Hanken 600, not the display face. The
 *  prototype sets every secondary action on this screen in the body voice,
 *  which is what keeps them from competing with a 54px clock. */
function QuietAction({
  label,
  filled,
  onPress,
}: {
  label: string
  /** The ±30s pills have a ground; "skip rest" does not. */
  filled?: boolean
  onPress: () => void
}) {
  const palette = usePalette()
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => {
        tick()
        onPress()
      }}
      style={{
        minHeight: 44,
        paddingHorizontal: filled === true ? 22 : 8,
        borderRadius: radius.pill,
        backgroundColor: filled === true ? palette.onInkRaised : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Txt step="action" ink={filled === true ? 'onInk' : 'onInkMuted'}>
        {label}
      </Txt>
    </Pressable>
  )
}

export function RestCanvas({
  endsAt,
  total,
  title,
  loggedLabel,
  coachLine,
  onSkip,
  onAdjust,
}: {
  endsAt: number
  total: number
  /** The routine's name, so the canvas does not lose where you are. */
  title: string
  /** "3:24 · set 2 logged ✓", already formatted. */
  loggedLabel: string
  /** The coach's sentence, or null when there is nothing true to say. */
  coachLine: string | null
  onSkip: () => void
  onAdjust: (deltaSeconds: number) => void
}) {
  const { palette, scheme } = useTheme()
  const insets = useSafeAreaInsets()
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
  const clock = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        start: 0,
        end: 0,
        // 29, and the session screen's CTA is 31. See the note above: this is
        // what lets the canvas own controls without costing the repeat tap.
        zIndex: 29,
        backgroundColor: palette.ink,
      }}
    >
      {/* The one surface in the app that INVERTS the root's glyphs, and it
          asks for them itself. This is a `palette.ink` overlay drawn over the
          whole window, and `ink` swaps with the ground: near-black over paper,
          near-white over iron. So it is always the opposite of whatever the
          root just set, and hardcoding `light` here would put white glyphs on
          a `#ece7dc` canvas in the dark theme, which is the same 1.05:1 defect
          the root's own hardcoded `light` caused on paper.

          Unmounting the canvas restores the root's choice on its own:
          `expo-status-bar` wraps React Native's `StatusBar` (see its own
          source, and its docstring: "the props of each StatusBar component
          will be merged in the order that they were mounted"), so the last one
          mounted wins and popping it falls back to the one below. Nothing here
          has to restore anything. */}
      <StatusBar style={scheme === 'dark' ? 'dark' : 'light'} />

      {/* The background dismisses. It is a sibling UNDER the content rather
          than a wrapper around it, so pressing ±30s does not also go early —
          which is what happens when the handler lives on an ancestor and RN
          bubbles the touch up to it. */}
      <Pressable
        accessibilityLabel="Go early"
        onPress={onSkip}
        style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 }}
      />

      {/* Its own inset. The canvas is absolutely positioned to the ROOT, so
          it does not inherit the session screen's `paddingTop` — its header
          drew over the status bar and the clock until 2026-08-21. An overlay
          that covers the whole window owns its own safe area. */}
      <View
        pointerEvents="box-none"
        style={{
          flex: 1,
          paddingHorizontal: space.gutter,
          paddingTop: insets.top,
        }}
      >
        <View
          pointerEvents="box-none"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingTop: 10,
          }}
        >
          <View style={{ flex: 1 }} pointerEvents="none">
            <Txt step="cta" ink="onInk" numberOfLines={1}>
              {title}
            </Txt>
            <Txt step="meta" ink="onInkFaint" ltr style={{ marginTop: 2 }}>
              {loggedLabel}
            </Txt>
          </View>
          <QuietAction label="skip rest" onPress={onSkip} />
        </View>

        <View
          pointerEvents="box-none"
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 30 }}
        >
          {/* 250 and 22.5 reproduce the prototype's arc exactly: it draws a
              240px SVG on a 96-unit viewBox with a 9-unit stroke at r41, which
              scales to a 22.5px band at a 102.5px radius. */}
          <Ring progress={progress} size={250} stroke={22.5} onInk>
            <View pointerEvents="none" style={{ alignItems: 'center' }}>
              <Txt step="mega" ink="onInk" ltr>
                {clock(remaining)}
              </Txt>
              <Txt
                step="meta"
                ink="onInkMuted"
                ltr
                style={{
                  marginTop: 4,
                  // The prototype's own 0.16em, wider than any step on the
                  // ramp. It is the only tracked label on the screen and it is
                  // what stops a 54px clock reading as the whole surface.
                  letterSpacing: 12 * 0.16,
                  textTransform: 'uppercase',
                }}
              >
                {`Rest · of ${clock(total)}`}
              </Txt>
            </View>
          </Ring>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <QuietAction filled label="− 30s" onPress={() => onAdjust(-30)} />
            <QuietAction filled label="+ 30s" onPress={() => onAdjust(30)} />
          </View>

          {coachLine !== null && (
            <View
              pointerEvents="none"
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 12,
                maxWidth: 320,
                backgroundColor: palette.onInkSurface,
                borderRadius: radius.cardSm,
                paddingVertical: 16,
                paddingHorizontal: 18,
              }}
            >
              <Plate size={24} variant="hub" color={palette.onInk} />
              <Txt step="body" ink="onInkBody" style={{ flex: 1 }}>
                {coachLine}
              </Txt>
            </View>
          )}
        </View>

        {/* The prototype closes with a translucent "next  Bench — set 3 ·
            62.5 × 5" strip that skips the rest. That strip is not drawn here
            because the session screen's ember CTA sits above this canvas at
            zIndex 31 and already carries the same sentence — as an action
            rather than a description. Two controls saying "the next set is
            62.5 × 5" is one too many, and the one that BANKS it wins. */}
        <View style={{ height: space.ctaLive + 40 }} pointerEvents="none" />
      </View>
    </View>
  )
}
