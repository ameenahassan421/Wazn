import { View } from 'react-native'

import { palette } from '@wazn/domain'

export const TABS = [
  'index',
  'history',
  'progress',
  'body',
  'coach',
  'friends',
] as const
export type TabKey = (typeof TABS)[number]

/**
 * The catalogue key for each tab's name, not the name itself. `nav.*` already
 * carries both locales in `src/lib/i18n.ts`, and the `kick`/`nano` steps
 * uppercase what they render, so `'Log'` arrives on screen as `LOG` without a
 * second copy of the word living here.
 *
 * `index` is the route directory; `nav.log` is what it is called. That is the
 * one place the two names differ, and it is why this is a table rather than a
 * template string.
 */
export const TAB_KEY: Record<TabKey, string> = {
  index: 'nav.log',
  history: 'nav.history',
  progress: 'nav.progress',
  body: 'nav.body',
  coach: 'nav.coach',
  friends: 'nav.friends',
}

/**
 * The six marks, ported from the web app's `TabBar.tsx` shape for shape.
 *
 * They are not icons in the usual sense and there is no icon set here on
 * purpose: they are 24-grid marks built from the same parts as the wordmark —
 * a plate ring, a bar, a disc. Drawn with borders on plain `View`s rather than
 * as SVG so each inherits its colour from one variable with no fill/stroke
 * plumbing, exactly as the web version does.
 *
 * v5 colours the whole active tab `accentSoft` and everything else `faint` —
 * a wider gap than the old accent/muted pairing, so the current place reads
 * from the corner of the eye rather than being found by reading. Ember 500 is
 * spent on the rail alone, which is the one piece of chrome up here.
 */
export function TabGlyph({ tab, on }: { tab: TabKey; on: boolean }) {
  const ink = on ? palette.accentSoft : palette.faint

  switch (tab) {
    // A loaded plate, seen face on — the mark's own part.
    case 'index':
      return (
        <View
          style={{
            height: 14,
            width: 14,
            borderRadius: 7,
            borderWidth: 3,
            borderColor: ink,
          }}
        />
      )
    // The same plate with a hub: a record of one that has been racked.
    case 'history':
      return (
        <View
          style={{
            height: 14,
            width: 14,
            borderRadius: 7,
            borderWidth: 2,
            borderColor: ink,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{ height: 4, width: 4, borderRadius: 2, backgroundColor: ink }}
          />
        </View>
      )
    // Three plates stepping up — the same ascending shape the streak uses.
    case 'progress':
      return (
        <View
          style={{ height: 14, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}
        >
          <View style={{ height: 6, width: 3, backgroundColor: ink }} />
          <View style={{ height: 10, width: 3, backgroundColor: ink }} />
          <View style={{ height: 14, width: 3, backgroundColor: ink }} />
        </View>
      )
    // A silhouette at scale: head over shoulders. Non-directional, so it does
    // not need to flip with the layout.
    case 'body':
      return (
        <View style={{ alignItems: 'center', gap: 1 }}>
          <View
            style={{
              height: 6,
              width: 6,
              borderRadius: 3,
              borderWidth: 2,
              borderColor: ink,
            }}
          />
          <View
            style={{
              height: 5,
              width: 12,
              borderRadius: 3,
              borderWidth: 2,
              borderColor: ink,
            }}
          />
        </View>
      )
    // A plate on edge: the coach reads the bar side on.
    case 'coach':
      return (
        <View
          style={{
            height: 11,
            width: 11,
            borderWidth: 2,
            borderColor: ink,
            transform: [{ rotate: '45deg' }],
          }}
        />
      )
    // Two discs, overlapping. `marginStart` so the overlap flips with the
    // layout rather than pointing the wrong way in Arabic.
    case 'friends':
      return (
        <View style={{ flexDirection: 'row' }}>
          <View
            style={{
              height: 12,
              width: 12,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: ink,
            }}
          />
          <View
            style={{
              height: 12,
              width: 12,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: ink,
              marginStart: -4,
              // The BAR's ground, not `surface`: the overlap is a cut-out in
              // the disc behind it, so it has to match whatever it sits on.
              backgroundColor: palette.tabbar,
            }}
          />
        </View>
      )
  }
}
