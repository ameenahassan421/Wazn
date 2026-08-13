// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { LocaleProvider } from '../lib/locale-context'
import { UnitProvider } from '../lib/unit-context'
import { ProgressScreen } from './ProgressScreen'

/* ── Supabase mock ──────────────────────────────────────────────────────── */

/** Chainable thenable query builder: `await from(...).select(...).or(...).order(...).limit(n)` resolves `{data:[], error:null}`. */
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

describe('ProgressScreen locale strings', () => {
  it('renders the English empty-state message', async () => {
    render(<ProgressScreen onOpenCoach={() => {}} onStart={() => {}} />, {
      wrapper: Wrapper,
    })
    await waitFor(() => {
      expect(screen.getByText('Log a workout to load the bar.')).toBeInTheDocument()
    })
  })

  it('renders the Arabic empty-state message when locale is ar', async () => {
    localStorage.setItem('workout.locale', 'ar')
    render(<ProgressScreen onOpenCoach={() => {}} onStart={() => {}} />, {
      wrapper: Wrapper,
    })
    await waitFor(() => {
      expect(screen.getByText('سجّل تمرينًا لتحميل العمود.')).toBeInTheDocument()
    })
  })
})
