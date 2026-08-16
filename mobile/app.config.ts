import type { ExpoConfig } from 'expo/config'

/**
 * Wazn, as a native app.
 *
 * A `.ts` config rather than `app.json` because the ground colour and the
 * bundle identifier are the kind of value that ends up typed twice — once
 * here and once in the splash plugin — and drifts. Here they are constants.
 *
 * `wazn.app` is the domain the web PWA and the invite links already use, so
 * the scheme and the associated-domain entry both point at it.
 */

/** The iron ground, from `src/lib/tokens.ts`. Native config is JSON by the
 *  time EAS reads it, so this cannot be an import from the token module — it
 *  is the one duplicated colour in the project, and `check:tokens` knows it:
 *  the value is asserted there rather than trusted here. */
const INK = '#0f0d0a'
const BUNDLE_ID = 'app.wazn.client'

const config: ExpoConfig = {
  name: 'Wazn',
  slug: 'wazn',
  scheme: 'wazn',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  /**
   * Dark, not `automatic`. v5 has one ground on native and a lifter who has
   * their phone in light mode should not get a half-translated app; the web
   * PWA keeps its paper theme, which is where that choice lives today.
   */
  userInterfaceStyle: 'dark',
  backgroundColor: INK,
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
    associatedDomains: ['applinks:wazn.app'],
  },

  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      backgroundColor: INK,
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
        data: [{ scheme: 'https', host: 'wazn.app', pathPrefix: '/join' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
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
        backgroundColor: INK,
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
