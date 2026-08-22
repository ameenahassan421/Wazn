# Running Wazn on your own iPhone, without the $99

Verified 2026-08-22 on this machine: Xcode 26.6, `mobile/ios` prebuilt with Pods
installed, and a **device build succeeding unsigned** for `generic/platform=iOS`.
Everything below is about code signing, which is the only remaining step.

## What the $99 actually buys

Not this. The Apple Developer Program fee buys **distribution**: TestFlight, the
App Store, and sharing a build with other people. Running your own app on your
own device is **free provisioning**, and any Apple ID can do it.

What free provisioning costs you instead: the certificate lasts **7 days**. After
that the app refuses to launch and you rebuild. Nothing is lost, it is one
command.

## Expo Go will not work, and it is worth knowing why

The obvious free path is Expo Go, and it would crash on launch here. `mobile/`
depends on `expo-glass-effect`, `@expo/ui`, `expo-apple-authentication` and
`expo-notifications`, none of which Expo Go ships on SDK 57. Expo Go can only
run the modules compiled into it, so an app with custom native dependencies
needs its own build. That is what the steps below produce.

## First, the thing that will otherwise stop you dead

**A personal team cannot provision three of this app's capabilities.** Apple's
own words, from a failed repair on 2026-08-22:

> Cannot create a iOS App Development provisioning profile for
> "app.wazn.client". Personal development teams, including "Ameen Hassan", do
> not support the **Push Notifications, Associated Domains, and Sign In with
> Apple** capabilities.

An earlier version of this document listed those as features that "do not work"
on a free certificate. That was wrong in a way that matters: they do not
degrade, they make the build **unsignable**. Nothing installs at all.

Wazn declares all three, and `mobile/ios/Wazn/Wazn.entitlements` is GENERATED,
so deleting them by hand is undone by the next prebuild. Hence a flag:

```bash
export WAZN_FREE_PROVISIONING=1
```

Set it in the shell you build from. **It is off by default**, so EAS and every
real build still get the full capability set.

Verified with `expo config --type introspect`: with the flag the iOS
entitlements are `{}`, and without it all three are present.

Removing the two plugins from `plugins` was necessary and **not sufficient**,
because Expo autolinks config plugins from installed packages. `app.config.ts`
appends a `withEntitlementsPlist` mod that deletes the keys after the autolinked
plugins have run.

## One-time setup

1. **Add your Apple ID to Xcode.** Xcode, Settings, Accounts, `+`, Apple ID. The
   free one you already have is fine.
2. **Regenerate the native project with the flag set**, because the entitlements
   file is what signing reads:

   ```bash
   cd mobile
   export WAZN_FREE_PROVISIONING=1
   npx expo prebuild --platform ios --clean
   cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install && cd ..
   ```

3. **Pick the team on the target.** Open the workspace:

   ```bash
   open mobile/ios/Wazn.xcworkspace
   ```

   Select the `Wazn` target, **Signing & Capabilities**, tick **Automatically
   manage signing**, and choose your name under Team (it appears as
   `Your Name (Personal Team)`).

   This is the step that cannot be scripted from here: the project has **no
   `DEVELOPMENT_TEAM` set** and the value is specific to your Apple ID.

   After step 2 the Signing pane should show no Push Notifications, Associated
   Domains or Sign In with Apple rows. If it still does, the flag was not set
   when prebuild ran.

4. **Enable Developer Mode on the phone.** Plug it in, unlock it, trust the Mac.
   iOS 16 and later: Settings, Privacy & Security, Developer Mode, on, reboot.

### The bundle identifier may need one character changed

The project builds `app.wazn.client`. Free provisioning registers that ID to your
Apple ID, and it must be globally unique across Apple's systems. If Xcode reports
the bundle identifier is unavailable, change it in the same Signing pane to
something like `app.wazn.client.ameen`.

**That is a local change and it should not be committed.** `app.config.ts` is
what EAS reads for a real build, and editing it to suit one developer's free
certificate is how the App Store build ends up with the wrong ID.

## Every time

```bash
cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo run:ios --device
```

Pick your phone from the list it prints.

**The locale is not decoration.** `expo run:ios` shells out to `pod install` in
its own environment, and without `LANG`/`LC_ALL` CocoaPods dies with
`Unicode Normalization not appropriate for ASCII-8BIT`, which reads like a
CocoaPods bug and is a shell encoding. CLAUDE.md records the day that cost.

**Do not pass a UDID to `--device`.** Given one it routes to a path that
demands a distribution certificate and stops on `No code signing certificates
are available`, which is a confusing error on a machine that has a perfectly
good free certificate. The bare flag prompts, and the prompt works.

## What works on a free certificate, and what does not

|                                                      |                                                       |
| ---------------------------------------------------- | ----------------------------------------------------- |
| The whole app, on your device                        | yes                                                   |
| The rest-timer alarm                                 | **yes**, it is a LOCAL notification                   |
| Deep links                                           | **yes**, via the `wazn://` scheme: `wazn://join/CODE` |
| Universal links (`https://www.trywazn.app/join/...`) | no, Associated Domains is stripped                    |
| Push notifications from a server                     | no, and the entitlement is stripped                   |
| Sign in with Apple                                   | no, and the entitlement is stripped                   |
| Giving the build to somebody else                    | no, that is what the $99 buys                         |

The rest alarm is the one worth calling out. **Local notifications need no
`aps-environment` entitlement**, so dropping the push capability does not touch
it, and it is the capability WAZN_PLAN calls the justification for stage 4A.
Autolinking still compiles `expo-notifications`; only the plugin's entitlement is
removed.

Invites are still testable without universal links: paste `wazn://join/CODE` into
Safari on the device, or use the code directly.

## If it will not launch after a week

That is the certificate expiring, not a bug. Re-run the command above.
