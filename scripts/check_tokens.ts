/**
 * `src/lib/tokens.ts` is the source. This checks the copies that cannot import
 * it.
 *
 * There are two, and both exist for a mechanical reason rather than a stylistic
 * one:
 *
 *   `src/index.css`         a stylesheet. It cannot import TypeScript, and it
 *                           is what the dying Vite PWA actually draws with, so
 *                           it is checked against the LEGACY tokens.
 *   `mobile/app.config.ts`  EAS reads it without a bundler, so the ground
 *                           colour has to be a literal.
 *
 * **The native app is not on this list, and that is new.** Until 2026-08-20
 * there was a third copy — `mobile/tailwind.tokens.js`, generated here for
 * NativeWind's `tailwind.config.js`. NativeWind is gone, so native imports
 * this module directly through `@wazn/domain` and there is nothing to drift.
 * A check that no longer has a copy to check is a check that was doing its job.
 *
 * It deliberately does NOT check every custom property in `index.css`. Plenty
 * of them — `--divider`, `--flip-bg`, the radius scale the v2 system left
 * behind — have no counterpart and inventing one would be busywork. What it
 * checks is the intersection: the palette, the ten legacy type steps, and the
 * radii both stacks actually draw with.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  legacyPalette,
  legacyType,
  palette,
  palettes,
  radius,
  space,
  type,
} from '../src/lib/tokens'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const CSS = resolve(root, 'src/index.css')
const APP_CONFIG = resolve(root, 'mobile/app.config.ts')

const problems: string[] = []

/* ── The CSS side ─────────────────────────────────────────────────────────
   A regex, not a CSS parser: the `@theme` block is a flat list of custom
   properties and pulling a dependency in to read fifteen of them would cost
   more than it explains. If the block ever grows nesting this stops being
   true, and the "token missing from index.css" failure below is what says so. */
const css = readFileSync(CSS, 'utf8')
const declared = new Map<string, string>()
for (const [, name, value] of css.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gim)) {
  // First declaration wins. `index.css` re-declares nothing inside `@theme`,
  // but the `:root` block below it names some of the same things for the
  // utilities, and the `@theme` copy is the one Tailwind generates from.
  if (!declared.has(name)) declared.set(name, value.trim().replace(/\s+/g, ' '))
}

/** Compare, normalising the whitespace CSS allows and TypeScript does not. */
function expectCss(prop: string, expected: string | number, label: string) {
  const actual = declared.get(prop)
  if (actual === undefined) {
    problems.push(`${label}: ${prop} is missing from src/index.css`)
    return
  }
  const want = String(expected).trim().replace(/\s+/g, ' ')
  if (actual.toLowerCase() !== want.toLowerCase()) {
    problems.push(`${label}: index.css has ${prop}: ${actual} — tokens.ts says ${want}`)
  }
}

/* ── The web side is checked against the LEGACY tokens, on purpose ─────────
   `src/index.css` is the dying Vite PWA's stylesheet and it still renders v5
   "Momentum". The current system (paper, Sora) replaced v5 for the NATIVE app
   on 2026-08-20; repainting an app that Stage 4A deletes is rented work. So
   this half checks `legacyPalette`/`legacyType` — the web cannot drift while
   it lives — and the generated half below emits the CURRENT tokens, which is
   what `mobile/` reads. When `src/index.css` goes at phase A4, this half and
   the legacy exports go with it.

   `accentInk`, `chipBg`, `brassBg` and the ramp's tints are named differently
   on the two sides; this is the map, and it is exhaustive on purpose so
   adding a colour to one side without the other fails here. */
const COLOR_TO_CSS: Record<keyof typeof legacyPalette, string> = {
  ink: '--color-ink',
  surface: '--color-surface',
  raised: '--color-raised',
  line: '--color-line',
  line2: '--color-line-2',
  text: '--color-text',
  muted: '--color-muted',
  faint: '--color-faint',
  accent: '--color-accent',
  accentInk: '--color-accent-ink',
  accentSoft: '--color-accent-300',
  chipBg: '--chip-tint',
  brass: '--color-brass',
  brassSoft: '--color-brass-soft',
  brassBg: '--brass-tint',
  tabbar: '--color-tabbar',
}

for (const [key, prop] of Object.entries(COLOR_TO_CSS)) {
  expectCss(prop, legacyPalette[key as keyof typeof legacyPalette], 'colour')
}

/* The ten steps. Size, weight and leading each travel with the step, so all
   three are checked — a step that kept its size and lost its weight is the
   exact failure the ramp exists to prevent. */
