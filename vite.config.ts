import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
// One constant, shared with the app so the worker and `device-reset.ts`
// cannot disagree about which cache holds cross-account data.
import { READ_CACHE } from '@wazn/core/cache-names'
import pkg from './package.json' with { type: 'json' }

const slim = (name: string) =>
  fileURLToPath(new URL(`./build/supabase-slim/${name}.ts`, import.meta.url))

export default defineConfig({
  // The version the Settings footer prints. Read from package.json rather
  // than typed into a string somewhere: a version a human has to remember to
  // bump is a version that is wrong the first time it matters, which is when
  // somebody is reporting a bug against it.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: {
      // 78 KiB of `@supabase` client that Wazn has no feature for: realtime
      // (plus its phoenix websocket layer) and file storage. Neither can be
      // tree-shaken — `SupabaseClient`'s constructor instantiates both — and
      // both land in the chunk that has to parse before the auth gate. See
      // build/supabase-slim/ for what the stubs implement and why the Proxy
      // in them is what keeps this off the auth path's critical list.
      //
      // Aliases, not `resolutions`: this affects the browser bundle only.
      // `tsc` still resolves the real packages, so the types stay honest, and
      // vitest has its own config and keeps the real modules.
      '@supabase/realtime-js': slim('realtime-js'),
      '@supabase/storage-js': slim('storage-js'),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Wazn',
        short_name: 'Wazn',
        description: 'Strength training log',
        dir: 'ltr',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f0d0a',
        // v5's ground. One theme now, so the installed PWA's chrome is fixed.
        theme_color: '#0f0d0a',
        // One tile, both purposes. Through v2 the mark was the وزن barbell
        // running the full width of the icon, so a maskable crop — up to 20%
        // off every edge — cut the sleeves off and needed a separate inset
        // file. v3's mark is a centred plate at 52.6% of the tile: it sits
        // well inside the safe circle, and a second rendering of the same
        // artwork would only be another thing to forget to regenerate.
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // The app shell is precached; Supabase reads are cached at runtime
        // instead (see `runtimeCaching` below). Precaching an API response
        // would freeze it at install time, which is the opposite of what a
        // NetworkFirst route does — there, the network always wins when there
        // is one, and the cache only answers a dead radio.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // The Hevy import is excluded from the shell, not from the build.
        //
        // It writes to Supabase, so it cannot do anything without a network
        // regardless; precaching it would spend 13 KiB of every install to
        // make a once-in-a-lifetime screen open marginally faster while
        // online. It is fetched on demand and, like the lazy tabs, wrapped in
        // `lazyScreen` so a chunk retired by a deploy reloads once instead of
        // dying. This also keeps the precache under the ~600 KiB ceiling the
        // parity plan §4 sets, which it had just gone over — both reasons are
        // real and the first one is why this is the right place to cut.
        //
        // The three lazy tabs are out for the same reason, added in U3b when
        // the offline work pushed the precache to 600.15 KiB — 0.15 over the
        // ceiling, exactly the breach STATUS predicted the next UI phase would
        // cause. Progress, Coach and Friends read their data through RPCs and
        // an Edge Function, all of which are POSTs, which the Cache API cannot
        // store. So precaching those chunks buys nothing offline: the tab
        // would open and have nothing in it. They are still cached at runtime
        // the first time they are opened (see `runtimeCaching`), which covers
        // the case that matters — a tab you use, in a gym you have been to
        // before — without spending 42 KiB of every install on tabs a new user
        // may never open at all.
        //
        // B1's briefing and debrief are deliberately NOT in this list and
        // never will be: they live on the Log and finish screens, in the main
        // chunk, and both draw their figures from SQL with the phrased line
        // optional. They are the two coach surfaces that DO work offline.
        globIgnores: [
          '**/HevyImport-*.js',
          '**/ProgressScreen-*.js',
          '**/CoachScreen-*.js',
          '**/FriendsScreen-*.js',
        ],
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            /**
             * The chunks that are no longer precached, cached once they are
             * used. Stale-while-revalidate rather than CacheFirst so a chunk
             * is never pinned: the background revalidation keeps it current,
             * and a hashed filename means a new build asks for a new name
             * anyway.
             *
             * This also makes the deploy break these tabs used to die from
             * (see lib/lazy-screen.ts) less likely rather than more: a page
             * open across a deploy asks for a hash Vercel has retired, and a
             * runtime cache that already has it answers where the network 404s.
             */
            urlPattern:
              /\/assets\/(ProgressScreen|CoachScreen|FriendsScreen|HevyImport)-[^/]+\.js$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'wazn-screens',
              expiration: { maxEntries: 12 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            /**
             * Last-known reads for the gym dead zone — U3b, trust-ladder rung
             * 4. History and Progress fetch their own data and neither has an
             * offline path of its own; NetworkFirst gives them one for the
             * price of this block. The Log screen does not rely on it: it
             * keeps a structured cache in IndexedDB, because it needs to know
             * WHEN the data was true in order to stamp it.
             *
             * `rpc/` is excluded, and not by choice. Supabase RPCs are POSTs,
             * the Cache API can only store GETs, and Workbox will not match a
             * non-GET request at all — so `previous_session` and every other
             * RPC are outside what a service worker can do anything about.
             * The parity plan's U3 text asks for previous-session caching
             * here; it is not implementable here, and it is implemented in
             * `lib/offline-store.ts` instead. See DECISIONS.md.
             *
             * Cross-account safety: the Cache API keys on URL alone and these
             * responses vary by `Authorization`, so a second account on one
             * phone could read the first's history from here. Two things stop
             * it — NetworkFirst means a live answer always wins, and
             * `lib/device-reset.ts` empties this cache when the signed-in user
             * changes.
             */
            urlPattern: /\/rest\/v1\/(?!rpc\/)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: READ_CACHE,
              // A dead radio must not hold a screen for thirty seconds before
              // falling back. Three is longer than any real response here.
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 64, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
        // BOTH FALSE ON PURPOSE, and this is the fix for a real outage: after
        // every deploy, Progress, Coach and Friends broke for anyone whose
        // page was already open.
        //
        // `autoUpdate` turns these on by default, which means a new worker
        // seizes a running page and its precache stops listing the chunk
        // hashes that page is about to import. Vercel's alias only serves the
        // current build, so the fetch that follows is a 404 and the three lazy
        // tabs die. Reproduced end to end; see lib/lazy-screen.ts.
        //
        // Off, the new worker installs and then waits. The live page keeps the
        // assets it booted with, and the update applies on the next launch —
        // which for an installed PWA is the next time the app is opened. A
        // version lag of one session is the price, and it is the right price
        // for an app whose §2.1 rule is that nothing interrupts a workout.
        skipWaiting: false,
        clientsClaim: false,
      },
    }),
  ],
})
