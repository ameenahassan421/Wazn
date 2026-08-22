import { AppState, Platform } from 'react-native'
import * as Notifications from 'expo-notifications'

import { snapshot, subscribe } from '@/state/live-workout'

/** Just the translate function, passed in rather than imported: this module is
 *  not a component and cannot call `useLocale`, and the ROOT LAYOUT is rendered
 *  outside `LocaleProvider`, so there is no hook to reach from here either. */
type Translate = (key: string, params?: Record<string, string>) => string

/**
 * The rest timer, when the phone is in a pocket.
 *
 * ── WHY THIS IS THE CAPABILITY, NOT A NICETY ────────────────────────────────
 * The rest countdown already survives backgrounding: `restEndsAt` is a
 * wall-clock instant, so locking the phone and coming back shows the right
 * number. What it cannot do is TELL you. A lifter who pockets their phone
 * between sets gets nothing at zero, which is the one moment the app exists to
 * mark. WAZN_PLAN calls this the capability that justifies stage 4A.
 *
 * ── IT WATCHES THE STORE, IT IS NOT CALLED BY IT ────────────────────────────
 * `restEndsAt` is written in three places — banking a set starts it, `endRest`
 * clears it, `adjustRest` moves it — and the first version of this put a
 * `syncRestAlarm` call beside each. CI rejected that in 52 seconds:
 * `live-workout.ts` is state, vitest tests it headlessly, and importing this
 * service dragged `react-native/index.js` and its Flow syntax into a node test
 * run. The local wall missed it because `bundle:ios` bundles for a phone,
 * where those imports are exactly right.
 *
 * So `watchRest` subscribes instead. The store stays portable and headless,
 * I/O stays at the edge, and a fourth writer of `restEndsAt` cannot forget to
 * sync, because a subscriber cannot be forgotten by code that does not know it
 * exists. There is still no separate "cancel": a cancel is a `restEndsAt` of
 * null, which is just another value to react to.
 *
 * ── IT NEVER FIRES WHILE YOU ARE LOOKING AT THE CANVAS ──────────────────────
 * The rest canvas is a full-screen countdown. A banner saying "rest is over"
 * on top of a screen already saying 0:00 is noise, and iOS shows foreground
 * notifications only if the handler says to. So the handler suppresses
 * presentation while `AppState` is `active` and allows it otherwise. The
 * notification is still SCHEDULED in both cases: the app can go to the
 * background at any point during the rest, including a second before zero, and
 * deciding at schedule time would be deciding on stale information.
 *
 * ── PERMISSION IS ASKED ON THE FIRST REST, NOT AT LAUNCH ────────────────────
 * iOS gives an app one prompt. Spending it on launch, before a lifter has
 * logged anything, is spending it on somebody who does not yet know what the
 * app does. The first rest is the first moment the permission has an obvious
 * meaning, and a refusal costs only this feature: everything is wrapped so a
 * denied permission degrades to the silent countdown that already worked.
 */

/**
 * The Android channel, created before anything is scheduled against it.
 *
 * `scheduleNotificationAsync` below passes `channelId: 'rest'` on Android, and
 * on Android 8+ a notification posted to a channel that was never created is
 * **not presented**. It does not throw either, so the alarm would have failed
 * silently on every Android phone — and `syncRestAlarm`'s deliberate bare
 * `catch` would have swallowed even the error that did not happen.
 *
 * Found by a peer session auditing capability on 2026-08-21, hours after this
 * file shipped. It could not have been caught here: verification ran on an iOS
 * simulator, where the `channelId` is stripped, and there is no Android device
 * or emulator in this environment. Worth stating plainly rather than filing as
 * a typo — "verified on a device" meant verified on ONE platform's device, and
 * the file's own comment claimed a cross-platform behaviour it had never seen.
 *
 * `HIGH` importance, because this is a timer the lifter deliberately set and
 * the whole feature is that it reaches a pocket.
 */
if (Platform.OS === 'android') {
  void Notifications.setNotificationChannelAsync('rest', {
    name: 'Rest timer',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  })
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: AppState.currentState !== 'active',
    shouldShowList: AppState.currentState !== 'active',
    shouldPlaySound: AppState.currentState !== 'active',
    shouldSetBadge: false,
  }),
})

/**
 * Asked once per app run, on the first rest.
 *
 * `undetermined` is the only state that prompts. `denied` returns false
 * without prompting — iOS would not show a second prompt anyway, and asking
 * again every set would be the behaviour that gets an app deleted.
 */