for (const [name, step] of Object.entries(legacyType)) {
  expectCss(`--text-${name}`, `${step.size}px`, `type.${name}`)
  expectCss(`--text-${name}--font-weight`, step.weight, `type.${name}`)
  expectCss(`--text-${name}--line-height`, step.lineHeight, `type.${name}`)
  if ('letterSpacing' in step && step.letterSpacing !== undefined) {
    expectCss(
      `--text-${name}--letter-spacing`,
      `${step.letterSpacing}em`,
      `type.${name}`,
    )
  }
}

/* ── The third copy, which nothing was checking ────────────────────────────
   `mobile/app.config.ts` needs the ground as a literal: EAS reads that file
   without a bundler, so it cannot import this module. tokens.ts has carried a
   comment since it was written saying "check:tokens knows it; the value is
   asserted there rather than trusted here". That was false — nothing here had
   ever opened app.config.ts. Found on 2026-08-20 while changing the ground
   from iron to paper, which is exactly when a stale third copy bites. */
const appConfig = readFileSync(APP_CONFIG, 'utf8')

/* TWO grounds since 2026-08-23. The dark splash is the same class of copy as
   the light one and would rot the same way, so it is checked the same way
   rather than trusted because it is new. */
for (const [name, expected] of [
  ['PAPER', palette.paper],
  ['IRON', palettes.dark.paper],
] as const) {
  const literal = new RegExp(`^const ${name} = '(#[0-9a-f]{6})'$`, 'm').exec(appConfig)
  if (literal === null) {
    problems.push(
      `mobile/app.config.ts: could not find \`const ${name} = '#rrggbb'\`. It is a ` +
        'splash and window background, and EAS reads that file without a bundler, ' +
        'so it cannot import tokens.ts. Keep the literal, and keep it findable.',
    )
  } else if (literal[1] !== expected) {
    problems.push(
      `mobile/app.config.ts: ${name} is ${literal[1]}, tokens.ts says ${expected}`,
    )
  }
}

/* `userInterfaceStyle: 'light'` in that file is not a preference, it is
   `UIUserInterfaceStyle` in Info.plist, and the OS then reports light to the
   app whatever the phone is set to. `useColorScheme()` returns 'light'
   forever and the theme setting's DEFAULT, System, silently follows nothing.
   It shipped that way and no check could see it, because it is a string in a
   config file that tsc, eslint and `expo export` are all happy with. */
if (!/^\s*userInterfaceStyle: 'automatic',$/m.test(appConfig)) {
  problems.push(
    "mobile/app.config.ts: userInterfaceStyle must be 'automatic'. Anything else " +
      "pins Info.plist's UIUserInterfaceStyle, so useColorScheme() stops " +
      'reporting the phone and the System theme option follows nothing.',
  )
}

expectCss('--radius-ctl', `${radius.ctl}px`, 'radius')
expectCss('--radius-pill', `${radius.pill}px`, 'radius')
expectCss('--tab-bar-height', `${space.tabBar}px`, 'space')

/* ── The generated side is GONE, and that is the point ─────────────────────
   Until 2026-08-20 this script also emitted `mobile/tailwind.tokens.js`, a
   CommonJS copy of the palette and ramp for `mobile/tailwind.config.js` to
   feed NativeWind. NativeWind is gone (the app used `className` zero times;
   see `mobile/babel.config.js`), so the config is gone, so the copy is gone.

   Nothing was lost. That generation existed to keep a THIRD copy of the tokens
   honest; native now imports `src/lib/tokens.ts` directly through
   `@wazn/domain`, so there is no copy to drift. The two checks above are the
   ones that were ever load-bearing: `src/index.css`, which cannot import
   TypeScript, and `mobile/app.config.ts`, which EAS reads without a bundler. */

if (problems.length) {
  console.error(`\ncheck:tokens — ${problems.length} problem(s)\n`)
  for (const p of problems) console.error(`  ✗ ${p}`)
  console.error('')
  process.exit(1)
}

console.log(
  `check:tokens ok — ${Object.keys(legacyPalette).length} legacy colours checked ` +
    `against index.css with ${Object.keys(legacyType).length} legacy type steps, ` +
    `and mobile/app.config.ts against both grounds plus its userInterfaceStyle. ` +
    `The current system ` +
    `(${Object.keys(palette).length} colours, ${Object.keys(type).length} type steps) ` +
    'is read straight from tokens.ts by native — no generated copy.',
)
