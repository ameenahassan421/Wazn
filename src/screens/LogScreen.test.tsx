// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { LocaleProvider } from '../lib/locale-context'
import { UnitProvider } from '../lib/unit-context'
import { LogScreen } from './LogScreen'

/* ── Supabase mock ──────────────────────────────────────────────────────── */

/** Chainable thenable query builder: resolves {data:[], error:null}. */
function makeQuery() {
  const q: Record<string, unknown> = {
    select: vi.fn(() => q),
    order: vi.fn(() => q),
    range: vi.fn(() => q),
    eq: vi.fn(() => q),
    or: vi.fn(() => q),
    limit: vi.fn(() => q),
    is: vi.fn(() => q),
    single: vi.fn(() => q),
    maybeSingle: vi.fn(() => q),
  }
  q.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve)
  return q
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => makeQuery()),
    rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: null }, error: null }),
      ),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
  describeError: (action: string) => `${action} failed`,
  supabaseConfigError: null,
}))

vi.mock('../lib/use-rest-timer', () => ({
  useRestTimer: vi.fn(() => ({
    secondsLeft: null,
    active: false,
    start: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    editTime: vi.fn(),
  })),
}))

/* ── Providers ───────────────────────────────────────────────────────────── */

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

/* ── Tests ───────────────────────────────────────────────────────────────── */

describe('LogScreen locale strings', () => {
  it('renders the English loading string', async () => {
    render(
      <LogScreen
        userId="test-user"
        onOpenCoach={() => {}}
        onOpenHistory={() => {}}
        onOpenProgress={() => {}}
      />,
      {
        wrapper: Wrapper,
      },
    )
    await waitFor(() => {
      expect(screen.getByText('Loading…')).toBeInTheDocument()
    })
  })

  it('renders the Arabic loading string when locale is ar', async () => {
    localStorage.setItem('workout.locale', 'ar')
    render(
      <LogScreen
        userId="test-user"
        onOpenCoach={() => {}}
        onOpenHistory={() => {}}
        onOpenProgress={() => {}}
      />,
      {
        wrapper: Wrapper,
      },
    )
    await waitFor(() => {
      expect(screen.getByText('جارٍ التحميل…')).toBeInTheDocument()
    })
  })
})
