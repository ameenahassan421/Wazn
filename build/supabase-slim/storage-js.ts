/**
 * A stand-in for `@supabase/storage-js`, aliased in at build time only.
 *
 * Same reasoning as the realtime stub next door, and a simpler case: 21.75 KiB
 * of file-upload client that `SupabaseClient` builds in its constructor and
 * then never touches itself. Wazn stores no files. Exercise thumbnails are
 * static assets under `/public/exercises`, copied at build time on purpose —
 * `scripts/match_exercise_images.ts` exists precisely so nothing is hotlinked
 * or fetched from a bucket.
 *
 * supabase-js only ever calls `new StorageClient(...)` and assigns it to
 * `.storage`. Nothing else, at 2.111.0. The Proxy covers the rest for the same
 * reason it does there: an upgrade must not be able to turn a byte saving into
 * a runtime error.
 *
 * Undo is the same — delete the alias in `vite.config.ts` and this directory.
 */

const noop = (): void => {}

class DisabledStorageClient {
  from(): never {
    throw new Error(
      'Storage is not bundled in Wazn. Remove the alias in vite.config.ts to enable it.',
    )
  }
}

export const StorageClient = new Proxy(DisabledStorageClient, {
  construct(target) {
    return new Proxy(new target(), {
      get(object, property, receiver) {
        if (property in object) return Reflect.get(object, property, receiver)
        return noop
      },
    })
  },
})

/** Imported by name in supabase-js's error handling, so it has to exist. */
export class StorageApiError extends Error {}
export class StorageError extends Error {}
export class StorageUnknownError extends Error {}
