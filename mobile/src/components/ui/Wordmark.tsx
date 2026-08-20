import { Text } from 'react-native'

import { palette } from '@wazn/domain'

/**
 * `w a zn`, the v5 interface mark.
 *
 * ── WHY THIS IS NOT A TYPE STEP ─────────────────────────────────────────────
 * It was, twice, and both were wrong in different directions. The header set
 * it with `step="num"`, which is the FIGURES step: display 21 at weight 600,
 * tabular. Auth set it with `step="hero"`, which carries `uppercase: true` at
 * size 50, so the brand rendered `WAZN` at hero scale on the first screen of
 * the app. Ameen caught that from a screenshot on 2026-08-19 while every check
 * was green.
 *
 * A wordmark is not a size in a ramp. It is a fixed relationship between two
 * letterforms and a colour, and it must not inherit `uppercase`, `tabular` or
 * a weight chosen for numbers. `docs/design/v5-momentum/design/ui.jsx:68` sets
 * it directly and so does this: Saira Semi Condensed 700, lowercase, the `a`
 * in ember. The sizes are the reference's own, 21 in the header and 34 on auth
 * (README screen 01).
 *
 * ── THE FAMILY NAME IS THE WEIGHT ───────────────────────────────────────────
 * `SairaSemiCondensed_700Bold` is asked for by name, not by `fontWeight: 700`.
 * React Native picks a cut by family name; a `fontWeight` on a custom font is
 * ignored on iOS and smeared on Android, and the failure mode is Saira Medium
 * looking almost right. Same reason `type.ts` resolves cuts rather than
 * passing weights through, and the same string `_layout.tsx` registers.
 *
 * ── LIVE TEXT, NOT THE SVG LOCKUP ───────────────────────────────────────────
 * The web draws a baked SVG (`src/components/Wordmark.tsx`, plate-as-counter
 * with an `evenodd` hole) because a font may not have loaded. That is the v3
 * "Loaded Ink" mark, which **v5 deliberately retired from the interface**; it
 * stays canonical on the share card, the PWA icon and the favicon. Here the
 * faces ship in the bundle and are verified registered before the first frame,
 * so live text is safe, selectable and one line.
 */
export function Wordmark({ size = 21 }: { size?: number }) {
  return (
    <Text
      accessibilityRole="header"
      accessibilityLabel="Wazn"
      // `ltr`: `w a zn` is a name, and an Arabic layout must not reverse it.
      style={{
        fontFamily: 'SairaSemiCondensed_700Bold',
        fontSize: size,
        lineHeight: size * 1.1,
        color: palette.text,
        writingDirection: 'ltr',
      }}
    >
      w<Text style={{ color: palette.accent }}>a</Text>
      zn
    </Text>
  )
}
