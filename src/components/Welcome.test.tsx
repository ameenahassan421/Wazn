// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { LocaleProvider, useLocale } from '../lib/locale-context'
import { Welcome } from './Welcome'

vi.mock('../lib/invite', () => ({}))

vi.mock('../lib/social', () => ({
  follow: vi.fn(),
  resolveInvite: vi.fn(),
  nameOf: vi.fn(() => 'Test User'),
  saveProfile: vi.fn(),
}))

vi.mock('@wazn/core/auth-identity', () => ({
  USERNAME_RE: /^[a-zA-Z0-9_]{3,20}$/,
  normalizeUsername: vi.fn((v: string) => v.trim()),
}))

vi.mock('@wazn/core/use-auth', () => ({
  useAuth: vi.fn(() => ({ userId: 'test-user-id' })),
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
    render(
      <Welcome
        inviter={null}
        onGenerate={vi.fn()}
        onSkip={vi.fn()}
        onImport={vi.fn()}
      />,
      {
        wrapper: Wrapper,
      },
    )
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
        <Welcome
          inviter={null}
          onGenerate={vi.fn()}
          onSkip={vi.fn()}
          onImport={vi.fn()}
        />
        <Reader />
      </LocaleProvider>,
    )

    expect(screen.getByTestId('locale')).toHaveTextContent('en')

    await user.click(screen.getByRole('button', { name: /Switch to Arabic/i }))

    rerender(
      <LocaleProvider>
        <Welcome
          inviter={null}
          onGenerate={vi.fn()}
          onSkip={vi.fn()}
          onImport={vi.fn()}
        />
        <Reader />
      </LocaleProvider>,
    )

    expect(screen.getByTestId('locale')).toHaveTextContent('ar')
    expect(
      screen.getByRole('button', { name: /تبديل إلى الإنجليزية/i }),
    ).toHaveTextContent('AR')
  })
})

describe('Welcome strings from catalogue', () => {
  it('renders English strings by default', () => {
    render(
      <Welcome
        inviter={null}
        onGenerate={vi.fn()}
        onSkip={vi.fn()}
        onImport={vi.fn()}
      />,
      {
        wrapper: Wrapper,
      },
    )
    expect(screen.getByText('Welcome')).toBeInTheDocument()
    expect(screen.getByText('Log a set in under thirty seconds.')).toBeInTheDocument()
  })

  it('renders Arabic strings after locale switch', async () => {
    const user = userEvent.setup()
    render(
      <Welcome
        inviter={null}
        onGenerate={vi.fn()}
        onSkip={vi.fn()}
        onImport={vi.fn()}
      />,
      {
        wrapper: Wrapper,
      },
    )

    await user.click(screen.getByRole('button', { name: /Switch to Arabic/i }))

    expect(screen.getByText('مرحباً')).toBeInTheDocument()
    expect(screen.getByText('سجّل مجموعة في أقل من ثلاثين ثانية.')).toBeInTheDocument()
  })
})
