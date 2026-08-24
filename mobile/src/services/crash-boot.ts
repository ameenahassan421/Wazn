/**
 * Start crash reporting BEFORE anything else in the app is evaluated.
 *
 * `_layout.tsx` called `initCrashReporting()` in its module body, below its own
 * imports, and its comment claimed "this runs as the bundle evaluates" and
 * named the crashes it meant to catch: a bad font registration, a keychain read
 * that throws, a native module missing from the binary.
 *
 * ES imports are hoisted and fully evaluated before any module body runs, so
 * the six font faces, `services/supabase`, `services/rest-alarm`,
 * `state/live-workout` and `hooks/use-auth` had all already finished by the
 * time that line was reached. The exact bug the same release fixed,
 * `createClient('', '')` throwing during evaluation of `services/supabase`,
 * would have been reported by nothing.
 *
 * A module with one side effect, imported first, is the fix: import order IS
 * evaluation order, so this runs before the import on the line below it.
 * Nothing imports a value from here on purpose. Do not add one, or somebody
 * will sort it into the alphabetical block and quietly undo this.
 */
import { initCrashReporting } from './crash'

initCrashReporting()
