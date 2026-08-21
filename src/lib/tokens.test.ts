import { describe, expect, it } from 'vitest'

import {
  fontFamily,
  legacyFontFamily,
  legacyPalette,
  legacyType,
  motion,
  palette,
  radius,
  space,
  type,
} from './tokens'

/**
 * The contrast facts, asserted instead of written down.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * The ember-500 rule — "chrome and large text only" — has been re-derived four
 * times in this project and written into a comment with a different number
 * each time. `index.css` claimed 4.7:1, then 5.06:1; DESIGN.md still says
 * 5.06:1; the real figure on v5's ground is 4.99:1. Every one of those was
 * typed by somebody who had just measured it correctly and then let it go
 * stale when the ground changed underneath.
 *
 * A number in a comment cannot fail. These can. If the ground or the accent
 * moves, the assertions below break and name what broke — which is the only
 * way a contrast rule survives a palette change.
 */

/* ── WCAG 2.1 relative luminance and contrast ─────────────────────────────
   The formula from the spec, not an approximation. `#rgb` shorthand is not
   accepted because the palette does not use it and a silent mis-parse would
   make every assertion below meaningless. */

function channel(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (m === null) throw new Error(`Not a six-digit hex colour: ${hex}`)
  const n = parseInt(m[1], 16)
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  )
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Rounded the way a report would print it, so a failure is readable. */
const ratio = (a: string, b: string) => Math.round(contrast(a, b) * 100) / 100

/**
 * ── THE PAPER GROUND, AND THREE FAILURES THAT ARE SHIPPING ON PURPOSE ──────
 * The current system came from Ameen's prototype and three of its pairings are
 * below WCAG AA for small text. They are asserted at their MEASURED value
 * rather than against a floor, because the point is not "this passes" — it is
 * "this is 3.39 and if somebody changes it, this test says so out loud".
 *
 * All three are recorded in WAZN_PLAN 7.0 with candidate replacements. They
 * are the designer's own values and were not quietly corrected here; changing
 * a designer's greys behind their back is not a fix.
 */
describe('contrast on the paper ground', () => {
  it('ink on paper is AAA — the thing almost everything is set in', () => {
    expect(ratio(palette.ink, palette.paper)).toBeGreaterThanOrEqual(7)
    expect(ratio(palette.ink, palette.card)).toBeGreaterThanOrEqual(7)
  })

  it('prose clears AA on both the ground and a card', () => {
    expect(ratio(palette.body, palette.paper)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(palette.body, palette.card)).toBeGreaterThanOrEqual(4.5)
  })

  it('the rest canvas inverts and still clears AA', () => {
    expect(ratio(palette.onInk, palette.ink)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(palette.onInkBody, palette.ink)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(palette.onInkMuted, palette.ink)).toBeGreaterThanOrEqual(4.5)
  })

  it('accentSoft is the compliant tier for small ember text', () => {
    expect(ratio(palette.accentSoft, palette.paper)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(palette.accentSoft, palette.card)).toBeGreaterThanOrEqual(4.5)
  })

  it('KNOWN: muted is 3.39 on paper, below AA for small text', () => {
    expect(ratio(palette.muted, palette.paper)).toBeCloseTo(3.39, 2)
    // `body` (7.95) is the replacement if Ameen wants it fixed.
    expect(ratio(palette.body, palette.paper)).toBeCloseTo(7.95, 2)
  })

  it('KNOWN: raw accent is 3.51 on paper — the 12 wk chip and the PR kicker', () => {
    expect(ratio(palette.accent, palette.paper)).toBeCloseTo(3.51, 2)
    expect(ratio(palette.accentSoft, palette.paper)).toBeCloseTo(6.77, 2)
  })

  it('KNOWN: cream on the ember CTA is 3.51 — the button label is 16px', () => {
    expect(ratio(palette.onInk, palette.accent)).toBeCloseTo(3.51, 2)
    // v5's answer, if Ameen wants the label darkened instead: 4.84.
    expect(ratio('#1c0e08', palette.accent)).toBeCloseTo(4.84, 2)
  })
})

