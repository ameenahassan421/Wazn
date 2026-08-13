// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import type { ReactNode } from 'react'
import { LocaleProvider } from '../lib/locale-context'
import { ThemeProvider } from '../lib/theme-context'
import { UnitProvider } from '../lib/unit-context'
import { SettingsScreen } from './SettingsScreen'

const signOut = vi.hoisted(() => vi.fn())
vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: { signOut },
  },
}))
vi.mock('../lib/social', () => ({
  fetchMyProfile: () => Promise.resolve({ username: 'ameen' }),
}))

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <UnitProvider>{children}</UnitProvider>
      </LocaleProvider>
    </ThemeProvider>
  )
}

function open(props: Partial<Parameters<typeof SettingsScreen>[0]> = {}) {
  render(
    <SettingsScreen
      userId="u1"
      email="ameen@example.com"
      joinedAt="2025-10-04T10:00:00.000Z"
      onFriends={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
    { wrapper: Wrapper },
  )
}

beforeEach(() => {
  localStorage.clear()
  signOut.mockClear()
  document.documentElement.removeAttribute('dir')
})

/**
 * What this file is defending.
 *
 * These two controls came off the header, where they had been tapped by
 * accident mid-workout for months. A segmented control has a failure a toggle
 * does not: pressing the side that is already live must do nothing. If it
 * flips instead, the control reads as broken in exactly the moment somebody
 * is checking that their choice took.
 */
describe('Settings', () => {
  it('marks the live unit and leaves it alone when pressed again', async () => {
    const user = userEvent.setup()
    open()

    const kg = screen.getByRole('radio', { name: 'kg' })
    const lb = screen.getByRole('radio', { name: 'lb' })
    expect(lb).toHaveAttribute('aria-checked', 'true')

    await user.click(kg)
    expect(kg).toHaveAttribute('aria-checked', 'true')

    await user.click(kg)
    expect(kg).toHaveAttribute('aria-checked', 'true')
  })

  it('switches the language and takes the screen with it', async () => {
    const user = userEvent.setup()
    open()

    expect(screen.getByRole('heading', { name: 'You' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'العربية' }))
    expect(screen.getByRole('heading', { name: 'أنت' })).toBeInTheDocument()
  })

  it('offers both language names in their own scripts, always', () => {
    localStorage.setItem('workout.locale', 'ar')
    open()
    // The point of the control is picking the OTHER one, so neither option
    // may be translated into the locale currently running.
    expect(screen.getByRole('radio', { name: 'EN' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'العربية' })).toBeInTheDocument()
  })

  it('arms sign out before it fires', async () => {
    const user = userEvent.setup()
    open()

    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Sign out?' }))
    expect(signOut).toHaveBeenCalledOnce()
  })

  it('states the account without spelling out the joining day', async () => {
    open()
    expect(await screen.findByText(/ameen@example\.com/)).toHaveTextContent(
      /since \w+ 2025/,
    )
  })
})
