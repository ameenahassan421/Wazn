/* eslint-disable @typescript-eslint/no-require-imports */
const tokens = require('./tailwind.tokens')

/**
 * The v5 "Momentum" theme for NativeWind.
 *
 * Every value in here comes from `tailwind.tokens.js`, which is GENERATED
 * from `src/lib/tokens.ts` by `npm run check:tokens -- --write` and verified
 * against the web app's `index.css` on every CI run. Do not type a colour or
 * a font size into this file — if it is not in the token module it does not
 * exist, and CI will say so.
 *
 * `theme` rather than `theme.extend`, deliberately. Tailwind's default
 * palette is 250 colours this app is not allowed to use, and its default type
 * scale is the `text-xs … text-9xl` ramp that `check_type_ramp.mjs` bans on
 * the web side. Replacing the theme outright makes `text-lg` a build error on
 * native for the same reason it is one on web: there is one ramp.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    colors: {
      ...tokens.colors,
      transparent: 'transparent',
    },
    fontFamily: tokens.fontFamily,
    fontSize: tokens.fontSize,
    borderRadius: tokens.borderRadius,
    extend: {
      // The numeric spacing scale stays — a layout gap is not a brand
      // decision — and the named v5 measurements are added on top of it.
      // `extend`, not a replacement: defining `spacing` at the top level and
      // then reading `theme('spacing')` inside it is circular.
      spacing: tokens.spacing,
      borderWidth: {
        // The hairline. RN has no `0.5px` border, but it does honour
        // fractional widths and rounds to the device pixel grid.
        hairline: 1,
        ring: 2,
      },
    },
  },
  plugins: [],
}
