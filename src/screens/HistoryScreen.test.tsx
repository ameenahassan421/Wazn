// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { LocaleProvider } from '../lib/locale-context'
import { UnitProvider } from '../lib/unit-context'
import { HistoryScreen } from './HistoryScreen'

/* ── Supabase mock ──────────────────────────────────────────────────────── */

/** Chainable thenable query builder: `await from(...).select(...).order(...).range(...)` resolves `{data:[], error:null}`. */
function makeQuery() {
  const q: Record<string, unknown> = {
    select: vi.fn(() => q),
    order: vi.fn(() => q),
    range: vi.fn(() => q),
    eq: vi.fn(() => q),
    or: vi.fn(() => q),
    limit: vi.fn(() => q),
    single: vi.fn(() => q),
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
    },
  },
  describeError: (action: string) => `${action} failed`,
  supabaseConfigError: null,
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

describe('HistoryScreen locale strings', () => {
  it('renders the English empty-state message', async () => {
    render(<HistoryScreen onStart={() => {}} />, { wrapper: Wrapper })
    await waitFor(() => {
      expect(screen.getByText(/starts today/)).toBeInTheDocument()
    })
  })

  it('renders the Arabic empty-state message when locale is ar', async () => {
    localStorage.setItem('workout.locale', 'ar')
    render(<HistoryScreen onStart={() => {}} />, { wrapper: Wrapper })
    await waitFor(() => {
      expect(screen.getByText(/يبدأ اليوم/)).toBeInTheDocument()
    })
  })

  /*
   * The empty state's whole job. It used to be a sentence telling the reader
   * to use a tab that no longer exists — no control, nothing to press. If
   * this button ever goes back to being decoration, this fails.
   */
  it('offers a way out of the empty state, and it fires', async () => {
    const onStart = vi.fn()
    render(<HistoryScreen onStart={onStart} />, { wrapper: Wrapper })
    const cta = await screen.findByRole('button', { name: 'Start a workout' })
    fireEvent.click(cta)
    expect(onStart).toHaveBeenCalledTimes(1)
  })
})
