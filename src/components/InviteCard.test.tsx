// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { LocaleProvider } from '../lib/locale-context'
import { InviteCard } from './InviteCard'
import { follow } from '../lib/social'

vi.mock('../lib/social', () => ({
  follow: vi.fn(),
  nameOf: vi.fn(() => 'Test User'),
}))

const inviter = { user_id: 'u1', username: 'testuser', display_name: 'Test User' }

function Wrapper({ children }: { children: ReactNode }) {
  return <LocaleProvider>{children}</LocaleProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('InviteCard', () => {
  it('offers to follow whoever sent the link', () => {
    render(<InviteCard inviter={inviter} />, { wrapper: Wrapper })
    expect(screen.getByText('You were invited')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Follow Test User' })).toBeInTheDocument()
  })

  it('follows, and then says so', async () => {
    vi.mocked(follow).mockResolvedValue(undefined as never)
    render(<InviteCard inviter={inviter} />, { wrapper: Wrapper })
    await userEvent.click(screen.getByRole('button', { name: 'Follow Test User' }))
    expect(follow).toHaveBeenCalledWith('u1')
    expect(
      await screen.findByRole('button', { name: 'Following Test User' }),
    ).toBeDisabled()
  })

  /*
   * A refused follow used to be swallowed to keep the first screen calm, and
   * that hid a real defect for as long as the feature existed: every follow
   * was being refused and the button simply did nothing.
   */
  it('says so when the follow is refused, rather than doing nothing', async () => {
    vi.mocked(follow).mockRejectedValue(new Error('nope'))
    render(<InviteCard inviter={inviter} />, { wrapper: Wrapper })
    await userEvent.click(screen.getByRole('button', { name: 'Follow Test User' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('nope')
  })
})
