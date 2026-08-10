import { describe, expect, it } from 'vitest'
// @ts-expect-error -- plain .mjs generator, no types
import { renderPages, withContent, hasArabic } from './build_seo_pages.mjs'
import { assignSlugs, slugify } from './seo_slugs'

const SITE = 'https://example.test'

function ex(over: Record<string, unknown> = {}) {
  return {
    id: 'id-1',
    slug: 'bench-press-barbell',
    name_en: 'Bench Press (Barbell)',
    name_ar: 'بنش بريس (بار)',
    muscle_group: 'chest',
    muscle_group_ar: 'الصدر',
    equipment: 'barbell',
    equipment_ar: 'بار',
    instructions: ['Lie on the bench.', 'Press the bar up.'],
    instructions_ar: ['استلقِ على المقعد.', 'ادفع البار لأعلى.'],
    ...over,
  }
}

describe('slugs', () => {
  it('is lowercase ASCII with parens stripped', () => {
    expect(slugify('Bench Press (Barbell)')).toBe('bench-press-barbell')
    expect(slugify('Seated Cable Row - V Grip (Cable)')).toBe(
      'seated-cable-row-v-grip-cable',
    )
  })

  it('resolves collisions deterministically', () => {
    const a = assignSlugs(['Row (Cable)', 'Row - Cable'])
    const b = assignSlugs(['Row - Cable', 'Row (Cable)'])
    expect([...a.values()].sort()).toEqual([...b.values()].sort())
    expect(new Set(a.values()).size).toBe(2)
  })
})

describe('thin-content guard', () => {
  it('drops exercises with no instructions', () => {
    const kept = withContent([ex(), ex({ slug: 'warm-up', instructions: [] })])
    expect(kept).toHaveLength(1)
    expect(kept[0].slug).toBe('bench-press-barbell')
  })

  it('generates no page for a skipped exercise', () => {
    const pages = renderPages([ex({ slug: 'warm-up', instructions: [] })], SITE)
    expect(pages.some((p: { path: string }) => p.path.includes('warm-up'))).toBe(false)
  })
})

describe('arabic gating', () => {
  it('emits no Arabic page when the steps are untranslated', () => {
    const pages = renderPages([ex({ instructions_ar: null })], SITE)
    expect(
      pages.some((p: { path: string }) => p.path.startsWith('/ar/exercises/')),
    ).toBe(false)
    // The English page still ships: it has real content.
    expect(
      pages.some(
        (p: { path: string }) => p.path === '/exercises/bench-press-barbell.html',
      ),
    ).toBe(true)
  })

  it('renders the Arabic steps when they exist', () => {
    const pages = renderPages([ex()], SITE)
    const ar = pages.find(
      (p: { path: string }) => p.path === '/ar/exercises/bench-press-barbell.html',
    )
    expect(ar.content).toContain('ادفع البار لأعلى.')
    expect(ar.content).not.toContain('Press the bar up.')
  })

  it('hasArabic is false for an empty array, not just null', () => {
    expect(hasArabic(ex({ instructions_ar: [] }))).toBe(false)
    expect(hasArabic(ex())).toBe(true)
  })
})

describe('page invariants', () => {
  const pages = renderPages([ex()], SITE)
  const en = pages.find(
    (p: { path: string }) => p.path === '/exercises/bench-press-barbell.html',
  )
  const ar = pages.find(
    (p: { path: string }) => p.path === '/ar/exercises/bench-press-barbell.html',
  )

  it('emits both locales plus both indexes', () => {
    expect(en).toBeTruthy()
    expect(ar).toBeTruthy()
    expect(pages.some((p: { path: string }) => p.path === '/exercises.html')).toBe(true)
    expect(pages.some((p: { path: string }) => p.path === '/ar/exercises.html')).toBe(
      true,
    )
  })

  it('carries rtl and lang on the Arabic page only', () => {
    expect(ar.content).toContain('<html lang="ar" dir="rtl">')
    expect(en.content).toContain('lang="en"')
    expect(en.content).not.toContain('dir="rtl"')
  })

  it('canonicalises to the extensionless url, never the .html file', () => {
    expect(ar.content).toContain(
      `<link rel="canonical" href="${SITE}/ar/exercises/bench-press-barbell">`,
    )
    expect(ar.content).not.toContain(
      'canonical" href="' + SITE + '/ar/exercises/bench-press-barbell.html',
    )
  })

  it('pairs both locales plus x-default in hreflang', () => {
    for (const page of [en, ar]) {
      expect(page.content).toContain(
        `hreflang="en" href="${SITE}/exercises/bench-press-barbell"`,
      )
      expect(page.content).toContain(
        `hreflang="ar" href="${SITE}/ar/exercises/bench-press-barbell"`,
      )
      expect(page.content).toContain('hreflang="x-default"')
    }
  })

  it('renders the instruction text that justifies the page existing', () => {
    expect(en.content).toContain('Press the bar up.')
  })
})
