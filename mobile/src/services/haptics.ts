import * as Haptics from 'expo-haptics'

/**
 * The taps.
 *
 * ── WHY THIS IS A SERVICE AND NOT A CALL SITE ───────────────────────────────
 * A haptic is feedback about MEANING, not about a press. If every `Pressable`
 * buzzed, the buzz would carry no information — which is the state most apps
 * are in. So the vocabulary is closed, four entries, each named for what it
 * confirms rather than for how it feels. Adding a fifth should feel like a
 * decision, and having to open this file is the friction that makes it one.
 *
 * ── THE ONE THAT MATTERS ────────────────────────────────────────────────────
 * `banked`. The app's whole job is "log a set in under 30 seconds, one hand",
 * usually while looking at a bar rather than a screen. The commit confirming
 * itself through the hand is the difference between glancing down to check and
 * not having to — it is the single biggest thing native gives this app that
 * the PWA could not, and it is why `Haptics.notificationAsync(Success)` is
 * used rather than a plain impact: it is a two-beat pattern the thumb can
 * recognise without attention.
 *
 * Every call is fire-and-forget. A haptic that made the commit path wait on a
 * promise would be a haptic that cost a frame, and nothing on the logging path
 * is allowed to cost a frame.
 */

/** Silence everything. Wired to the Settings toggle; a gym is loud, and some
 *  people find a buzzing phone mid-set worse than useless. */
let enabled = true

export function setHapticsEnabled(next: boolean) {
  enabled = next
}

function fire(run: () => Promise<void>) {
  if (!enabled) return
  // Deliberately unawaited, and deliberately swallowing: a device with no
  // taptic engine rejects, and a set must not fail to log because of it.
  void run().catch(() => {})
}

/** A set is on the board. The one haptic that carries real information. */
export function banked() {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
}

/** A stepper tick — weight or reps changed by one step. Light, because it
 *  fires in bursts when somebody holds the button down. */
export function tick() {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light))
}

/** Rest is over. The timer stays SILENT (do-not-regress §5) — this is the
 *  only way it is allowed to announce itself, and it is felt, not heard. */
export function restEnded() {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium))
}

/** An all-time record. The only celebratory haptic in the app. */
export function record() {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
}
