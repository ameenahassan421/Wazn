/**
 * A stand-in for `@supabase/realtime-js`, aliased in at build time only.
 *
 * WHY: 56.5 KiB of the main chunk — realtime-js plus the `@supabase/phoenix`
 * websocket layer it pulls in — was shipping to every user to support a
 * feature Wazn does not have. Nothing in `src/` calls `.channel()`,
 * `.getChannels()` or `.removeChannel()`; there is no subscription anywhere in
 * the app. It could not be tree-shaken out: `SupabaseClient`'s constructor
 * instantiates `RealtimeClient` unconditionally, and supabase-js re-exports
 * the whole module (`export * from "@supabase/realtime-js"`).
 *
 * That weight is not abstract. It sits in the chunk that must parse before the
 * auth gate, which is the chunk U7 measured a 2308ms cold start against a
 * 2000ms budget, and it counts against the ~600 KiB precache ceiling the
 * parity plan §4 sets.
 *
 * WHAT SUPABASE-JS ACTUALLY CALLS on this object, read out of
 * `dist/index.mjs` at 2.111.0 rather than assumed:
 *
 *   - `setAuth(token?)` — on SIGNED_IN, TOKEN_REFRESHED, INITIAL_SESSION and
 *     SIGNED_OUT. Return value unused, never awaited.
 *   - `channel` / `getChannels` / `removeChannel` / `removeAllChannels` — only
 *     from the matching `SupabaseClient` methods, which nothing here calls.
 *
 * THE PROXY IS THE SAFETY, and it is the reason this is not reckless.
 * `setAuth` runs inside the auth state-change callback, so a method missing
 * from this file would throw on every token refresh — an auth break, which is
 * the one category CLAUDE.md says to be careful with. Any property supabase-js
 * reaches for, now or after an upgrade, resolves to a no-op instead of
 * `undefined`. The failure mode of a future version is "realtime silently does
 * nothing", which is already true, rather than "sign-in breaks".
 *
 * If Wazn ever wants realtime — a live friends feed, a shared session — delete
 * the alias in `vite.config.ts` and this directory. That is the whole undo.
 */

/** Named so a stack trace says what it is. */
class DisabledRealtimeClient {
  /** The one method on the auth path. Deliberately silent, deliberately safe. */
  setAuth(): void {}

  /**
   * Loud, unlike the rest. Reaching this means someone wrote a subscription,
   * and a channel that silently never fires is a bug that takes a day to find.
   */
  channel(): never {
    throw new Error(
      'Realtime is not bundled in Wazn. Remove the alias in vite.config.ts to enable it.',
    )
  }

  getChannels(): never[] {
    return []
  }

  removeChannel(): 'ok' {
    return 'ok'
  }

  removeAllChannels(): never[] {
    return []
  }
}

const noop = (): void => {}

export const RealtimeClient = new Proxy(DisabledRealtimeClient, {
  construct(target) {
    const instance = new target()
    return new Proxy(instance, {
      get(object, property, receiver) {
        if (property in object) return Reflect.get(object, property, receiver)
        // The upgrade guard. An unknown method is a no-op, never a TypeError.
        return noop
      },
    })
  },
})

/**
 * Re-exported by supabase-js (`export * from`), so the names have to exist even
 * though nothing constructs them. They are types to every consumer that
 * matters; these are the runtime husks.
 */
export const RealtimeChannel = class {}
export const RealtimePresence = class {}
export const REALTIME_LISTEN_TYPES = {}
export const REALTIME_SUBSCRIBE_STATES = {}
export const REALTIME_POSTGRES_CHANGES_LISTEN_EVENT = {}
export const REALTIME_CHANNEL_STATES = {}
