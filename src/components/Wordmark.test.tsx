// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LocaleProvider } from '../lib/locale-context'
import { Wordmark } from './Wordmark'
import { LATIN_BAR_D, LATIN_LETTERS_D, LATIN_PLATE_D } from './wordmark-latin-paths'
import { LETTERS_D } from './wordmark-paths'

/**
 * What this file is defending.
 *
 * The wordmark is one of the few things in the app that is wrong even when it
 * renders: the v3 redesign gives English a Latin lockup and keeps the وزن
 * barbell for Arabic, and nothing else in the suite can tell which one came
 * back. Two failures this catches:
 *
 *  - the marks swapping locales, which would put a Latin logo on an Arabic
 *    screen and read as a build served to the wrong audience;
 *  - the plate losing `evenodd`, which fills the hole and turns the `a` into
 *    a solid dot — still a wordmark, no longer the brand.
 *
 * The geometry itself is generated (scripts/build_logo.py) and verified by
 * eye against the brand sheet; asserting path data here would only restate
 * the generator's output back to itself.
 */

function renderMark(locale: 'en' | 'ar', props: { soul?: boolean } = {}) {
  // localStorage is what LocaleProvider reads for an anonymous session.
  window.localStorage.setItem('workout.locale', locale)
  const { container } = render(
    <LocaleProvider>
      <Wordmark {...props} />
    </LocaleProvider>,
  )
  return container
}

const paths = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('path')).map((p) => p.getAttribute('d'))

describe('Wordmark', () => {
  it('sets the Latin lockup in English', () => {
    const c = renderMark('en')
    expect(paths(c)).toEqual([LATIN_LETTERS_D, LATIN_PLATE_D, LATIN_BAR_D])
  })

  it('leads with the barbell in Arabic', () => {
    const c = renderMark('ar')
    expect(paths(c)).toContain(LETTERS_D)
    expect(paths(c)).not.toContain(LATIN_LETTERS_D)
  })

  it('keeps the barbell when a surface asks for the soul in English', () => {
    const c = renderMark('en', { soul: true })
    expect(paths(c)).toContain(LETTERS_D)
  })

  it('punches the plate hole through, rather than filling it', () => {
    const c = renderMark('en')
    const plate = Array.from(c.querySelectorAll('path')).find(
      (p) => p.getAttribute('d') === LATIN_PLATE_D,
    )
    expect(plate).toHaveAttribute('fill-rule', 'evenodd')
  })

  it('names itself in the script the reader is in', () => {
    renderMark('ar')
    expect(screen.getByRole('img')).toHaveAccessibleName('وزن')
  })

  it('scales the barbell up so one height reads the same in both locales', () => {
    const en = renderMark('en').querySelector('svg')!.getAttribute('height')
    const ar = renderMark('ar').querySelector('svg')!.getAttribute('height')
    expect(Number(ar)).toBeGreaterThan(Number(en))
  })
})
