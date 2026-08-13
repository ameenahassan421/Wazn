// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { PlateCard } from './PlateCard'

/**
 * What this file is defending.
 *
 * The card is the one surface in the commit cluster that states a number the
 * user did not type. If it is wrong, someone loads the wrong bar. Nothing in
 * the suite asserted anything about plate maths on screen before this — the
 * maths had tests, the surface had none.
 */

function renderCard(weight: number, bar = 20, expanded = false) {
  const onToggle = vi.fn()
  render(
    <PlateCard
      weight={weight}
      unit="kg"
      bar={bar}
      expanded={expanded}
      detailsId="load-details"
      onToggle={onToggle}
    />,
  )
  return { onToggle }
}

describe('PlateCard', () => {
  it('writes the loading as an addition ending in the total', () => {
    renderCard(62.5)
    expect(screen.getByText('20 + 1.25 = 62.5')).toBeInTheDocument()
  })

  it('names the bar alone when there is nothing to load', () => {
    renderCard(20)
    expect(screen.getByRole('button')).toHaveTextContent('empty bar = 20 total')
  })

  it('states the bar rather than a total it cannot make below bar weight', () => {
    renderCard(15)
    expect(screen.getByRole('button')).toHaveTextContent('empty bar = 20 total')
  })

  it('reports what the plates make, not what was typed', () => {
    // 61 kg on a 20 kg bar needs 0.5 a side; the lightest plate is 1.25.
    renderCard(61)
    expect(screen.getByText('20 = 60')).toBeInTheDocument()
  })

  it('honours the selected bar', () => {
    renderCard(60, 15)
    expect(screen.getByText('20 + 2.5 = 60')).toBeInTheDocument()
  })

  it('is the disclosure control, and says what it opens', () => {
    renderCard(62.5)
    const card = screen.getByRole('button')
    expect(card).toHaveAttribute('aria-expanded', 'false')
    expect(card).toHaveAttribute('aria-controls', 'load-details')
    expect(card).toHaveTextContent('Plates & warm-up')
  })

  it('reports its open state', () => {
    renderCard(62.5, 20, true)
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  })

  it('opens on press', async () => {
    const user = userEvent.setup()
    const { onToggle } = renderCard(62.5)
    await user.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('isolates the maths so Arabic cannot reorder it', () => {
    const { container } = render(
      <PlateCard
        weight={62.5}
        unit="kg"
        bar={20}
        expanded={false}
        detailsId="load-details"
        onToggle={vi.fn()}
      />,
    )
    const isolated = container.querySelector('[dir="ltr"]')
    expect(isolated).toHaveTextContent('20 + 1.25 = 62.5')
  })
})
