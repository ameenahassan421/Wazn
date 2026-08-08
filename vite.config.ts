import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const slim = (name: string) =>
  fileURLToPath(new URL(`./build/supabase-slim/${name}.ts`, import.meta.url))

export default defineConfig({
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
      includeAssets: [
        'icon.svg',
        'icon-192.png',
        'icon-512.png',
        'icon-maskable-512.png',
      ],
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
        background_color: '#0c0b0a',
        theme_color: '#0c0b0a',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // A separate, inset mark. Reusing the "any" icon here let a
          // circular mask cut the sleeves off the bar — maskable crops up
          // to 20% from every edge, and the wordmark runs full width.
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell only. Supabase calls always go to the network — slice 1 has
        // no offline sync, and a cached API response would show stale sets.
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
        globIgnores: ['**/HevyImport-*.js'],
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [],
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
