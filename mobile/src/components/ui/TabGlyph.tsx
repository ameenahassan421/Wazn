import { View } from 'react-native'

import { palette } from '@wazn/domain'

/**
 * The four tabs.
 *
 * Was six until 2026-08-21, and the bar was inverted relative to use: Body held
 * a sixth of it for TWO rows in production and was the only screen with no card
 * door, while routines carried 386 rows and had no tab at all
 * (`docs/FRIENDS_PLAN.md` Part 3B). Plan arrives; Body, Coach and Friends come
 * off the bar and keep doors — Coach behind the brief card on Train, which is
 * the pattern CLAUDE.md already documents, and the other two in Settings.
 *
 * A seventh entry is not a small change: at seven the labels collide and
 * "PROGRESS" wraps onto two lines. Seen on a simulator at 402pt, which is why
 * this list is a bounded set rather than a place to append to.
 */
export const TABS = ['index', 'plan', 'progress'] as const
export type TabKey = (typeof TABS)[number]

/**
 * The catalogue key for each tab's name, not the name itself. `nav.*` already
 * carries both locales in `src/lib/i18n.ts`, and the `kick`/`nano` steps
 * uppercase what they render, so `'Log'` arrives on screen as `LOG` without a
 * second copy of the word living here.
 *
 * `index` is the route directory; `nav.train` is what it is called. That is the
 * one place the two names differ, and it is why this is a table rather than a
 * template string.
 *
 * **`nav.train`, not `nav.log`, and the web app keeps saying Log.**
 * `FRIENDS_PLAN` Part 3B renames this tab to Train, because "Log" names the
 * verb the screen performs and "Train" names the thing the lifter came to do.
 * The rename is native-only on purpose: `nav.log` is still wired to the dying
 * PWA's `TabBar.tsx`, and `scripts/perf.mjs` CLICKS the string 'Log' to walk
 * that app. Renaming both would mean editing a perf harness for a surface being
 * retired at the end of 4A, which is the definition of rented work.
 */
export const TAB_KEY: Record<TabKey, string> = {
  index: 'nav.train',
  plan: 'nav.plan',
  progress: 'nav.progress',
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
/*
 * The `history`, `body`, `coach` and `friends` marks were here until
 * 2026-08-21 and went
 * with their tabs. They are in `git log` if a screen earns the bar back —
 * `friends` is the likely one, as Crew at S1 — and keeping three unreachable
 * drawings against that day is how a file grows a museum. The union above
 * makes their absence a type error rather than a silent gap, which is how
 * these three were found.
 */
export function TabGlyph({ tab, on }: { tab: TabKey; on: boolean }) {
  const ink = on ? palette.accentSoft : palette.muted

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
    /*
     * Three plates in a row with the first one loaded: the rotation, and which
     * of them is up.
     *
     * It was a barbell seen side on — two tall blocks joined by a shaft — and
     * on a simulator that is an `H`. At 14px a side-on barbell and a capital H
     * are the same drawing, which is a thing you cannot see in the source.
     * This is from the plate family like every other mark here, it says what
     * the screen is FOR rather than what a gym contains, and nothing else in
     * the bar is a row of discs.
     */
    case 'plan':
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <View
            style={{ height: 8, width: 8, borderRadius: 4, backgroundColor: ink }}
          />
          <View
            style={{
              height: 8,
              width: 8,
              borderRadius: 4,
              borderWidth: 2,
              borderColor: ink,
            }}
          />
          <View
            style={{
              height: 8,
              width: 8,
              borderRadius: 4,
              borderWidth: 2,
              borderColor: ink,
            }}
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
  }
}
