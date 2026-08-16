// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { LocaleProvider, useLocale } from '../lib/locale-context'
import { AuthScreen } from './AuthScreen'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      verifyOtp: vi.fn(),
      signInWithOtp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
  },
}))

vi.mock('../lib/invite', () => ({
  peekInviteCode: vi.fn(() => null),
}))

vi.mock('../lib/social', () => ({
  nameOf: vi.fn(() => 'Test User'),
  resolveInvite: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@wazn/core/auth-alias', () => ({
  passwordSignInForUsername: vi.fn(),
  requestCodeForUsername: vi.fn(),
  verifyCodeForUsername: vi.fn(),
}))

function Wrapper({ children }: { children: ReactNode }) {
  return <LocaleProvider>{children}</LocaleProvider>
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('dir')
  document.documentElement.removeAttribute('lang')
})

describe('Pre-auth language toggle', () => {
  it('renders the locale toggle button', () => {
    render(<AuthScreen />, { wrapper: Wrapper })
    expect(screen.getByRole('button', { name: /Switch to Arabic/i })).toHaveTextContent(
      'EN',
    )
  })

  it('clicking the toggle switches locale', async () => {
    const user = userEvent.setup()

    function Reader() {
      const { locale } = useLocale()
      return <span data-testid="locale">{locale}</span>
    }

    const { rerender } = render(
      <LocaleProvider>
        <AuthScreen />
        <Reader />
      </LocaleProvider>,
    )

    expect(screen.getByTestId('locale')).toHaveTextContent('en')

    await user.click(screen.getByRole('button', { name: /Switch to Arabic/i }))

    rerender(
      <LocaleProvider>
        <AuthScreen />
        <Reader />
      </LocaleProvider>,
    )

    expect(screen.getByTestId('locale')).toHaveTextContent('ar')
    expect(
      screen.getByRole('button', { name: /تبديل إلى الإنجليزية/i }),
    ).toHaveTextContent('AR')
  })
})

describe('AuthScreen strings from catalogue', () => {
  it('renders English strings by default', () => {
    render(<AuthScreen />, { wrapper: Wrapper })
    expect(screen.getByText('Log a set in under thirty seconds.')).toBeInTheDocument()
    expect(screen.getByText('Continue with Google')).toBeInTheDocument()
    expect(screen.getByText('Sign in')).toBeInTheDocument()
  })

  it('renders Arabic strings after locale switch', async () => {
    const user = userEvent.setup()
    render(<AuthScreen />, { wrapper: Wrapper })

    await user.click(screen.getByRole('button', { name: /Switch to Arabic/i }))

    expect(screen.getByText('سجّل مجموعة في أقل من ثلاثين ثانية.')).toBeInTheDocument()
    expect(screen.getByText('المتابعة مع Google')).toBeInTheDocument()
    expect(screen.getByText('تسجيل الدخول')).toBeInTheDocument()
  })
})
