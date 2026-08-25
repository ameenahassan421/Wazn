import type { ExpoConfig } from 'expo/config'
import { withEntitlementsPlist } from 'expo/config-plugins'

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

/** The iron ground, `palettes.dark.paper`. Same duplication and the same
 *  reason as PAPER above, so it is asserted the same way: keep the literal on
 *  one line and keep the name `IRON`, because `check_tokens.ts` looks for
 *  both. Added 2026-08-23 with the dark theme. */
const IRON = '#0f0d0a'
const BUNDLE_ID = 'app.wazn.client'

/**
 * Build for a FREE Apple developer account.
 *
 * ── WHY THIS FLAG HAS TO EXIST ──────────────────────────────────────────────
 * A personal team cannot create a provisioning profile for an app that
 * declares Push Notifications, Associated Domains, or Sign In with Apple.
 * Apple's own words, from a failed repair on 2026-08-22:
 *
 *   Cannot create a iOS App Development provisioning profile for
 *   "app.wazn.client". Personal development teams, including "Ameen Hassan",
 *   do not support the Push Notifications, Associated Domains, and Sign In
 *   with Apple capabilities.
 *
 * These are not degraded features on a free account, they are a hard STOP:
 * the build cannot be signed at all, so `docs/run-on-device.md` was wrong to
 * describe them as things that "do not work". Nothing installs.
 *
 * Wazn declares all three, and `mobile/ios/Wazn/Wazn.entitlements` is
 * GENERATED, so hand-deleting them is undone by the next prebuild. Hence a
 * config flag rather than a note telling somebody to edit a generated file.
 *
 * ── WHAT IT COSTS, AND WHAT IT DOES NOT ─────────────────────────────────────
 * Off: universal links (`https://www.trywazn.app/join/...` opening the app),
 * Sign in with Apple, and server push. **The `wazn://` custom scheme still
 * handles deep links**, so an invite is testable by pasting `wazn://join/CODE`.
 *
 * **The rest alarm still works**, which is the point. It is a LOCAL
 * notification, and local notifications need no `aps-environment` entitlement:
 * dropping the `expo-notifications` PLUGIN removes the entitlement it injects
 * while autolinking still compiles the module. That matters because the alarm
 * is what WAZN_PLAN calls the justification for stage 4A, and it stays
 * testable on a free account.
 *
 * ── OFF BY DEFAULT, AND THAT IS LOAD-BEARING ────────────────────────────────
 * EAS and every real build read this file with the variable unset and get the
 * full capability set. A flag that defaulted the other way would ship an App
 * Store build with no universal links and no Apple sign-in, which is the kind
 * of thing nobody notices until a review rejection.
 *
 *   WAZN_FREE_PROVISIONING=1 npx expo prebuild --platform ios --clean
 */
const FREE_PROVISIONING = process.env.WAZN_FREE_PROVISIONING === '1'

/** One entry of `plugins`. Named because a conditional spread of a tuple
 *  widens to `(string | object)[]` and stops matching Expo's own type. */
type Plugin = NonNullable<ExpoConfig['plugins']>[number]