async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync()
  if (current.granted) return true
  if (!current.canAskAgain) return false
  const asked = await Notifications.requestPermissionsAsync()
  return asked.granted
}

/**
 * Point the alarm at `endsAt`, or clear it when null.
 *
 * Never throws and never blocks the caller: this is called from the set-banking
 * path, and a notification framework having a bad day must not be able to
 * interfere with logging a set. Failures are swallowed deliberately — the
 * countdown on screen is the source of truth and it keeps working.
 */
export function syncRestAlarm(
  endsAt: number | null,
  secondsTotal = 0,
  t: Translate = (k) => k,
): void {
  void (async () => {
    try {
      /*
       * Cancel ALL, rather than tracking the id of the one we scheduled.
       *
       * The id lived in a module-level `let` until a Fast Refresh proved why
       * that cannot work: the reload reset the variable to null while iOS
       * still held the scheduled notification, orphaning an alarm nothing
       * could then cancel. A JS reload in development is an app RESTART in
       * production, and scheduled notifications deliberately survive restarts —
       * so a lifter who force-quit mid-rest and reopened to skip it would still
       * be buzzed by the alarm for a rest they had ended.
       *
       * This app has exactly one alarm at a time, so "cancel everything we
       * scheduled" and "cancel the rest alarm" are the same statement, and the
       * one that cannot lose track of its own state is the better one.
       */
      await Notifications.cancelAllScheduledNotificationsAsync()
      if (endsAt === null) return

      /*
       * Permission FIRST, and then a DATE trigger. Both halves of that order
       * matter, and the interval version got both wrong.
       *
       * It computed `seconds` from `endsAt` and only then awaited
       * `ensurePermission()`. On the very first rest that await shows the iOS
       * permission sheet and blocks for as long as the lifter takes to read
       * it — caught on a simulator, where the sheet sat for about forty
       * seconds and the alarm would have fired forty seconds late, at 2:40 of
       * a two-minute rest. Every later rest was correct, so this is a bug that
       * only ever hurts the first one, which is also the only one a new user
       * ever judges the feature by.
       *
       * A DATE trigger removes the class rather than the instance. `restEndsAt`
       * IS a wall-clock instant — `live-workout.ts` stores it that way on
       * purpose, so rest survives backgrounding — and turning an instant into
       * a duration is a lossy conversion that is only correct if nothing
       * happens between the arithmetic and the scheduling call. Handing iOS
       * the instant means no arithmetic can go stale.
       */
      if (!(await ensurePermission())) return

      /*
       * Re-checked after the await, not before: a rest can be skipped or run
       * out while the permission sheet is up, and firing an alarm for a rest
       * that already ended would buzz a lifter mid-set.
       */
      if (endsAt - Date.now() < 1000) return

      await Notifications.scheduleNotificationAsync({
        content: {
          /*
           * Translated, and it was hardcoded English until a peer session
           * caught it hours after this shipped. Every other string a lifter
           * can read goes through the catalogue; this one bypassed it, so an
           * Arabic phone would have buzzed in English. The notification is
           * arguably the MOST important string to localise, because it is the
           * only one the app says while nobody is looking at it.
           */
          title: t('rest.alarm.title'),
          body:
            secondsTotal > 0
              ? t('rest.alarm.body', { n: String(secondsTotal) })
              : t('rest.alarm.body.plain'),
          sound: true,
          interruptionLevel: 'timeSensitive',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: endsAt,
          ...(Platform.OS === 'ios' ? {} : { channelId: 'rest' }),
        },
      })
    } catch {
      // See the doc comment: logging a set outranks notifying about one.
    }
  })()
}

/**
 * Start watching the live workout's rest, and return the unsubscribe.
 *
 * Called once from the root layout, so the alarm is armed for the whole app
 * session rather than for as long as some screen happens to be mounted — the
 * rest canvas can be navigated away from and the alarm still has to fire.
 *
 * `last` makes this idempotent: the store notifies on every state change,
 * including every set banked and every field typed, and rescheduling an
 * identical alarm on each of those would cancel and recreate the notification
 * dozens of times a workout.
 */
export function watchRest(t: Translate): () => void {
  let last: number | null = snapshot().restEndsAt
  syncRestAlarm(last, snapshot().restTotal, t)
  return subscribe(() => {
    const { restEndsAt, restTotal } = snapshot()
    if (restEndsAt === last) return
    last = restEndsAt
    syncRestAlarm(restEndsAt, restTotal, t)
  })
}
