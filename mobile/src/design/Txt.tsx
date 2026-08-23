import { Text, type TextProps, type TextStyle } from 'react-native'

import { TYPE, type TypeStepName } from './type'
import { usePalette } from '@/hooks/use-theme'

/**
 * Every piece of text in the native app.
 *
 * There is no bare `<Text>` anywhere else on purpose: RN's default is the
 * system sans at 14px in black, which on this ground is invisible rather than
 * wrong, and "invisible" is the one kind of defect a screenshot pass misses.
 * A lint rule enforces it (`mobile/eslint.config.js`).
 *
 * `step` is required. There is no default, because a default would be the
 * size that gets used by accident.
 */

/**
 * The colour roles text is allowed to take. Not the whole palette: `ring` is
 * an edge and `accentWash` is a fill, and a paragraph set in either is a
 * defect the type system can refuse more cheaply than a review can.
 *
 * The roles come in two families, and the split is the system's one real
 * complication. Most of the app is dark text on paper (`ink`, `body`,
 * `muted`). The rest canvas inverts the whole screen to `ink` as a GROUND,
 * and everything on it needs the `onInk*` family instead. A screen picks a
 * family; mixing them is how you get near-black on near-black, which is
 * exactly the failure that made every button in this app invisible on
 * 2026-08-20 and shipped past four green checks.
 *
 * ── THE ROLE NAME IS THE PALETTE KEY ────────────────────────────────────────
 * A `Record<InkRole, string>` sat below this union mapping each role to its
 * colour, and every one of its nine entries was `role: palette.role`. An
 * identity map earns nothing and costs a second place to forget a role, so
 * the lookup is now `p[ink]` and this union is what keeps it safe: `Palette`
 * is a union of BOTH grounds, so only a key that exists on both can be read
 * from it, and a role naming a key either ground lacks is a type error.
 *
 * The contrast notes that lived on that map's entries, kept because they are
 * the reason two of these roles exist at all:
 *   `muted`      3.39:1 on paper, below AA for small text, and the
 *                prototype's own value. `tokens.test.ts` pins it, see
 *                WAZN_PLAN 7.0. On iron it is 6.28:1, so the dark ground is
 *                the more readable of the two.
 *   `accent`     3.51:1 on paper: chrome and large text only.
 *   `accentSoft` 6.77:1, what small ember text should take, though the
 *                prototype itself does not.
 */
export type InkRole =
  | 'ink'
  | 'body'
  | 'muted'
  | 'accent'
  | 'accentSoft'
  | 'onInk'
  | 'onInkBody'
  | 'onInkMuted'
  | 'onInkFaint'

export type TxtProps = Omit<TextProps, 'style'> & {
  step: TypeStepName
  ink?: InkRole
  /** Escape hatch for layout only — margins, alignment, flex. Not type. */
  style?: TextStyle | TextStyle[]
  /**
   * Force left-to-right. Every figure and every unit string: an Arabic locale
   * must not reorder `125 × 8` into `8 × 125`, and the RTL pass is planned.
   */
  ltr?: boolean
}

export function Txt({ step, ink = 'ink', style, ltr, ...rest }: TxtProps) {
  const palette = usePalette()
  return (
    <Text
      {...rest}
      style={[
        TYPE[step],
        { color: palette[ink] },
        ltr === true ? { writingDirection: 'ltr' } : null,
        style ?? null,
      ]}
    />
  )
}

/**
 * The section label — `COACH`, `UP NEXT`, `NEW PR`.
 *
 * Its own component rather than `<Txt step="kick">` because it is used on
 * nearly every screen and because its default ink is `muted` rather than
 * `ink`: a kicker that reads at full strength competes with the thing it is
 * labelling, which is the whole reason the step exists.
 *
 * Note this system sets the kicker in the DISPLAY face, not mono — Sora 700 at
 * 12 with `+0.08em`. v5's was IBM Plex Mono at 10. It is the single change
 * that most alters the app's voice, and it is deliberate: mono said "machine
 * readout", Sora says "label on a plate".
 */
export function Kick({ ink = 'muted', ...rest }: Omit<TxtProps, 'step'>) {
  return <Txt step="kick" ink={ink} {...rest} />
}