describe('the current ramp', () => {
  it('is set in the three faces the prototype uses', () => {
    expect(fontFamily.display).toBe('Sora')
    expect(fontFamily.body).toBe('Hanken Grotesk')
    expect(fontFamily.mono).toBe('IBM Plex Mono')
  })

  it('every step names a face that exists', () => {
    for (const [name, step] of Object.entries(type)) {
      expect(Object.keys(fontFamily), `type.${name}`).toContain(step.family)
    }
  })

  it('every figure a lifter reads is tabular', () => {
    for (const name of ['mega', 'fig', 'num', 'data', 'dataLg', 'meta'] as const) {
      expect(type[name], name).toHaveProperty('tabular', true)
    }
  })

  it('the CTA step is sentence case — this system does not shout', () => {
    expect(type.cta).not.toHaveProperty('uppercase')
    expect(type.title).not.toHaveProperty('uppercase')
    // The two that ARE uppercase, and the only two.
    expect(type.kick).toHaveProperty('uppercase', true)
    expect(type.nano).toHaveProperty('uppercase', true)
  })
})

describe('contrast on the iron ground', () => {
  it('body text clears AA on both the ground and a card', () => {
    expect(ratio(legacyPalette.text, legacyPalette.ink)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(legacyPalette.text, legacyPalette.surface)).toBeGreaterThanOrEqual(4.5)
  })

  it('muted clears AA — it carries real prose, not decoration', () => {
    expect(ratio(legacyPalette.muted, legacyPalette.ink)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(legacyPalette.muted, legacyPalette.surface)).toBeGreaterThanOrEqual(
      4.5,
    )
  })

  it('faint is BELOW the 3:1 bar — a known, deliberate exception', () => {
    /**
     * 2.88:1 on the ground and 2.70:1 on a card. That is under WCAG's 3:1
     * large-text floor, and it is the handoff's own `#615b4d` for "meta and
     * disabled" — inactive tab labels, footnotes, disclaimers, ghost figures.
     *
     * It is pinned rather than fixed because fixing it is Ameen's call, not a
     * test's: v5 deliberately widens the active/inactive gap so the current
     * tab reads from the corner of the eye, and lifting `faint` to 3:1 closes
     * that gap toward `muted`. WCAG exempts disabled controls; an inactive
     * tab label is arguably not one.
     *
     * What this assertion buys is that the number cannot drift unnoticed and
     * cannot be described as passing. It is a recorded exception with a
     * measurement attached.
     */
    expect(ratio(legacyPalette.faint, legacyPalette.ink)).toBeCloseTo(2.88, 1)
    expect(ratio(legacyPalette.faint, legacyPalette.surface)).toBeCloseTo(2.7, 1)
    // Still clearly above the ground it sits on — this is dim, not invisible.
    expect(ratio(legacyPalette.faint, legacyPalette.ink)).toBeGreaterThan(2)
  })

  it('THE EMBER RULE is a CROSS-THEME rule, not an iron one', () => {
    /**
     * This has been written down wrong more than once, including by the test
     * that first stood here. On the iron ground ember-500 clears AA outright:
     *
     *   iron ground   4.99:1     iron card   4.68:1
     *   chalk ground  3.51:1     chalk card  3.89:1
     *
     * So "chrome and large text only" is not a statement about this ground —
     * it is what makes one component safe on BOTH. A 13px label in `accent`
     * is fine on iron and a defect on paper, and since the components are
     * shared, the stricter ground sets the rule.
     */
    expect(ratio(legacyPalette.accent, legacyPalette.ink)).toBeCloseTo(4.99, 1)
    expect(ratio(legacyPalette.accent, legacyPalette.surface)).toBeCloseTo(4.68, 1)

    // The paper ground, which is why the rule exists. Not in `palette` — that
    // object is the iron theme — so the value comes from `index.css`'s
    // `[data-theme='paper']` block and is stated here as the reason.
    const CHALK = '#f7f3ec'
    expect(ratio(legacyPalette.accent, CHALK)).toBeLessThan(4.5)
    expect(ratio(legacyPalette.accent, CHALK)).toBeGreaterThanOrEqual(3)
  })

  it('accentSoft is the small-accent tier and clears AA everywhere', () => {
    // Every kicker, chip and label the accent touches uses this, not 500.
    expect(ratio(legacyPalette.accentSoft, legacyPalette.ink)).toBeGreaterThanOrEqual(
      4.5,
    )
    expect(
      ratio(legacyPalette.accentSoft, legacyPalette.surface),
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      ratio(legacyPalette.accentSoft, legacyPalette.raised),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('text on an ember fill clears AA — the hero button', () => {
    expect(ratio(legacyPalette.accentInk, legacyPalette.accent)).toBeGreaterThanOrEqual(
      4.5,
    )
  })

  it('brassSoft clears AA on the ground and on a card', () => {
    // Rank names and duel figures are read, not glanced at.
    expect(ratio(legacyPalette.brassSoft, legacyPalette.ink)).toBeGreaterThanOrEqual(
      4.5,
    )
    expect(
      ratio(legacyPalette.brassSoft, legacyPalette.surface),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('the tab bar recedes: it is darker than the ground, not lighter', () => {
    // The one surface in the app below `ink`. A raised tab bar would lift the
    // chrome off the content, which is the opposite of what v5 draws.
    expect(luminance(legacyPalette.tabbar)).toBeLessThan(luminance(legacyPalette.ink))
    expect(luminance(legacyPalette.surface)).toBeGreaterThan(
      luminance(legacyPalette.ink),
    )
    expect(luminance(legacyPalette.raised)).toBeGreaterThan(
      luminance(legacyPalette.surface),
    )
  })
})

describe('the type ramp', () => {
  it('is ten steps and no more', () => {
    expect(Object.keys(legacyType)).toHaveLength(10)
  })

  it('gives every step its own size — no two steps collide', () => {
    // Distinctness, NOT descent. The ramp is declared in the handoff's order,
    // which groups by voice rather than by size: `kick` (10) is listed before
    // `meta` (11) because both are the mono voice and the section label comes
    // before the data chip. Asserting a descending sequence looked right and
    // was simply false about the design.
    const sizes = Object.values(legacyType).map((s) => s.size)
    expect(new Set(sizes).size).toBe(sizes.length)
  })

  it('descends strictly through the five display steps', () => {
    // The part that IS a sequence: mega → hero → fig → num → title is the
    // figure ladder, and a step out of order there would break the hierarchy
    // every screen is built on.
    const display = [
      legacyType.mega,
      legacyType.hero,
      legacyType.fig,
      legacyType.num,
      legacyType.title,
    ].map((s) => s.size)
    for (let i = 1; i < display.length; i++) {
      expect(display[i]).toBeLessThan(display[i - 1])
    }
  })

  it('sets every figure in tabular numerals', () => {
    // A weight that shifts by a pixel as it counts up reads as the app being
    // unsure of the number.
    for (const name of ['mega', 'hero', 'fig', 'num', 'meta'] as const) {
      expect(legacyType[name], `${name} must be tabular`).toHaveProperty(
        'tabular',
        true,
      )
    }
  })

  it('sets the display steps in the condensed face', () => {
    // Load-bearing: mega is 84px and only fits a phone because Saira is
    // narrow. A fallback to a normal-width sans makes every measurement taken
    // against the ramp wrong while looking entirely plausible.
    for (const name of ['mega', 'hero', 'fig', 'num', 'title'] as const) {
      expect(legacyType[name].family).toBe('display')
    }
    expect(legacyFontFamily.display).toContain('Condensed')
  })

  it('keeps kick and nano distinct in both size and tracking', () => {
    // The two are not interchangeable, which is the whole reason both exist.
    expect(legacyType.kick.size).not.toBe(legacyType.nano.size)
    expect(legacyType.kick.letterSpacing).not.toBe(legacyType.nano.letterSpacing)
  })
})

describe('shape, space and motion', () => {
  it('keeps every touch target at or above the 48px floor', () => {
    expect(space.touch).toBe(48)
    expect(space.tabBar).toBeGreaterThanOrEqual(48)
    expect(space.commitBar).toBeGreaterThanOrEqual(48)
    expect(space.stepperZone).toBeGreaterThanOrEqual(48)
    expect(space.otpCell).toBeGreaterThanOrEqual(48)
  })

  it('keeps the logging path under 200ms', () => {
    // A plan gate, not a preference. `celebration` is the one duration past
    // it, and the PR screen it belongs to is reachable only after a commit.
    for (const key of ['press', 'instant', 'transition'] as const) {
      expect(motion[key], `${key} is on the logging path`).toBeLessThanOrEqual(200)
    }
    expect(motion.celebration).toBeGreaterThan(200)
  })

  it('orders the radii card > control > chip', () => {
    expect(radius.card).toBeGreaterThan(radius.ctl)
    expect(radius.ctl).toBeGreaterThan(radius.chip)
    expect(radius.pill).toBeGreaterThan(radius.card)
  })
})

describe('the contrast maths itself', () => {
  // A checker nobody has tested is a checker.
  it('agrees with the spec on the extremes', () => {
    expect(ratio('#ffffff', '#000000')).toBe(21)
    expect(ratio('#ffffff', '#ffffff')).toBe(1)
  })

  it('refuses a colour it cannot parse rather than guessing', () => {
    expect(() => luminance('#fff')).toThrow(/six-digit/)
    expect(() => luminance('rgba(0,0,0,0.5)')).toThrow(/six-digit/)
  })
})