const config: ExpoConfig = {
  name: 'Wazn',
  slug: 'wazn',
  scheme: 'wazn',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  /**
   * `automatic`, and this is LOAD-BEARING rather than a preference.
   *
   * On iOS this writes `UIUserInterfaceStyle` into Info.plist, and `light`
   * there does not mean "default to light", it means the OS reports light to
   * the app no matter what the phone is set to. So `useColorScheme()` would
   * return `'light'` forever and the theme setting's DEFAULT, System, would
   * silently never follow anything. Explicit Dark would still have worked,
   * which is what makes it a bad failure: the one path most likely to get
   * tested is the one path unaffected.
   *
   * It said `light` with a comment arguing "the system has one ground and it
   * is paper" (2026-08-20), and before that `dark` with `#0f0d0a`. Both were
   * true when written. Ameen asked for the choice on 2026-08-22.
   *
   * Changing this needs a prebuild to reach a device: it is Info.plist, not
   * JavaScript, so a JS reload will not pick it up.
   */
  userInterfaceStyle: 'automatic',
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
    /* Omitted on a free team: Associated Domains is one of the three
       capabilities a personal team cannot provision. The Android intent
       filter below is unaffected. */
    ...(FREE_PROVISIONING ? {} : { associatedDomains: ['applinks:www.trywazn.app'] }),
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
    /**
     * SYSTEM_ALERT_WINDOW, out of the shipped manifest.
     *
     * "Draw over other apps" is a permission Play reviews and this app has no
     * feature that needs it. It reached the manifest by accident of tooling:
     * React Native declares it in `ReactAndroid/src/debug/AndroidManifest.xml`
     * for the dev overlay, and prebuild writes it into `src/main`, which is the
     * source set a RELEASE aab is built from. So a permission that exists for
     * the redbox would have been on the store listing, asking to be explained.
     *
     * `blockedPermissions` is the supported knob and emits `tools:node="remove"`
     * in the merged manifest, so it also removes the debug source set's copy.
     * That is the trade: a dev client loses the floating dev overlay. The dev
     * MENU is reached by shaking the device or `adb shell input keyevent 82`,
     * and neither needs this.
     *
     * The two storage permissions stay. They come from `expo-file-system` and
     * `expo-image`, they carry `android:maxSdkVersion="32"`, and so they are
     * not requested at all on Android 13 and above. Removing them would break
     * image caching on older devices to answer a question nobody is asking.
     *
     * **None of this has been COMPILED.** `mobile/android/` generates and has
     * never been built: no JDK, no SDK, and the plan says not to install 12 to
     * 16 GB of one. Verified by regenerating and reading the manifest, which is
     * where the merger writes its result, and no further.
     */
    blockedPermissions: ['android.permission.SYSTEM_ALERT_WINDOW'],
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
    /** Crash reporting. Added 2026-08-23, and until then this app had NONE.
     *
     *  The web app writes failures to `client_errors` and wraps the tree in an
     *  error boundary; the native app had neither, and `report-error` was not
     *  even exported through `portable.ts`. A crash on a stranger's phone was
     *  invisible forever, which is the wrong state to publish in.
     *
     *  No `dsn` key here. The DSN is a build-time value read from the
     *  environment in `extra` below, so a fork or a local build without one
     *  degrades to "reporting is off" rather than to somebody else's project.
     *
     *  Kept OUT of the `FREE_PROVISIONING` branch on purpose: it injects no
     *  entitlement, so a personal-team build reports crashes exactly like a
     *  provisioned one. */
    '@sentry/react-native/expo',
    /** Mandatory in the iOS build the moment Google sign-in exists there —
     *  App Store rule, and one of the four ways in that CLAUDE.md fixes.
     *
     *  Dropped under `WAZN_FREE_PROVISIONING`: it injects
     *  `com.apple.developer.applesignin`, which a personal team cannot
     *  provision, and its presence blocks signing entirely. */
    ...(FREE_PROVISIONING ? [] : (['expo-apple-authentication'] as Plugin[])),
    /** The rest alarm — `services/rest-alarm.ts` is the only caller.
     *
     *  Registered as a plugin rather than left to autolinking for ONE reason:
     *  Android's small notification icon must be a monochrome silhouette or
     *  the system renders a filled white blob. `android-icon-monochrome.png`
     *  already is one, so it is reused rather than a seventh asset drawn.
     *
     *  No `color` key, deliberately. It would put an ember hex in this file,
     *  and this file's own comment above explains what a colour literal here
     *  costs: `check_tokens.ts` asserts PAPER by name and would not see it, so
     *  it would be a third copy of the palette with nothing checking it. The
     *  tint defaults to the system accent, which is worth more than an
     *  unguarded literal. */
    /*
     *  Dropped under `WAZN_FREE_PROVISIONING`, and ONLY the plugin is dropped.
     *
     *  `withNotificationsIOS.js:12` sets `aps-environment`, which a personal
     *  team cannot provision. Autolinking still compiles the native module, and
     *  LOCAL notifications need no entitlement, so the rest alarm keeps working
     *  on a free build. What is lost is the Android monochrome icon config,
     *  which is irrelevant to a local iOS build.
     */
    ...(FREE_PROVISIONING
      ? []
      : ([
          [
            'expo-notifications',
            { icon: './assets/images/android-icon-monochrome.png' },
          ],
        ] as Plugin[])),
    [
      'expo-splash-screen',
      {
        backgroundColor: PAPER,
        image: './assets/images/splash-icon.png',
        imageWidth: 96,
        /* The splash is native and paints before any JavaScript runs, so it
           cannot read the stored choice. Without this branch a dark-theme
           launch flashes the paper ground and then drops to iron on the first
           frame, which is the one moment of the app a lifter sees every single
           time they open it. `dark` follows the OS rather than the stored
           choice, so somebody who picked Light on a dark phone still gets one
           flash: the alternative is a native module reading AsyncStorage
           before the splash, which is a great deal of machinery for one frame.

           Same image, because the mark is ember on both grounds, and no
           `imageWidth` here: `getIosSplashConfig` reads that from the ROOT
           only (`root.imageWidth ?? 100`) and applies it to both themes, so a
           second copy would be a dead key that reads like a live one. */
        dark: {
          backgroundColor: IRON,
          image: './assets/images/splash-icon.png',
        },
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
    /**
     * Sentry's DSN. Public by design (it is an ingest endpoint, not a
     * credential), so it belongs here beside the anon key rather than in a
     * secret store. Empty means reporting is OFF, which is the correct state
     * for a local build and for anyone who forks this repo.
     */
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
    /**
     * Google's OAuth client id. Empty means the social path is not configured,
     * and the sign-in screen hides the button entirely rather than showing one
     * that explains itself.
     *
     * Until 2026-08-23 that button was the hero CTA on the first screen and
     * its handler only set an error reading "Google sign-in arrives with the
     * App Store build". In an App Store build that sentence is false about
     * itself, and the largest control a reviewer taps doing nothing is
     * Guideline 2.1's definition of an incomplete app.
     *
     * When this is set, Apple sign-in MUST ship in the same release: offering
     * any third-party social login on iOS makes Sign in with Apple mandatory
     * (Guideline 4.8).
     */
    googleClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '',
  },

  /**
   * Over-the-air updates.
   *
   * Without this, every fix is a new build and a new store review: days for a
   * typo. With it, a JavaScript-only change reaches phones in minutes, which
   * for a solo developer publishing a first app is the difference between a
   * bad week and a bad afternoon.
   *
   * `appVersion` policy, deliberately. The runtime version is tied to
   * `version` above, so an update can only land on a build whose native layer
   * it actually matches. The looser `sdkVersion` policy would happily push
   * JavaScript that calls a native module the installed binary does not have,
   * and that crashes on launch with no way back.
   *
   * `updates.url` is NOT written here: `eas init` generates the project id and
   * fills it in. Adding a guessed URL would point the app at a project that
   * does not exist.
   */
  runtimeVersion: { policy: 'appVersion' },
}

/**
 * Strip the three capabilities a personal team cannot provision.
 *
 * ── WHY REMOVING THE PLUGIN ENTRIES WAS NOT ENOUGH ──────────────────────────
 * Taking `expo-apple-authentication` and `expo-notifications` out of `plugins`
 * removes `associatedDomains` and looks like it should remove the rest. It does
 * not: **Expo AUTOLINKS config plugins from installed packages**, so both keep
 * applying from `node_modules` whether or not they are listed.
 *
 * Verified rather than assumed, on 2026-08-22. With the flag set AND the
 * generated `Wazn.entitlements` moved out of the way, `expo config --type
 * introspect` still emitted `aps-environment` and
 * `com.apple.developer.applesignin`. The first hypothesis, that introspect was
 * merely echoing the existing native file, was tested and rejected.
 *
 * So the removal has to happen AFTER the autolinked plugins run, which is what
 * a `withEntitlementsPlist` mod does: mods compose in order and this one is
 * appended last.
 *
 * It deletes rather than blanks. `withNotificationsIOS.js:11` sets
 * `aps-environment` only `if (!config.modResults['aps-environment'])`, so an
 * empty string would satisfy it and still ship a key the profile cannot carry.
 */
const stripFreeProvisioningBlockers = (c: ExpoConfig): ExpoConfig =>
  withEntitlementsPlist(c, (mod) => {
    delete mod.modResults['aps-environment']
    delete mod.modResults['com.apple.developer.applesignin']
    delete mod.modResults['com.apple.developer.associated-domains']
    return mod
  })

export default FREE_PROVISIONING ? stripFreeProvisioningBlockers(config) : config
