import { Text, type TextProps, type TextStyle } from 'react-native'

import { palette } from '@wazn/domain'

import { TYPE, type TypeStepName } from './type'

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

/** The colour roles text is allowed to take. Not the whole palette: a
 *  paragraph set in `brass` or on `chipBg` is a defect, and the type system
 *  is a cheaper place to say so than a review. */
export type InkRole =
  | 'text'
  | 'muted'
  | 'faint'
  | 'accent'
  | 'accentSoft'
  | 'accentInk'
  | 'brass'
  | 'brassSoft'
  | 'ink'

const INK: Record<InkRole, string> = {
  text: palette.text,
  muted: palette.muted,
  faint: palette.faint,
  /** Chrome and large text. It measures 4.99:1 on this ground, so it would
   *  in fact be safe small HERE — the restriction is cross-theme: the same
   *  component on the web app's paper ground is 3.51:1. Small accent text
   *  uses `accentSoft` (9.87:1). `tokens.test.ts` pins all three numbers. */
  accent: palette.accent,
  accentSoft: palette.accentSoft,
  accentInk: palette.accentInk,
  brass: palette.brass,
  brassSoft: palette.brassSoft,
  ink: palette.ink,
}

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

export function Txt({ step, ink = 'text', style, ltr, ...rest }: TxtProps) {
  return (
    <Text
      {...rest}
      style={[
        TYPE[step],
        { color: INK[ink] },
        ltr === true ? { writingDirection: 'ltr' } : null,
        style ?? null,
      ]}
    />
  )
}

/**
 * The mono section label — `TONIGHT · PUSH DAY`, `HOW LOADED?`.
 *
 * Its own component rather than `<Txt step="kick">` because it is used on
 * nearly every screen and because its default ink is `muted` rather than
 * `text`: a kicker that reads at full strength competes with the figure it is
 * labelling, which is the whole reason the step exists.
 */
export function Kick({ ink = 'muted', ...rest }: Omit<TxtProps, 'step'>) {
  return <Txt step="kick" ink={ink} {...rest} />
}
