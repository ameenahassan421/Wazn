#!/usr/bin/env node
/**
 * No anonymous font sizes.
 *
 * v5 "Momentum" titles its type section "the entire ramp; no other sizes
 * exist". Read literally that is false of v5's own reference, which renders
 * 26 distinct sizes against a ramp that declares 10 — so this does not
 * enforce the sentence. It enforces the rule the reference actually obeys:
 * every size is NAMED. A step on the ramp, or one of the three idioms the
 * reference itself repeats (`row-title`, `btn-text`, `field-text`).
 *
 * Two kinds of violation, and the second is the reason this is a script
 * rather than a grep. The P0 plan's gate was
 * `grep -rE "text-\[[0-9]+px\]" src/` returning nothing — which it would
 * have done while 203 Tailwind DEFAULT size classes (`text-sm`, `text-xs`,
 * `text-base`…) still sat in the same files, each one an unnamed size.
 * A gate that only sees the syntax you happened to think of is not a gate.
 *
 *   text-[15px]    — an arbitrary size, the obvious case
 *   text-[14.5px]  — and its fractional cousin, which `[0-9]+` misses
 *   text-sm        — Tailwind's own scale: 14/12/16/18/20/24/30px
 *
 * Inline `style={{ fontSize }}` is NOT checked here. It is a different
 * smell with different legitimate uses (a computed size on a chart label),
 * and pretending otherwise would push people from a checkable class to an
 * uncheckable style object.
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

/*
 * `display`, `input`, `figure` and `micro` are the v2 steps PR 2 retired.
 * They are banned by NAME because of how Tailwind v4 fails here: a class
 * that references a deleted `@theme` token does not error, it emits no
 * declaration at all. `text-figure` on a live element after the token went
 * away is a figure with no font-size — inherited body copy where a number
 * should be — and nothing in lint, tsc, the tests or the build says a word.
 * The repo has been bitten by this exact shape before (`--color-accent-400`
 * built at runtime, two empty chart bars). A dead name is worth a rule.
 */
const BANNED = String.raw`\btext-(\[[0-9.]+(px|rem|em)\]|(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl|display|input|figure|micro)\b)`

/*
 * The other direction. Banning the retired names only helps for names we
 * thought to ban; this asserts the vocabulary still EXISTS, so deleting a
 * step from index.css fails here instead of turning its class into a no-op
 * everywhere it is used.
 */
const RAMP = [
  'mega',
  'hero',
  'fig',
  'num',
  'title',
  'body',
  'label',
  'meta',
  'kick',
  'nano',
]
const IDIOMS = ['row-title', 'btn-text', 'field-text']
const css = readFileSync('src/index.css', 'utf8')
const missing = [
  ...RAMP.filter((s) => !new RegExp(`^\\s*--text-${s}:`, 'm').test(css)).map(
    (s) => `--text-${s}`,
  ),
  ...IDIOMS.filter((u) => !new RegExp(`@utility\\s+${u}\\s*\\{`).test(css)).map(
    (u) => `@utility ${u}`,
  ),
]
if (missing.length) {
  console.error(`type ramp: src/index.css no longer defines ${missing.join(', ')}`)
  console.error('A class naming a deleted token emits no CSS and fails nothing else.')
  process.exit(1)
}

let files = []
try {
  files = execSync(`grep -rlE '${BANNED}' src/ --include=*.tsx --include=*.ts`, {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean)
} catch (error) {
  // grep exits 1 when it matches nothing, which is the state we want.
  if (error.status !== 1) throw error
}

const re = new RegExp(BANNED, 'g')
const hits = []
for (const file of files) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const m of line.matchAll(re)) {
        hits.push({ file, line: i + 1, token: m[0], code: line.trim().slice(0, 100) })
      }
    })
}

if (hits.length === 0) {
  console.log('type ramp: no off-ramp font sizes in src/')
  process.exit(0)
}

console.error(
  `type ramp: ${hits.length} off-ramp font size(s) in ${files.length} file(s)\n`,
)
for (const h of hits) {
  console.error(`  ${h.file}:${h.line}  ${h.token}`)
  console.error(`    ${h.code}`)
}
console.error(
  `\nThe ramp is: text-mega text-hero text-fig text-num text-title text-body` +
    `\n             text-label text-meta text-kick text-nano` +
    `\nPlus the reference's own three idioms: row-title, btn-text, field-text` +
    `\n\nIf a site genuinely needs a size none of those has, the vocabulary is` +
    `\nwrong — name the new one in src/index.css and say why in DECISIONS.md.` +
    `\nAn unnamed number in a className is the one thing that is not allowed.`,
)
process.exit(1)
