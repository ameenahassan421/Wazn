// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  captureInviteFromUrl,
  clearInviteCode,
  peekInviteCode,
  takeInviteCode,
} from './invite'

/**
 * The invite path is the first thing a person who has never used Wazn touches,
 * and it runs before React does. These cover the cases that would silently
 * break the flow rather than fail loudly.
 */

function visit(path: string) {
  window.history.replaceState(null, '', path)
}

describe('captureInviteFromUrl', () => {
  beforeEach(() => {
    sessionStorage.clear()
    visit('/')
  })

  it('stashes the code and cleans the URL', () => {
    visit('/join/abcd1234efgh')
    captureInviteFromUrl()
    expect(peekInviteCode()).toBe('abcd1234efgh')
    // If the path survived, it would become the installed PWA's start_url and
    // every launch would be an invite landing.
    expect(window.location.pathname).toBe('/')
  })

  it('lowercases, so a code shared with capitals still resolves', () => {
    visit('/join/ABCD1234EFGH')
    captureInviteFromUrl()
    expect(peekInviteCode()).toBe('abcd1234efgh')
  })

  it('tolerates a trailing slash', () => {
    visit('/join/abcd1234efgh/')
    captureInviteFromUrl()
    expect(peekInviteCode()).toBe('abcd1234efgh')
  })

  it('cleans the URL even when the code is malformed', () => {
    // A junk path must not persist, or an install from this page bakes it in.
    visit('/join/nope')
    captureInviteFromUrl()
    expect(peekInviteCode()).toBeNull()
    expect(window.location.pathname).toBe('/')
  })

  it('rejects codes that the database constraint would reject', () => {
    for (const bad of ['short', 'has-a-dash12', 'way_too_long_to_be_a_code', '']) {
      sessionStorage.clear()
      visit(`/join/${bad}`)
      captureInviteFromUrl()
      expect(peekInviteCode()).toBeNull()
    }
  })

  it('ignores paths that are not invites', () => {
    visit('/history')
    captureInviteFromUrl()
    expect(peekInviteCode()).toBeNull()
    // Left alone: only /join/* is ours to rewrite.
    expect(window.location.pathname).toBe('/history')
  })

  it('does nothing on the ordinary root path', () => {
    visit('/')
    captureInviteFromUrl()
    expect(peekInviteCode()).toBeNull()
  })
})

describe('taking the code', () => {
  beforeEach(() => {
    sessionStorage.clear()
    visit('/join/abcd1234efgh')
    captureInviteFromUrl()
  })

  it('survives being read repeatedly before it is spent', () => {
    // The auth screen peeks to name the inviter; the welcome screen spends it
    // after sign-in. Peeking must not consume.
    expect(peekInviteCode()).toBe('abcd1234efgh')
    expect(peekInviteCode()).toBe('abcd1234efgh')
  })

  it('is spent exactly once', () => {
    expect(takeInviteCode()).toBe('abcd1234efgh')
    expect(takeInviteCode()).toBeNull()
  })

  it('can be abandoned', () => {
    clearInviteCode()
    expect(peekInviteCode()).toBeNull()
  })
})
