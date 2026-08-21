/**
 * One palette, two rendering stacks, no drift.
 *
 * The web PWA reads its tokens from `src/index.css`'s `@theme` block, which
 * Tailwind v4 compiles. The Expo app reads them from `mobile/tailwind.tokens.js`,
 * which Tailwind 3.4 requires from `tailwind.config.js`. The two Tailwind
 * majors cannot share a config file, so the values would be maintained twice
 * — and the last time this project maintained one number in three places, one
 * copy kept its stale value for a week and nothing failed.
 *
 * `src/lib/tokens.ts` is the source. This script checks the other two against
 * it, and with `--write` regenerates the one that is generated.
 *
 *   npm run check:tokens          verify all three agree (CI)
 *   npm run check:tokens -- --write   regenerate mobile/tailwind.tokens.js
 *
 * It deliberately does NOT check every custom property in `index.css`. Plenty
 * of them — `--divider`, `--flip-bg`, the radius scale the v2 system left
 * behind — have no counterpart on native and inventing one would be busywork.
 * What it checks is the intersection: the palette, the ten type steps, and the
 * four v5 radii. Those are the values the handoff calls normative, and they
 * are the ones both stacks actually draw with.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  fontFamily,
  legacyPalette,
  legacyType,
  motion,
  palette,
  radius,
  space,
  type,
} from '../src/lib/tokens'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const CSS = resolve(root, 'src/index.css')
const APP_CONFIG = resolve(root, 'mobile/app.config.ts')
const GENERATED = resolve(root, 'mobile/tailwind.tokens.js')

const write = process.argv.includes('--write')
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
const groundLiteral = /^const PAPER = '(#[0-9a-f]{6})'$/m.exec(appConfig)
if (groundLiteral === null) {
  problems.push(
    "mobile/app.config.ts: could not find `const PAPER = '#rrggbb'`. It is the " +
      'splash and window background, and EAS reads that file without a bundler, ' +
      'so it cannot import tokens.ts. Keep the literal, and keep it findable.',
  )
} else if (groundLiteral[1] !== palette.paper) {
  problems.push(
    `mobile/app.config.ts: PAPER is ${groundLiteral[1]} — tokens.ts says ${palette.paper}`,
  )
}

expectCss('--radius-ctl', `${radius.ctl}px`, 'radius')
expectCss('--radius-pill', `${radius.pill}px`, 'radius')
expectCss('--tab-bar-height', `${space.tabBar}px`, 'space')

/* ── The generated side ───────────────────────────────────────────────────
   CommonJS, because `tailwind.config.js` is required by Tailwind 3.4 through
   `require`. Emitted rather than hand-written so there is no third copy of
   the palette for anyone to edit by hand and lose. */
function generate(): string {
  const colors = Object.fromEntries(
    Object.entries(palette).map(([k, v]) => [kebab(k), v]),
  )
  const fontSize = Object.fromEntries(
    Object.entries(type).map(([k, s]) => [
      k,
      [
        `${s.size}px`,
        {
          lineHeight: String(s.lineHeight),
          fontWeight: String(s.weight),
          ...('letterSpacing' in s && s.letterSpacing !== undefined
            ? { letterSpacing: `${s.letterSpacing}em` }
            : {}),
        },
      ],
    ]),
  )
  const borderRadius = Object.fromEntries(
    Object.entries(radius).map(([k, v]) => [k, `${v}px`]),
  )
  const spacing = Object.fromEntries(
    Object.entries(space).map(([k, v]) => [k, `${v}px`]),
  )

  const body = {
    colors,
    fontSize,
    borderRadius,
    spacing,
    fontFamily: {
      display: [fontFamily.display],
      body: [fontFamily.body],
      mono: [fontFamily.mono],
    },
    motion,
    /** Which face each step is set in. NativeWind resolves `fontFamily` and
        `fontSize` independently, so the pairing has to be stated somewhere. */
    typeFace: Object.fromEntries(Object.entries(type).map(([k, s]) => [k, s.family])),
    typeCase: Object.fromEntries(
      Object.entries(type).map(([k, s]) => [k, 'uppercase' in s && s.uppercase]),
    ),
    typeTabular: Object.fromEntries(
      Object.entries(type).map(([k, s]) => [k, 'tabular' in s && s.tabular]),
    ),
  }

  return `/* GENERATED by scripts/check_tokens.ts — do not edit.
 * Source of truth: src/lib/tokens.ts. Run \`npm run check:tokens -- --write\`.
 */
module.exports = ${JSON.stringify(body, null, 2)}\n`
}

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

const wanted = generate()
/** Null when the generated file does not exist yet — which is a stale state
 *  like any other, not an error. The first run writes it. */
let current: string | null
try {
  current = readFileSync(GENERATED, 'utf8')
} catch {
  current = null
}

if (write) {
  if (current !== wanted) {
    writeFileSync(GENERATED, wanted)
    console.log(`wrote ${GENERATED}`)
  } else {
    console.log('mobile/tailwind.tokens.js already current')
  }
} else if (current !== wanted) {
  problems.push(
    'mobile/tailwind.tokens.js is stale — run `npm run check:tokens -- --write`',
  )
}

if (problems.length) {
  console.error(`\ncheck:tokens — ${problems.length} problem(s)\n`)
  for (const p of problems) console.error(`  ✗ ${p}`)
  console.error('')
  process.exit(1)
}

console.log(
  `check:tokens ok — ${Object.keys(legacyPalette).length} legacy colours checked ` +
    `against index.css with ${Object.keys(legacyType).length} legacy type steps; ` +
    `${Object.keys(palette).length} current colours and ${Object.keys(type).length} ` +
    'current type steps written to mobile/tailwind.tokens.js',
)
