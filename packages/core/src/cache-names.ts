/**
 * Names shared between the service worker and the app.
 *
 * Its own module, with nothing else in it, because both sides import it:
 * `vite.config.ts` (Node, at build time) and `device-reset.ts` (the browser).
 * Anything else living here would be dragged into the config bundle for no
 * reason, and a typo between the two would be a silent cross-account leak
 * rather than an error.
 */

/** Workbox's NetworkFirst cache of last-known Supabase reads. */
export const READ_CACHE = 'wazn-reads'
