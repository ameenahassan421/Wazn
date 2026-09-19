import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8')

function rule(selector: string): string {
  const match = css.match(
    new RegExp(`${selector.replace('#', '\\#')}\\s*\\{([^}]*)\\}`),
  )
  if (match === null) throw new Error(`Missing ${selector} rule in index.css`)
  return match[1]
}

describe('browser app frame', () => {
  it('paints the browser canvas instead of exposing its default white ground', () => {
    expect(rule('html')).toContain('background: var(--color-raised)')
    expect(rule('body')).toContain('background: var(--color-raised)')
  })

  it('keeps every route on a phone-width themed ground', () => {
    const root = rule('#root')
    expect(root).toContain('min-height: 100dvh')
    expect(root).toContain('max-width: 430px')
    expect(root).toContain('margin-inline: auto')
    expect(root).toContain('background: var(--color-ink)')
  })
})
