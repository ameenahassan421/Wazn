// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { UnitProvider } from '../lib/unit-context'
import { LocaleProvider } from '../lib/locale-context'
import { Header } from './Header'

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: { signOut: vi.fn() },
  },
}))

// The overflow menu renders only while a workout is open, so the tests that
// care about it need to say which world they are in.
const active = vi.hoisted(() => ({ current: null as null | { discard: () => void } }))
vi.mock('../lib/active-workout', () => ({
  useActiveWorkout: () => active.current,
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
  active.current = null
  document.documentElement.removeAttribute('dir')
  document.documentElement.removeAttribute('lang')
})

/**
 * The language and unit chips used to live here and are now on Settings —
 * the audit's S3 finding, two set-once preferences renting the best space in
 * the app. Their tests went with them to SettingsScreen.test.tsx; what is
 * left here is what the header still owes.
 */
describe('the settings door', () => {
  it('opens Settings from the avatar', async () => {
    const user = userEvent.setup()
    const onOpenSettings = vi.fn()
    render(<Header name="ameen" onOpenSettings={onOpenSettings} />, {
      wrapper: Wrapper,
    })

    await user.click(screen.getByRole('button', { name: 'You — settings' }))
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })

  it('names the door in the locale the reader is in', () => {
    localStorage.setItem('workout.locale', 'ar')
    render(<Header onOpenSettings={vi.fn()} />, { wrapper: Wrapper })
    expect(screen.getByRole('button', { name: 'أنت — الإعدادات' })).toBeInTheDocument()
  })
})

describe('the overflow menu', () => {
  it('is absent with no workout open', () => {
    render(<Header onOpenSettings={vi.fn()} />, { wrapper: Wrapper })
    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument()
  })

  it('offers discard while a workout is open, and arms before it fires', async () => {
    const user = userEvent.setup()
    const discard = vi.fn()
    active.current = { discard }
    render(<Header onOpenSettings={vi.fn()} />, { wrapper: Wrapper })

    await user.click(screen.getByRole('button', { name: 'Menu' }))
    const item = screen.getByRole('menuitem', { name: 'Discard workout' })

    await user.click(item)
    expect(discard).not.toHaveBeenCalled()
    await user.click(screen.getByRole('menuitem', { name: 'Discard workout?' }))
    expect(discard).toHaveBeenCalledOnce()
  })

  it('no longer carries sign out — Settings owns it', async () => {
    const user = userEvent.setup()
    active.current = { discard: vi.fn() }
    render(<Header onOpenSettings={vi.fn()} />, { wrapper: Wrapper })

    await user.click(screen.getByRole('button', { name: 'Menu' }))
    expect(
      screen.queryByRole('menuitem', { name: /sign out/i }),
    ).not.toBeInTheDocument()
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
    render(<Header titleKey="nav.history" onOpenSettings={vi.fn()} />, {
      wrapper: Wrapper,
    })

    expect(screen.getByRole('heading')).toHaveTextContent('History')
    expect(screen.queryByText('nav.history')).not.toBeInTheDocument()
  })

  it('follows the locale', () => {
    localStorage.setItem('workout.locale', 'ar')
    render(<Header titleKey="nav.history" onOpenSettings={vi.fn()} />, {
      wrapper: Wrapper,
    })

    expect(screen.getByRole('heading')).toHaveTextContent('السجل')
  })
})
