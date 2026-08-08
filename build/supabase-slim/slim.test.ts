import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { RealtimeClient } from './realtime-js'
import { StorageClient } from './storage-js'

/**
 * The stubs replace two real `@supabase` packages in the browser bundle, so
 * the thing worth testing is not the stubs' own behaviour — it is the contract
 * supabase-js holds them to, and whether an upgrade has changed it.
 *
 * That contract was read out of `dist/index.mjs`, not assumed, and the first
 * test re-reads it on every run. `setAuth` is the one that matters: supabase-js
 * calls it from the auth state-change handler on SIGNED_IN, TOKEN_REFRESHED,
 * INITIAL_SESSION and SIGNED_OUT. A stub that threw there would break sign-in
 * for everyone while saving 78 KiB, which is not a trade anyone would take.
 */

const require = createRequire(import.meta.url)
const supabaseSource = readFileSync(
  require.resolve('@supabase/supabase-js/dist/index.mjs'),
  'utf8',
)

/** Every `this.realtime.x` supabase-js actually calls, straight from its dist. */
function realtimeMembersUsedBySupabase(): string[] {
  const found = supabaseSource.matchAll(/this\.realtime\.([a-zA-Z_$][\w$]*)/g)
  return [...new Set([...found].map((m) => m[1]))].sort()
}

describe('the members supabase-js expects', () => {
  it('is the set this stub was written against', () => {
    // A failure here is not a break — the Proxy no-ops anything unlisted — but
    // it does mean an upgrade changed how supabase-js drives realtime, and
    // somebody should look at whether the new call wanted a real answer.
    expect(realtimeMembersUsedBySupabase()).toEqual([
      'channel',
      'getChannels',
      'removeAllChannels',
      'removeChannel',
      'setAuth',
    ])
  })

  it('still constructs storage exactly once and never calls into it', () => {
    expect(supabaseSource).toContain('new StorageClient(')
    expect(supabaseSource).not.toMatch(/this\.storage\.[a-zA-Z]/)
  })
})

describe('RealtimeClient stub', () => {
  it('takes the constructor arguments supabase-js passes', () => {
    expect(
      () => new RealtimeClient('wss://example.supabase.co/realtime/v1', {}),
    ).not.toThrow()
  })

  it('never throws on the auth path, with or without a token', () => {
    const client = new RealtimeClient('wss://example', {})
    expect(() => client.setAuth('a-jwt')).not.toThrow()
    expect(() => client.setAuth()).not.toThrow()
  })

  it('answers the channel-management calls without inventing state', () => {
    const client = new RealtimeClient('wss://example', {})
    expect(client.getChannels()).toEqual([])
    expect(client.removeAllChannels()).toEqual([])
    expect(client.removeChannel()).toBe('ok')
  })

  it('no-ops a method it has never heard of, rather than throwing', () => {
    // The upgrade guard. `setAuth` runs inside the auth callback, so an
    // unrecognised call has to be survivable there.
    const client = new RealtimeClient('wss://example', {}) as unknown as Record<
      string,
      () => unknown
    >
    expect(() => client.someMethodAddedInAFutureVersion()).not.toThrow()
  })

  it('is loud about an actual subscription, which would silently never fire', () => {
    const client = new RealtimeClient('wss://example', {})
    expect(() => client.channel()).toThrow(/not bundled/i)
  })
})

describe('StorageClient stub', () => {
  it('constructs and no-ops unknown members', () => {
    const client = new StorageClient('https://example', {}, fetch) as unknown as Record<
      string,
      () => unknown
    >
    expect(() => client.anythingAtAll()).not.toThrow()
  })

  it('is loud about a real bucket call', () => {
    const client = new StorageClient('https://example', {}, fetch)
    expect(() => client.from()).toThrow(/not bundled/i)
  })
})
