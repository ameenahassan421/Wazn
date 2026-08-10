// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { UnitProvider } from '../lib/unit-context'
import { LocaleProvider, useLocale } from '../lib/locale-context'
import { Header } from './Header'

// Minimal Supabase mock — supabase.auth.signOut is called from the Header menu.
vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: { signOut: vi.fn() },
  },
}))

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider>
      <UnitProvider>{children}</UnitProvider>
    </LocaleProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('dir')
  document.documentElement.removeAttribute('lang')
})

describe('Language toggle', () => {
  it('renders the locale label', () => {
    render(<Header />, { wrapper: Wrapper })
    expect(screen.getByRole('button', { name: /Switch to Arabic/i })).toHaveTextContent(
      'EN',
    )
  })

  it('clicking it calls setLocale with the other locale', async () => {
    const user = userEvent.setup()

    // Helper to read locale from context.
    function Reader() {
      const { locale } = useLocale()
      return <span data-testid="locale">{locale}</span>
    }

    const { rerender } = render(
      <LocaleProvider>
        <UnitProvider>
          <Header />
          <Reader />
        </UnitProvider>
      </LocaleProvider>,
    )

    expect(screen.getByTestId('locale')).toHaveTextContent('en')

    await user.click(screen.getByRole('button', { name: /Switch to Arabic/i }))

    rerender(
      <LocaleProvider>
        <UnitProvider>
          <Header />
          <Reader />
        </UnitProvider>
      </LocaleProvider>,
    )

    expect(screen.getByTestId('locale')).toHaveTextContent('ar')
    expect(
      screen.getByRole('button', { name: /تبديل إلى الإنجليزية/i }),
    ).toHaveTextContent('AR')
  })

  it('has an accessible name from the catalogue', () => {
    render(<Header />, { wrapper: Wrapper })
    const button = screen.getByRole('button', { name: /Switch to Arabic/i })
    expect(button).toHaveAttribute('aria-label', 'Switch to Arabic')
  })

  it('label updates when locale is ar', async () => {
    localStorage.setItem('workout.locale', 'ar')
    render(<Header />, { wrapper: Wrapper })
    expect(
      screen.getByRole('button', { name: /تبديل إلى الإنجليزية/i }),
    ).toHaveTextContent('AR')
  })
})

/**
 * Regression: the title arrives as a catalogue KEY, not a rendered string.
 *
 * App sits above LocaleProvider, so when it translated the title itself the
 * `t()` call hit the default context and returned the key — the header read
 * "nav.history" on screen, in both locales, with every check green. Translating
 * inside Header is the fix; these two assertions are what would have caught it.
 */
describe('title translation', () => {
  it('renders the translated title, never the raw key', () => {
    render(<Header titleKey="nav.history" />, { wrapper: Wrapper })

    expect(screen.getByRole('heading')).toHaveTextContent('History')
    expect(screen.queryByText('nav.history')).not.toBeInTheDocument()
  })

  it('follows the locale', async () => {
    const user = userEvent.setup()
    render(<Header titleKey="nav.history" />, { wrapper: Wrapper })

    await user.click(screen.getByRole('button', { name: 'Switch to Arabic' }))

    expect(screen.getByRole('heading')).toHaveTextContent('السجل')
  })
})
