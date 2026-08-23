# Android release: getting Wazn onto Google Play

> Written 2026-08-23 against `main` @ `c0c15d4`, Expo SDK `~57.0.13`,
> React Native `0.86.2`. Every Play requirement below was read from Google's
> own documentation on that date, not recited. Re-check the two dated items in
> §1 before acting on them, they are the only parts of this document with a
> clock attached.

## 0. The two things that decide the timeline

Everything else in this document is a checklist. These two are the plan.

### 0.1 Register the Play account as an ORGANIZATION, not as a personal account

**This is worth at least two weeks and it is decided at signup, once, with no
way back.**

Google requires every **personal** developer account created on or after
2023-11-13 to run a closed test with **12 testers opted in continuously for 14
days** before it may apply for production access. It applies _per app_.
Organization accounts are not subject to it.
([Play Console Help](https://support.google.com/googleplay/android-developer/answer/14151465))

Wazn has **zero users**. On a personal account the sequence is: recruit 12
people, keep all 12 opted in for 14 unbroken days, then apply for production,
then wait for review. On an organization account it is: submit, wait for
review.

Ameen owns **Rooted Wellness & Recovery LLC**, a Minnesota Chapter 319B
professional firm. That is an existing legal entity, which is what an
organization account needs. Registering under it converts the single largest
schedule risk in this document into a form field.

An organization account requires a D-U-N-S number, which is free from
Dun & Bradstreet and takes up to 30 days to issue, so **start that first**.
It is the long pole and it is free. Verify the current requirement in the Play
Console signup flow; Google has changed the org-verification bar more than once.

> If the D-U-N-S wait is unacceptable and a personal account is chosen anyway,
> the 14-day clock should start the same day the first internal build works.
> The testers can be friends; they must merely stay opted in. Do not discover
> this requirement after the app is otherwise ready.

### 0.2 Target API 36 before the 2026-08-31 deadline

From **31 August 2026**, new app submissions must target **Android 16
(API 36)** or higher. An extension to 1 November 2026 can be requested.
([Android Developers](https://developer.android.com/google/play/requirements/target-sdk),
[Play Console Help](https://support.google.com/googleplay/android-developer/answer/11926878))

That is **eight days** from the date on this document. This is not a reason to
rush a submission, nothing ships in eight days, but it does mean the build
must be produced against API 36 from the first upload, and that
`expo-build-properties` should pin it explicitly rather than inheriting
whatever the SDK defaults to. See §3.

---

## 1. What Ameen has to buy or create himself

Nothing in this section can be done from a session; all of it is an errand.

| Item                                | Cost     | Unlocks                              | Notes                                              |
| ----------------------------------- | -------- | ------------------------------------ | -------------------------------------------------- |
| D-U-N-S number                      | Free     | The organization Play account (§0.1) | Up to 30 days. **Start today.**                    |
| Google Play Developer account       | $25 once | Everything                           | Register as the LLC, not as a person               |
| Google Cloud project + OAuth client | Free     | Google sign-in, the hero auth path   | `docs/auth-social-setup.md`                        |
| Apple Developer Program             | $99/yr   | The iOS half                         | Not needed for Play, listed so it is not forgotten |
| Expo account                        | Free     | EAS Build, which produces the AAB    | `eas login`                                        |

## 2. `eas.json` does not exist yet

`mobile/eas.json` is **absent**, which means there is no build pipeline at all.
`expo export` produces a JS bundle and never an installable artifact. Create it
at `mobile/eas.json`:

```json
{
  "cli": { "version": ">= 12.0.0", "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "production": {
      "autoIncrement": true,
      "android": { "buildType": "app-bundle" }
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "../secrets/play-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

Three things in that file are decisions, not boilerplate:

- **`"buildType": "app-bundle"` on production.** Play requires an AAB for new
  apps; an APK upload is rejected. The `preview` profile stays an APK on
  purpose, an APK can be sideloaded onto a phone in one command, which is what
  makes it useful for the first real-device run.
- **`appVersionSource: "remote"` with `autoIncrement`.** `versionCode` must
  rise on every upload and Play rejects a repeat. Letting EAS own the counter
  removes the one piece of release state a human reliably forgets. It also
  means `versionCode` should NOT be hand-written into `app.config.ts`.
- **The service-account key path points OUTSIDE `mobile/`, at
  `secrets/`.** That file is a credential with upload rights to the Play
  listing. It must be gitignored. `CLAUDE.md`'s rule that the service-role key
  is script-only is the same rule and the same reasoning.

## 3. `app.config.ts` changes

What is already correct, verified at `c0c15d4`:

- `android.package` is set from `BUNDLE_ID` (`app.config.ts:145`)
- adaptive icon with foreground **and** monochrome layers (`:148`), the
  monochrome layer being the thing most apps get wrong
- `minSdkVersion: 24` (`:257`)
- an `https` intent filter for `www.trywazn.app/join` (`:158`), so invite links
  open the app
- `scheme: 'wazn'` (`:100`)

What has to change:

1. **Pin the target SDK explicitly.** In the `expo-build-properties` block
   beside the existing `android: { minSdkVersion: 24 }`, add
   `compileSdkVersion: 36` and `targetSdkVersion: 36`. Inheriting the SDK
   default works right up until it does not, and §0.2 has a date on it.
2. **Do not add `android.versionCode`** if `eas.json` uses
   `appVersionSource: "remote"`. Two counters is one counter too many.
3. **Decide `version`.** It is `'0.1.0'` (`:101`). A store listing showing
   `0.1.0` reads as unfinished to a reviewer and to a user. `1.0.0` is the
   honest number for a first public release.

**Permissions audit.** Play's Data Safety form asks about every permission the
merged manifest requests, including ones a library adds without being asked.
`expo prebuild` is what merges them, so the only reliable way to answer is to
read the generated file rather than the config:

```bash
cd mobile
npx expo prebuild --platform android --clean
grep 'uses-permission' android/app/src/main/AndroidManifest.xml
```

Do that before filling in the form. `expo-notifications` alone contributes
several, and on Android 13+ `POST_NOTIFICATIONS` is a runtime prompt the rest
timer depends on.

## 4. Account deletion: DONE 2026-08-23

Both stores require it; Apple rejects without an in-app path
(Guideline 5.1.1(v)) and Play requires the in-app path **plus** a
web-accessible URL. It was filed as a requirement in
`docs/archive/IMPLEMENTATION_PROMPTS.md:891` and had never been built.

Now shipped:

- `supabase/functions/delete-account/index.ts`: one service-role call to
  `auth.admin.deleteUser`, which is the whole operation because all nineteen
  user-owned tables cascade from `auth.users` (verified against
  `pg_constraint`). It reads the deletion back rather than trusting the
  success flag.
- `mobile/app/delete-account.tsx`: a screen, not an `Alert`, because
  `Alert.prompt` is iOS-only and the typed confirmation has to exist on
  Android too.
- `public/delete-account.html`, served at **`https://www.trywazn.app/delete-account`**
  , this is the URL to paste into the Play Console's Data Safety section.

**Not yet deployed.** Merging to `main` deploys Edge Functions
(`deploy-functions.yml`), so the function goes live on merge. Nothing has been
merged.

## 5. Privacy policy

`public/privacy.html` exists, is standalone, and is served at
`https://www.trywazn.app/privacy`. That satisfies the policy-URL field.

**It contains a false statement and must be corrected before submission.**
`public/privacy.html:110` says _"Wazn has no passwords, you get a six-digit
code by email."_ That rule was explicitly reversed on 2026-08-07: email +
password is now one of the four ways in (`CLAUDE.md`, Hard rules). A privacy
policy that misdescribes credential handling is the wrong document to be
casual about, and it is the document a reviewer reads.

## 6. Data Safety form

Answer from the schema and the services, not from memory. What Wazn actually
collects, per the tables that cascade from `auth.users`:

| Play category            | Collected | Purpose                    | Notes                                     |
| ------------------------ | --------- | -------------------------- | ----------------------------------------- |
| Email address            | Yes       | Account management         | Required for sign-in                      |
| Name / username          | Yes       | Account management, social | `profiles.username`, optional             |
| Health & fitness         | Yes       | App functionality          | Workouts, sets, body weight, check-ins    |
| App activity             | Yes       | App functionality          | Coach views                               |
| Crash logs / diagnostics | Yes       | Diagnostics                | `client_errors`                           |
| Location                 | **No**    | n/a                        | Nothing requests it                       |
| Contacts                 | **No**    | n/a                        | Invites are codes, never a contact scrape |
| Financial info           | **No**    | n/a                        | No payments                               |
| Advertising              | **No**    | n/a                        | No ad SDK is installed today              |

Declare: data **is** encrypted in transit; users **can** request deletion, with
the URL from §4. Do not claim "data is not collected" because it is the user's
own log, Play counts anything leaving the device, and this app writes all of
it to Supabase.

## 7. Store listing assets

| Asset             | Spec           | Status                                                                                                  |
| ----------------- | -------------- | ------------------------------------------------------------------------------------------------------- |
| App icon          | 512×512 PNG    | `mobile/assets/images/icon.png` exists, confirm dimensions                                              |
| Feature graphic   | 1024×500 PNG   | **Missing.** Required.                                                                                  |
| Phone screenshots | 2-8, min 320px | **Missing.** `npm run shots` renders the web app, not the native one, take them on a simulator/emulator |
| Short description | ≤80 chars      | Not written                                                                                             |
| Full description  | ≤4000 chars    | Not written                                                                                             |
| Content rating    | Questionnaire  | Fitness app, no objectionable content, expect Everyone                                                  |

`PRODUCT.md` has the positioning to write both descriptions from: _"the
training app that knows how you are doing and adjusts, with a logbook good
enough that you never think about it."_

## 8. Build and submit

```bash
cd mobile
npm ci
npx eas login
npx eas build:configure          # writes the EAS project id into app.config.ts

npx eas build --platform android --profile preview      # APK, sideload to a real phone
npx eas build --platform android --profile production   # AAB for Play

npx eas submit --platform android --latest
```

**Run the preview APK on a real Android device before the production build.**
Nothing has ever executed this app on Android, CI runs `expo export`, which is
Metro producing a bundle and never a runtime. The first Android boot will find
things, and it is better that it finds them before a review queue does.

## 9. Ordered checklist

| #   | Item                                                   | Blocks release                   | Effort                             | Owner         |
| --- | ------------------------------------------------------ | -------------------------------- | ---------------------------------- | ------------- |
| 1   | Apply for a D-U-N-S number for the LLC                 | Yes (§0.1)                       | 10 min, then up to 30 days waiting | Ameen         |
| 2   | Register Play account **as organization**              | Yes                              | 30 min + $25                       | Ameen         |
| 3   | Merge account deletion to `main`                       | Yes                              | Done, needs review + merge         | Claude        |
| 4   | Fix the privacy-policy password claim                  | Yes                              | 5 min                              | Claude        |
| 5   | Write `mobile/eas.json`                                | Yes                              | 15 min                             | Claude        |
| 6   | Pin `targetSdkVersion: 36`, bump `version` to `1.0.0`  | Yes (§0.2)                       | 10 min                             | Claude        |
| 7   | `expo prebuild` + read the merged manifest permissions | Yes                              | 20 min                             | Claude        |
| 8   | Build preview APK, run on a real Android phone         | Yes                              | 1 h + fixes                        | Both          |
| 9   | Google OAuth client                                    | No, but it is the hero auth path | 30 min                             | Ameen         |
| 10  | Feature graphic + screenshots                          | Yes                              | 2 h                                | Ameen         |
| 11  | Short + full description                               | Yes                              | 1 h                                | Claude drafts |
| 12  | Data Safety + content rating in Play Console           | Yes                              | 45 min                             | Ameen         |
| 13  | Production build, submit to internal track             | Yes                              | 1 h                                | Both          |

**The critical path is item 1.** It is free, it takes ten minutes to start, and
everything else can proceed in parallel while it clears.

## 10. What this document does not cover

- **iOS.** Apple sign-in becomes mandatory the moment Google sign-in ships on
  iOS, and that needs the $99 account. Separate document when it is time.
- **Wear OS.** Parked. `docs/` has no plan for it and this release does not
  need one.
- **In-app purchases.** No payments exist; Play's billing policy is not
  engaged.
