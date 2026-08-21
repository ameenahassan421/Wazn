import type { ExpoConfig } from 'expo/config'

/**
 * Wazn, as a native app.
 *
 * A `.ts` config rather than `app.json` because the ground colour and the
 * bundle identifier are the kind of value that ends up typed twice — once
 * here and once in the splash plugin — and drifts. Here they are constants.
 *
 * The domain is `www.trywazn.app`, and it was `wazn.app` here until
 * 2026-08-19. `wazn.app` is registered and parked: its nameservers are
 * Namecheap's, nothing is served, and HTTPS to it fails to connect. Production
 * web and every real invite link are `https://www.trywazn.app/join/<code>`
 * (`src/lib/invite.ts`), so a universal link claimed on `wazn.app` could never
 * fire from a link a lifter actually receives. Claim what is served.
 *
 * `scheme: 'wazn'` is the custom scheme and is unrelated to either domain; it
 * is the fallback door and stays as it is.
 *
 * Neither entry below is sufficient on its own. iOS verifies
 * `https://www.trywazn.app/.well-known/apple-app-site-association` and Android
 * verifies `/.well-known/assetlinks.json`, and both files name an identifier
 * this project does not have yet (an Apple Team ID, and the Android signing
 * cert's SHA-256). Until they are served, these entries are correct and inert:
 * the link opens the website. `expo-router` still routes `join/[code]` from
 * the custom scheme meanwhile.
 */

/** The paper ground, from `src/lib/tokens.ts`. Native config is JSON by the
 *  time EAS reads it, so this cannot be an import from the token module — it
 *  is the one duplicated colour in the project, and `check:tokens` asserts it
 *  against `palette.paper`.
 *
 *  That last sentence was FALSE from the day it was written until 2026-08-20:
 *  `check_tokens.ts` had never opened this file. It was found while changing
 *  the ground from iron to paper, which is exactly the change a stale third
 *  copy survives. The assertion is real now, and it was proved to fail on a
 *  deliberate mismatch rather than assumed to work. Keep the literal on one
 *  line and keep the name `PAPER` — the regex looks for both. */
const PAPER = '#f7f3ec'
const BUNDLE_ID = 'app.wazn.client'

const config: ExpoConfig = {
  name: 'Wazn',
  slug: 'wazn',
  scheme: 'wazn',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  /**
   * Light, not `automatic`. The system has one ground and it is paper; a
   * lifter whose phone is in dark mode should not get a half-translated app.
   * (This said `dark` and `#0f0d0a` until 2026-08-20, when the prototype
   * replaced v5 — the ONE dark surface left is the rest canvas, which the app
   * paints itself.)
   */
  userInterfaceStyle: 'light',
  backgroundColor: PAPER,
  /** Fonts ship inside the bundle as TTFs from `@expo-google-fonts/*`, so the
   *  app looks like itself with no network at all — the same reasoning that
   *  made the PWA self-host its woff2 instead of hitting Google. */
  assetBundlePatterns: ['**/*'],

  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    /** The rest timer keeps counting with the screen off, and a workout in
     *  progress is the one thing this app must never lose. */
    infoPlist: {
      UIBackgroundModes: ['audio'],
      ITSAppUsesNonExemptEncryption: false,
    },
    associatedDomains: ['applinks:www.trywazn.app'],
  },

  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      backgroundColor: PAPER,
      foregroundImage: './assets/images/android-icon-foreground.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    // `edgeToEdgeEnabled` is gone from the Android config in SDK 57 — edge to
    // edge is unconditional there, which is what this app wanted anyway.
    predictiveBackGestureEnabled: false,
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: 'www.trywazn.app', pathPrefix: '/join' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },

  /**
   * The web target. Stage 4A's whole premise is that "migrate to Expo" costs a
   * web CODEBASE, not a web TARGET: Expo Router builds to web through
   * react-native-web, which this package already depended on before the
   * decision was taken.
   *
   * `output: 'single'` and not 'static' on purpose, for now. Static
   * prerendering runs every route's render in Node at build time, which turns
   * any module-scope browser access anywhere in the tree into a build failure
   * rather than a runtime one. The app being replaced is a Vite SPA served
   * behind a rewrite, so 'single' is the shape production already has and the
   * smallest honest step. Revisit at phase A4, when the PWA is actually
   * retired and per-route HTML starts to buy something.
   */
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/images/favicon.png',
  },

  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    /** Mandatory in the iOS build the moment Google sign-in exists there —
     *  App Store rule, and one of the four ways in that CLAUDE.md fixes. */
    'expo-apple-authentication',
    [
      'expo-splash-screen',
      {
        backgroundColor: PAPER,
        image: './assets/images/splash-icon.png',
        imageWidth: 96,
      },
    ],
    [
      'expo-build-properties',
      {
        // 16.4 is SDK 57's floor, and stated rather than left to the default
        // so a future SDK bump that raises it is a visible decision. Lower
        // would reach more phones and the toolchain will not build it.
        ios: { deploymentTarget: '16.4' },
        android: { minSdkVersion: 24 },
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },

  extra: {
    /**
     * The publishable Supabase keys, read from the environment at build time.
     * `EXPO_PUBLIC_*` would also work and is inlined the same way — this is
     * routed through `extra` so there is exactly one place to look for what
     * the client is given.
     *
     * The service-role key is NOT here and never will be: it is script-only
     * (CLAUDE.md), and anything in this file ships inside the app bundle
     * where any user can read it.
     */
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  },
}

export default config
