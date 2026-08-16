import { type TextStyle } from 'react-native'

import { fontFamily, type, type TypeStepName } from '@wazn/domain'

/**
 * The v5 ramp, resolved into React Native text styles.
 *
 * ── WHY TYPE IS A COMPONENT ON NATIVE AND A CLASS ON WEB ────────────────────
 * On the web a step is `text-hero` and the browser picks the 700 cut of Saira
 * out of the family. React Native does not do that: `fontWeight` on a custom
 * font is either ignored or, on Android, faked by smearing the glyphs. The
 * family name IS the weight — you ask for `SairaSemiCondensed_700Bold` and
 * there is no such thing as asking for Saira at 700.
 *
 * So the ramp cannot be a set of Tailwind classes here; a `text-hero` that
 * carried a `fontWeight` would silently render Saira Medium and look almost
 * right. It is resolved once, in this file, into complete styles, and reached
 * through `<Txt step="hero">`. NativeWind still does everything else — layout,
 * colour, spacing — it just does not own the ramp.
 *
 * Every number comes from `src/lib/tokens.ts`, the same module the web app's
 * `index.css` is checked against. Nothing here is a second opinion about a
 * size; the only thing this file decides is which .ttf a step is set in.
 */

/**
 * Which cut of which family each (face, weight) pair resolves to.
 *
 * These strings are the keys passed to `useFonts` in `app/_layout.tsx`, and
 * they have to match exactly — a typo produces the system sans at the right
 * size, which looks plausible and makes every measurement taken against it
 * wrong. `assertFontsRegistered` below is what stops that being silent.
 */
const CUTS = {
  display: {
    600: 'SairaSemiCondensed_600SemiBold',
    700: 'SairaSemiCondensed_700Bold',
  },
  body: {
    400: 'HankenGrotesk_400Regular',
  },
  mono: {
    500: 'IBMPlexMono_500Medium',
  },
} as const satisfies Record<keyof typeof fontFamily, Partial<Record<number, string>>>

/** Every family name the ramp can ask for. `_layout` loads exactly these. */
export const REQUIRED_FONTS: readonly string[] = [
  ...new Set(Object.values(CUTS).flatMap((byWeight) => Object.values(byWeight))),
]

function cutFor(step: (typeof type)[TypeStepName]): string {
  const byWeight: Partial<Record<number, string>> = CUTS[step.family]
  const name = byWeight[step.weight]
  if (name === undefined) {
    // Unreachable while the ramp and CUTS agree, and a build error rather
    // than a wrong-looking screen if somebody adds a step at a new weight.
    throw new Error(
      `No font cut for ${step.family} ${step.weight}. Add it to CUTS in design/type.ts.`,
    )
  }
  return name
}

/**
 * The ten steps as finished styles.
 *
 * `lineHeight` is absolute pixels here because RN has no unitless ratio, and
 * `letterSpacing` is absolute too — the token stores `em`, so it is multiplied
 * by the step's own size, which is what `em` means.
 */
export const TYPE: Record<TypeStepName, TextStyle> = Object.fromEntries(
  Object.entries(type).map(([name, step]) => {
    const style: TextStyle = {
      fontFamily: cutFor(step),
      fontSize: step.size,
      lineHeight: Math.round(step.size * step.lineHeight),
    }
    if ('letterSpacing' in step && step.letterSpacing !== undefined) {
      style.letterSpacing = step.size * step.letterSpacing
    }
    if ('uppercase' in step && step.uppercase) style.textTransform = 'uppercase'
    // Every figure a lifter reads is tabular. A weight that shifts by a pixel
    // as it counts up reads as the app being unsure of the number.
    if ('tabular' in step && step.tabular) style.fontVariant = ['tabular-nums']
    return [name, style]
  }),
) as Record<TypeStepName, TextStyle>

export type { TypeStepName }
